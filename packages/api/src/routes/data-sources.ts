import type { FieldValue, SealedV1 } from '@wechart/core';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { createHash, timingSafeEqual } from 'node:crypto';

import { INSTALL, USER } from '../auth/guard';
import { ROOT_FOLDER_ID } from '../repos/catalog';
import {
  DataSourceRefused,
  type DataSource,
  type DataSourceChange,
  type DataSourceStore,
  type Landing,
} from '../repos/data-sources';
import { XCUBE_PUBLIC_KEY, type XcubePublicKey } from '../secrets/xcube-key';
import type { ConnectionTest, ConnectionTestStore } from '../repos/connection-tests';
import { XcubeError } from '../xcube/client';
import {
  ConnectionRefused,
  type ConnectionHealth,
  type TestAnswer,
  type TestedConnection,
} from '../xcube/connections';
import { cubeStateOf } from '../xcube/cube-state';
import type { CubeUsing } from '../xcube/used-by';

/**
 * A data source's own routes (T335; AC-269, AC-164, AC-312, AC-161, AC-262,
 * AC-263): opened in its settings, made in a folder, changed and removed.
 *
 * A secret is said only as stored, `{ stored: true }` (AC-164): what the store
 * keeps is the envelope the browser sealed to xcube's key (AC-298, AC-325),
 * and it never leaves for the browser.
 *
 * Until workspaces (T343, T344), a read-write member changes a folder's data
 * sources in place, as a folder's models are published in place today; T344
 * makes shared items read-only and routes a change through a proposal.
 */
export type DataSourceAccess = (
  request: FastifyRequest,
  folderId: string,
  want: 'read' | 'write',
) => Promise<{ readonly status: number; readonly body: { readonly error: string } } | undefined>;

/**
 * Where a save lands before wechart commits it, and a removal first (T442):
 * xcube's connections. Each throws `DataSourceRefused` to refuse.
 */
export interface DataSourceLanding {
  /** Made ready for a folder before a save's transaction: it asks the database nothing after. */
  readonly prepare: (folderId: string) => Promise<Required<Pick<Landing, 'land' | 'unland'>>>;
  readonly unland: (source: DataSource) => Promise<void>;
}

/** As the browser sees one: its secrets named, never held out. */
export function viewOf(source: DataSource) {
  return {
    id: source.id,
    folderId: source.folderId,
    name: source.name,
    driver: source.driver,
    authMethod: source.authMethod,
    fields: source.fields,
    secrets: Object.fromEntries(source.secrets.map((field) => [field, { stored: true }])),
    version: source.version,
    updatedAt: source.updatedAt,
  };
}

const NOT_THERE = { error: 'There’s no such data source, or it isn’t yours to see.' };
const NO_SUCH_FOLDER = 'There’s no such folder, or it isn’t yours to see.';

/** The shared root's default data source, which the install Job seeds (T443, AC-310). */
const DEFAULT_SOURCE = 'default';

/** Whether a header carries the secret, compared in constant time over their digests. */
const sameSecret = (given: string | undefined, secret: string) =>
  given !== undefined &&
  timingSafeEqual(
    createHash('sha256').update(given).digest(),
    createHash('sha256').update(secret).digest(),
  );

/** The same fields and values, in whatever order they came. */
const sameFields = (
  a: Readonly<Record<string, FieldValue>>,
  b: Readonly<Record<string, FieldValue>>,
) =>
  Object.keys(a).length === Object.keys(b).length &&
  Object.entries(a).every(([key, value]) => Object.hasOwn(b, key) && b[key] === value);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isFieldValue = (value: unknown): value is FieldValue =>
  value === null || ['string', 'number', 'boolean'].includes(typeof value);

/** The body's fields and envelopes, typed, or why not. */
function readBody(body: unknown): { value?: Record<string, unknown>; error?: string } {
  if (!isRecord(body)) return { error: 'Send the data source as a JSON object.' };
  if (body['fields'] !== undefined) {
    const fields = body['fields'];
    if (!isRecord(fields) || !Object.values(fields).every(isFieldValue))
      return { error: 'fields are an object of text, numbers, true or false.' };
  }
  if (body['sealed'] !== undefined && !isRecord(body['sealed']))
    return { error: 'sealed is an object of envelopes, by field.' };
  for (const key of ['name', 'driver', 'authMethod', 'folderId', 'targetFolderId'])
    if (body[key] !== undefined && typeof body[key] !== 'string')
      return { error: `${key} is text.` };
  return { value: body };
}

export function registerDataSources(
  app: FastifyInstance,
  {
    store,
    access,
    key,
    seedToken,
    workspaceOf,
    landing,
    tester,
    tests,
    health,
    listing,
  }: {
    /**
     * For the Data sources page (T364, AC-157): which folders the request's
     * user sees every item of, and each folder's path from the root. Always
     * given, so no listing can fall back to showing every one (T364's review).
     */
    readonly listing: {
      readonly sees: (request: FastifyRequest) => Promise<(folderId: string) => boolean>;
      readonly pathOf: () => Promise<
        (folderId: string) => readonly { readonly id: string; readonly title: string }[]
      >;
      /**
       * The cubes xcube bound to each data source at publish, by the data
       * source's id (T459, AC-157). Unset without xcube; a failure is said as
       * none known.
       */
      readonly usedBy?: () => Promise<ReadonlyMap<string, readonly CubeUsing[]>>;
    };
    /** A data source's Cube instances' reports, from xcube (T365, AC-161). */
    readonly health?: (source: DataSource) => Promise<ConnectionHealth | undefined>;
    /** Each test of a stored data source, kept and listed (T362, AC-163). */
    readonly tests?: ConnectionTestStore;
    readonly store: DataSourceStore;
    readonly access: DataSourceAccess;
    readonly landing?: DataSourceLanding;
    /** xcube's connection test (T361, AC-159): Cube's own driver, at wechart's request. */
    readonly tester?: (body: TestedConnection) => Promise<TestAnswer>;
    /** xcube's public key, which the browser seals a typed secret to (T441, AC-325). */
    readonly key?: XcubePublicKey;
    /** The install Job's token (T443): with it, the root's `default` can be seeded. */
    readonly seedToken?: string;
    /** The workspace a folder is in, or null for a shared one (T343, T345). */
    readonly workspaceOf?: (folderId: string) => Promise<string | null>;
  },
): void {
  // Public by nature: it seals, and opens nothing (AC-298).
  app.get('/api/data-sources/sealing-key', USER, async (_request, reply) =>
    key === undefined
      ? reply.status(503).send({
          error: `wechart has no key to seal a data source’s secrets to: set ${XCUBE_PUBLIC_KEY}.`,
        })
      : { kid: key.kid, x: key.x },
  );

  // Landed in xcube before it is committed, where xcube is there (T442): made
  // ready for the folder before the store opens its transaction.
  const landingIn = async (folderId: string): Promise<Landing> =>
    landing === undefined ? {} : landing.prepare(folderId);
  /**
   * Why a workspace source may not take this name: its target folder holds
   * one of that name, which only a copy of it replaces (T345, AC-282; the
   * user's answer to question 30).
   */
  const clashIn = async (targetFolderId: string, name: string) =>
    (await store.inFolder(targetFolderId)).some((source) => source.name === name)
      ? {
          error: `Its target folder already holds a data source named “${name}”: only a copy of it replaces it. Give this one another name.`,
        }
      : undefined;
  /** Whether it sits in a workspace, where xcube holds none of it until previews (T347). */
  const inAWorkspace = async (source: DataSource) => (await workspaceOf?.(source.folderId)) != null;
  const refused = (reply: FastifyReply, error: unknown) => {
    if (error instanceof DataSourceRefused)
      return reply.status(error.status).send({ error: error.message, problems: error.problems });
    throw error;
  };
  /** The data source, where the request's user may `want` it; else the answer already sent. */
  const reached = async (
    request: FastifyRequest,
    reply: FastifyReply,
    want: 'read' | 'write',
  ): Promise<DataSource | undefined> => {
    const { id } = request.params as { id: string };
    const source = await store.get(id);
    if (source === undefined) {
      await reply.status(404).send(NOT_THERE);
      return undefined;
    }
    const readRefusal = await access(request, source.folderId, 'read');
    // One they may not see answers as one that isn't there (AC-264).
    if (readRefusal !== undefined) {
      await reply.status(404).send(NOT_THERE);
      return undefined;
    }
    const refusal = want === 'read' ? undefined : await access(request, source.folderId, want);
    if (refusal !== undefined) {
      await reply.status(refusal.status).send(refusal.body);
      return undefined;
    }
    return source;
  };

  /**
   * Every data source the user may see, in every folder (T364, AC-157): each
   * with its folder's path, its driver, and its health from the last test of
   * its stored settings (T362), `current` while its settings are still the
   * ones tested. None to one who sees no folder's every item.
   */
  app.get('/api/data-sources', USER, async (request) => {
    const sees = await listing.sees(request);
    const pathOf = await listing.pathOf();
    const visible = (await store.all()).filter((source) => sees(source.folderId));
    // xcube away is no reason to refuse the page: its cubes are said unknown.
    const used =
      listing.usedBy === undefined || visible.length === 0
        ? undefined
        : await listing.usedBy().catch((error: unknown) => {
            request.log.warn(
              { err: error },
              'could not read the cubes xcube bound to data sources',
            );
            return undefined;
          });
    const latest =
      tests === undefined
        ? new Map<string, ConnectionTest>()
        : await tests.latestAsStored(visible.map((source) => source.id));
    return visible.map((source) => {
      const test = latest.get(source.id);
      return {
        id: source.id,
        name: source.name,
        folderId: source.folderId,
        folderPath: pathOf(source.folderId),
        driver: source.driver,
        authMethod: source.authMethod,
        updatedAt: source.updatedAt,
        lastTest:
          test === undefined
            ? null
            : {
                ok: test.ok,
                ranAt: test.ranAt,
                checks: test.checks,
                current: test.settings === source.settingsPrint,
              },
        // Only the cubes in folders the user sees every item of (AC-263); the
        // rest counted, never named, as a refused publish counts them (AC-322).
        usedBy:
          used === undefined
            ? null
            : (used.get(source.id) ?? [])
                .filter((cube) => sees(cube.folderId))
                .map((cube) => ({ ...cube, folderPath: pathOf(cube.folderId) })),
        usedElsewhere:
          used === undefined
            ? 0
            : (used.get(source.id) ?? []).filter((cube) => !sees(cube.folderId)).length,
      };
    });
  });

  app.get('/api/data-sources/:id', USER, async (request, reply) => {
    const source = await reached(request, reply, 'read');
    return source === undefined ? reply : viewOf(source);
  });

  /**
   * A connection test (T361, AC-159): xcube opens the envelopes and connects
   * with Cube's own driver, and its checks — `secrets`, `config`, `connect`,
   * `schemas` — come back as they are, each secret redacted from its error by
   * xcube. The data source is never changed by one; a stored one's test is
   * kept in its history (T362). The request is wechart's server's (AC-327).
   *
   * `run` gives xcube's answer, or none, why not already sent.
   */
  const run = async (
    reply: FastifyReply,
    body: TestedConnection,
  ): Promise<TestAnswer | undefined> => {
    const refuse = async (status: number, sent: Record<string, unknown>) => {
      await reply.status(status).send(sent);
      return undefined;
    };
    if (tester === undefined)
      return refuse(503, {
        error: 'Connection tests need xcube, which this deployment doesn’t run.',
      });
    try {
      return await tester(body);
    } catch (error) {
      if (error instanceof ConnectionRefused)
        return refuse(400, { error: error.message, problems: error.problems });
      if (error instanceof XcubeError)
        return refuse(502, { error: `xcube refused the test: ${error.message}` });
      // Reached, and slower than a test's two 30 s steps allow.
      if ((error as { name?: unknown } | null)?.name === 'TimeoutError')
        return refuse(504, { error: 'xcube took too long to answer the test. Try again.' });
      return refuse(503, {
        error: 'xcube can’t be reached to run the test. Try again once it is back.',
      });
    }
  };

  /**
   * Whether every running Cube instance uses its stored settings (T365,
   * AC-161): from each instance's report to xcube within the hour. xcube
   * swaps the driver as Cube runs, so there is never a restart to ask for.
   */
  app.get('/api/data-sources/:id/cube-state', USER, async (request, reply) => {
    const source = await reached(request, reply, 'read');
    if (source === undefined) return reply;
    if (health === undefined)
      return reply.status(503).send({
        error: 'Cube’s use of a data source is told by xcube, which this deployment doesn’t run.',
      });
    try {
      return cubeStateOf(await health(source), new Date());
    } catch (error) {
      // An answer xcube gave — a service key it won't take, say — is no outage.
      if (error instanceof XcubeError || error instanceof ConnectionRefused)
        return reply.status(502).send({ error: `xcube refused to say: ${error.message}` });
      request.log.warn({ err: error }, 'could not ask xcube whether Cube uses a data source');
      return reply.status(503).send({
        error: 'xcube can’t be reached to say whether Cube uses it. Try again once it is back.',
      });
    }
  });

  // A stored one's tests, newest first (T362, AC-163): for those who may see it.
  app.get('/api/data-sources/:id/tests', USER, async (request, reply) => {
    const source = await reached(request, reply, 'read');
    if (source === undefined) return reply;
    return tests === undefined ? [] : tests.history(source.id);
  });

  // One not yet saved: the wizard's Test step (T363).
  app.post('/api/data-sources/test', USER, async (request, reply) => {
    const { value, error } = readBody(request.body);
    if (value === undefined) return reply.status(400).send({ error });
    const folderId = typeof value['folderId'] === 'string' ? value['folderId'] : '';
    if (folderId === '') return reply.status(400).send({ error: 'Name the folder it goes in.' });
    const refusal = await access(request, folderId, 'write');
    if (refusal !== undefined) return reply.status(refusal.status).send(refusal.body);
    const shape = {
      driver: String(value['driver'] ?? ''),
      authMethod: String(value['authMethod'] ?? ''),
      fields: (value['fields'] ?? {}) as Record<string, FieldValue>,
      sealed: (value['sealed'] ?? {}) as Record<string, SealedV1>,
    };
    try {
      store.checkShape(shape);
    } catch (failure) {
      return refused(reply, failure);
    }
    return (await run(reply, shape)) ?? reply;
  });

  // A stored one, with the form's changes: tested as their save would store
  // them, so a changed target needs its secrets sealed again (AC-312).
  app.post('/api/data-sources/:id/test', USER, async (request, reply) => {
    const { value, error } = readBody(request.body);
    if (value === undefined) return reply.status(400).send({ error });
    const source = await reached(request, reply, 'write');
    if (source === undefined) return reply;
    try {
      const plan = await store.plan(source.id, {
        ...(typeof value['authMethod'] === 'string' ? { authMethod: value['authMethod'] } : {}),
        ...(value['fields'] === undefined
          ? {}
          : { fields: value['fields'] as Record<string, FieldValue> }),
        ...(value['sealed'] === undefined
          ? {}
          : { sealed: value['sealed'] as Record<string, SealedV1> }),
      });
      const stored = await store.sealedOf(source.id);
      const kept = Object.fromEntries(
        Object.entries(stored.sealed).filter(([field]) => plan.kept.includes(field)),
      );
      const answer = await run(reply, {
        driver: source.driver,
        authMethod: plan.authMethod,
        fields: plan.fields,
        sealed: { ...kept, ...plan.sealed },
      });
      if (answer === undefined) return reply;
      // A test xcube answered, kept in the source's history (T362, AC-163),
      // said to be of the stored settings or of changes not saved. Its answer
      // is given even should keeping it fail (T362's review).
      if (tests !== undefined) {
        const user = request.wechartUser;
        const asStored =
          plan.authMethod === source.authMethod &&
          Object.keys(plan.sealed).length === 0 &&
          sameFields(plan.fields, source.fields);
        await tests
          .record(source.id, {
            ok: answer.ok,
            checks: answer.checks,
            fields: plan.fields,
            asStored,
            settings: asStored ? source.settingsPrint : null,
            by: user === null ? null : { key: user.key, name: user.name },
          })
          .catch((error: unknown) => {
            request.log.warn({ err: error }, 'could not keep a connection test in its history');
          });
      }
      return answer;
    } catch (failure) {
      return refused(reply, failure);
    }
  });

  /**
   * The install Job's (T443, AC-310, AC-251): the shared root's `default`
   * data source, made from the envelope the Job sealed its database password
   * into, so wechart never receives the password. It answers the Job's token
   * alone — no session stands in for it — says nothing back, and works only
   * while the root has no `default`: after that it is managed like any other.
   */
  if (seedToken !== undefined)
    app.post(
      '/api/data-sources/root-default',
      {
        ...INSTALL,
        // Before its body is read, so no body reaches a parser unasked (T443's review).
        onRequest: async (request, reply) => {
          if (!sameSecret(request.headers.authorization, `Bearer ${seedToken}`))
            await reply.status(401).send();
        },
      },
      async (request, reply) => {
        const { value, error } = readBody(request.body);
        if (value === undefined) {
          request.log.warn({ error }, 'the root’s default data source was refused');
          return reply.status(400).send();
        }
        const held = await store.inFolder(ROOT_FOLDER_ID);
        if (held.some((source) => source.name === DEFAULT_SOURCE)) return reply.status(409).send();
        try {
          await store.create(
            {
              folderId: ROOT_FOLDER_ID,
              name: DEFAULT_SOURCE,
              driver: String(value['driver'] ?? ''),
              authMethod: String(value['authMethod'] ?? ''),
              fields: (value['fields'] ?? {}) as Record<string, FieldValue>,
              sealed: (value['sealed'] ?? {}) as Record<string, SealedV1>,
            },
            await landingIn(ROOT_FOLDER_ID),
          );
          return reply.status(204).send();
        } catch (failure) {
          if (!(failure instanceof DataSourceRefused)) throw failure;
          // Why, in the API's log only: the Job is told nothing.
          request.log.warn(
            { problems: failure.problems },
            'the root’s default data source was refused',
          );
          // 409 says only that the root has its default — another Job's, a
          // moment ago — never a refusal of xcube's, which would read as done
          // (T443's review).
          const seeded = (await store.inFolder(ROOT_FOLDER_ID)).some(
            (source) => source.name === DEFAULT_SOURCE,
          );
          return reply.status(seeded ? 409 : failure.status === 409 ? 422 : failure.status).send();
        }
      },
    );

  app.post('/api/data-sources', USER, async (request, reply) => {
    const { value, error } = readBody(request.body);
    if (value === undefined) return reply.status(400).send({ error });
    const folderId = typeof value['folderId'] === 'string' ? value['folderId'] : '';
    if (folderId === '') return reply.status(400).send({ error: 'Name the folder it goes in.' });
    const refusal = await access(request, folderId, 'write');
    if (refusal !== undefined) return reply.status(refusal.status).send(refusal.body);
    const name = String(value['name'] ?? '');
    /**
     * One made in the workspace names the shared folder it is to go to, where
     * its author has read-write access, and takes no name that folder holds:
     * only a copy replaces one (T345, AC-282; the user's answer to question
     * 30). It isn't landed in xcube, whose tree holds no workspace, until the
     * workspace's preview (T347).
     */
    const workspace = (await workspaceOf?.(folderId)) ?? null;
    const inWorkspace = workspace !== null;
    const targetFolderId =
      typeof value['targetFolderId'] === 'string' ? value['targetFolderId'] : '';
    if (inWorkspace) {
      const targetsWorkspace = targetFolderId === '' ? null : await workspaceOf?.(targetFolderId);
      // Another's workspace is as a folder that isn't there (T345's review).
      if (targetsWorkspace != null && targetsWorkspace !== workspace)
        return reply.status(404).send({ error: NO_SUCH_FOLDER });
      if (targetFolderId === '' || targetsWorkspace != null)
        return reply.status(400).send({
          error: 'Name the shared folder it is to go to: one where you have read-write access.',
        });
      const targetRefusal = await access(request, targetFolderId, 'write');
      if (targetRefusal !== undefined)
        return reply.status(targetRefusal.status).send(targetRefusal.body);
      const clash = await clashIn(targetFolderId, name);
      if (clash !== undefined) return reply.status(409).send(clash);
    }
    try {
      const made = await store.create(
        {
          folderId,
          name,
          driver: String(value['driver'] ?? ''),
          authMethod: String(value['authMethod'] ?? ''),
          fields: (value['fields'] ?? {}) as Record<string, FieldValue>,
          sealed: (value['sealed'] ?? {}) as Record<string, SealedV1>,
          ...(inWorkspace ? { targetFolderId } : {}),
        },
        inWorkspace ? {} : await landingIn(folderId),
      );
      return reply.status(201).send(viewOf(made));
    } catch (failure) {
      return refused(reply, failure);
    }
  });

  app.put('/api/data-sources/:id', USER, async (request, reply) => {
    const { value, error } = readBody(request.body);
    if (value === undefined) return reply.status(400).send({ error });
    const source = await reached(request, reply, 'write');
    if (source === undefined) return reply;
    const change: DataSourceChange = {
      ...(typeof value['name'] === 'string' ? { name: value['name'] } : {}),
      ...(typeof value['driver'] === 'string' ? { driver: value['driver'] } : {}),
      ...(typeof value['authMethod'] === 'string' ? { authMethod: value['authMethod'] } : {}),
      ...(value['fields'] === undefined
        ? {}
        : { fields: value['fields'] as Record<string, FieldValue> }),
      ...(value['sealed'] === undefined
        ? {}
        : { sealed: value['sealed'] as Record<string, SealedV1> }),
    };
    // A workspace's is changed in wechart alone, as it was made; renamed, it
    // still takes no name its target holds (T345's review).
    const workspaced = await inAWorkspace(source);
    if (
      workspaced &&
      change.name !== undefined &&
      change.name !== source.name &&
      source.targetFolderId !== null
    ) {
      const clash = await clashIn(source.targetFolderId, change.name);
      if (clash !== undefined) return reply.status(409).send(clash);
    }
    try {
      return viewOf(
        await store.update(source.id, change, workspaced ? {} : await landingIn(source.folderId)),
      );
    } catch (failure) {
      return refused(reply, failure);
    }
  });

  app.delete('/api/data-sources/:id', USER, async (request, reply) => {
    const source = await reached(request, reply, 'write');
    if (source === undefined) return reply;
    try {
      await store.remove(
        source.id,
        landing === undefined || (await inAWorkspace(source)) ? {} : { unland: landing.unland },
      );
    } catch (failure) {
      return refused(reply, failure);
    }
    return reply.status(204).send();
  });
}
