import type { FieldValue, SealedV1 } from '@wechart/core';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { createHash, timingSafeEqual } from 'node:crypto';

import { actorOf, dataSourceChange, recordIn } from '../audit/record';
import { INSTALL, USER } from '../auth/guard';
import type { AuditStore } from '../repos/audit';
import { ROOT_FOLDER_ID } from '../repos/catalog';
import {
  DataSourceRefused,
  settingsPrintOf,
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

import { sharedInPlace } from './shared-in-place';

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
    // Where a workspace's is to go, and what a copy was copied from (T345, T346).
    targetFolderId: source.targetFolderId,
    origin: source.origin,
    description: source.description,
    version: source.version,
    updatedAt: source.updatedAt,
  };
}

const NOT_THERE = { error: 'There’s no such data source, or it isn’t yours to see.' };
const NO_SUCH_FOLDER = 'There’s no such folder, or it isn’t yours to see.';

/** The shared root's default data source, which the install Job seeds (T443, AC-310). */
const DEFAULT_SOURCE = 'default';
/** Who the audit trail says seeded it (T368): the install Job, not a person. */
const INSTALL_JOB = { key: 'wechart-install-job', name: 'Install Job' };

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
  for (const key of ['name', 'driver', 'authMethod', 'folderId', 'targetFolderId', 'testId'])
    if (body[key] !== undefined && typeof body[key] !== 'string')
      return { error: `${key} is text.` };
  if (
    body['trials'] !== undefined &&
    (!Array.isArray(body['trials']) || !body['trials'].every((id) => typeof id === 'string'))
  )
    return { error: 'trials are a list of test ids.' };
  return { value: body };
}

/**
 * What a test of one not yet made tested, as a print (T363, AC-158): its
 * driver, sign-in method, fields and envelopes. A create names that test,
 * and is made only from exactly what it tested.
 */
const trialPrintOf = (shape: {
  driver: string;
  authMethod: string;
  fields: Readonly<Record<string, FieldValue>>;
  sealed: Readonly<Record<string, SealedV1>>;
}) =>
  settingsPrintOf(
    shape.driver,
    shape.authMethod,
    shape.fields,
    Object.fromEntries(
      Object.entries(shape.sealed).map(([field, envelope]) => [
        field,
        JSON.stringify([envelope.v, envelope.kid, envelope.enc, envelope.ct]),
      ]),
    ),
  );

const UNTESTED = {
  error:
    'Test its connection first: a data source is made only from a test of exactly its settings that passed.',
};

/**
 * A change to a stored one, as a print (T461, AC-158): what its test tried,
 * the new envelopes included, and the stored version it changes, so a test
 * made before another save no longer saves.
 */
const changePrintOf = (
  source: DataSource,
  plan: {
    authMethod: string;
    fields: Readonly<Record<string, FieldValue>>;
    sealed: Readonly<Record<string, SealedV1>>;
  },
) =>
  `${trialPrintOf({ driver: source.driver, authMethod: plan.authMethod, fields: plan.fields, sealed: plan.sealed })}:v${String(source.version)}`;

const UNTESTED_CHANGE = {
  error:
    'Test the change first: a data source’s connection changes only when a test of exactly that change passed.',
};

export function registerDataSources(
  app: FastifyInstance,
  {
    store,
    access,
    key,
    seedToken,
    workspaceOf,
    ownWorkspace,
    landing,
    tester,
    tests,
    health,
    listing,
    audit,
  }: {
    /** Where each change is recorded (T368, AC-294): a secret only said replaced. */
    readonly audit?: Pick<AuditStore, 'record'>;
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
    /**
     * The request's user's own workspace, or none for one who has none
     * (AC-277). Unset with sign-in off, where there are no workspaces (T346).
     */
    readonly ownWorkspace?: (request: FastifyRequest) => Promise<string | undefined>;
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

  /** A change to one, in the audit trail (T368, AC-294): never a secret's value (AC-298). */
  const recordChange = (
    request: FastifyRequest,
    source: Pick<DataSource, 'id' | 'name' | 'folderId'>,
    summary: string,
    details?: Record<string, unknown>,
    actor = actorOf(request.wechartUser),
  ) =>
    recordIn(
      audit,
      {
        actor,
        event: 'data-source-change',
        folderId: source.folderId,
        item: { kind: 'data-source', id: source.id, title: source.name },
        summary,
        ...(details === undefined ? {} : { details }),
      },
      request.log,
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
        : await tests.latestAsStored(
            visible.map((source) => source.id),
            new Map(visible.map((source) => [source.id, source.settingsPrint])),
          );
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

  /**
   * One data source, for its settings page (T462, AC-269; design 03 of
   * 2026-09-27): headed by its folder's path, the paths of what it was
   * copied from and where it is to go, and whether the user may change it
   * there or only through a copy in their workspace (rule 71).
   */
  app.get('/api/data-sources/:id', USER, async (request, reply) => {
    const source = await reached(request, reply, 'read');
    if (source === undefined) return reply;
    const pathOf = await listing.pathOf();
    return {
      ...viewOf(source),
      folderPath: pathOf(source.folderId),
      canWrite: (await access(request, source.folderId, 'write')) === undefined,
      inWorkspace: await inAWorkspace(source),
      ...(source.origin === null ? {} : { originPath: pathOf(source.origin.folderId) }),
      ...(source.targetFolderId === null ? {} : { targetPath: pathOf(source.targetFolderId) }),
    };
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
   * takes a change as Cube runs — a new password swapped in, a new target
   * served as a new epoch (T501) — so there is never a restart to ask for.
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
    const answer = await run(reply, shape);
    if (answer === undefined) return reply;
    if (tests === undefined) return answer;
    // Kept under what it tested, so a create can be made from it (T363,
    // AC-158); with no data source until one is. Its answer is given even
    // should keeping it fail, and then it makes nothing.
    const user = request.wechartUser;
    const kept = await tests
      .recordTrial(
        {
          ok: answer.ok,
          checks: answer.checks,
          fields: shape.fields,
          by: user === null ? null : { key: user.key, name: user.name },
        },
        trialPrintOf(shape),
      )
      .catch((error: unknown) => {
        request.log.warn({ err: error }, 'could not keep a connection test');
        return undefined;
      });
    return kept === undefined ? answer : { ...answer, testId: kept.id };
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
        // A test of a change is kept under its print, which the save of that
        // change names (T461, AC-158).
        const keptTest = await tests
          .record(
            source.id,
            {
              ok: answer.ok,
              checks: answer.checks,
              fields: plan.fields,
              asStored,
              settings: asStored ? source.settingsPrint : null,
              by: user === null ? null : { key: user.key, name: user.name },
            },
            asStored ? undefined : changePrintOf(source, plan),
          )
          .catch((error: unknown) => {
            request.log.warn({ err: error }, 'could not keep a connection test in its history');
            return undefined;
          });
        if (keptTest !== undefined) return { ...answer, testId: keptTest.id };
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
          const seeded = await store.create(
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
          // By the install Job, which no one signs in as (T368's review).
          await recordChange(request, seeded, 'Seeded at install', undefined, INSTALL_JOB);
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
    /**
     * Made only from a test that passed, of exactly these settings, by the
     * one making it (T363, AC-158; direction.md rules 23 and 35; the user's
     * answer, 2026-09-27: "test first, and dont save if test fails"). There
     * is no making one without. The test is a row, so any replica knows it.
     */
    const testId = typeof value['testId'] === 'string' ? value['testId'] : undefined;
    const byKey = request.wechartUser?.key ?? null;
    const print = trialPrintOf(shape);
    // Taken for this create alone, in one statement, so no two creates are
    // made from one test (T363's review).
    if (
      testId === undefined ||
      tests === undefined ||
      !(await tests.claimTrial(testId, print, byKey))
    )
      return reply.status(422).send(UNTESTED);
    try {
      const made = await store.create(
        { folderId, name, ...shape, ...(inWorkspace ? { targetFolderId } : {}) },
        inWorkspace ? {} : await landingIn(folderId),
      );
      // Its test heads its history, and is its health; the wizard's earlier
      // tests join it as trials (AC-163, AC-157; T363's review).
      const trials = Array.isArray(value['trials']) ? (value['trials'] as string[]) : [];
      await tests
        .adoptTrials(trials, made.id, byKey)
        .then(() => tests.adoptTrial(testId, made.id, made.settingsPrint))
        .catch((error: unknown) => {
          request.log.warn({ err: error }, 'could not keep its connection tests in its history');
        });
      await recordChange(request, made, 'Made, from a passing test');
      return reply.status(201).send(viewOf(made));
    } catch (failure) {
      // Refused: its test is its maker's again, for the create that follows.
      await tests.releaseTrial(testId, print).catch(() => undefined);
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
      // What it is for (T499): no part of the connection, so no test.
      ...(typeof value['description'] === 'string' || value['description'] === null
        ? { description: value['description'] }
        : {}),
    };
    // With sign-in on, a shared folder's is changed only as a copy, proposed
    // back (T502, AC-278). A rename is no change to what it connects to.
    if (
      workspaceOf !== undefined &&
      !(await inAWorkspace(source)) &&
      ((change.driver !== undefined && change.driver !== source.driver) ||
        (change.authMethod !== undefined && change.authMethod !== source.authMethod) ||
        (change.fields !== undefined && !sameFields(change.fields, source.fields)) ||
        (change.sealed !== undefined && Object.keys(change.sealed).length > 0) ||
        (change.description !== undefined &&
          (change.description ?? null) !== (source.description ?? null)))
    )
      return reply.status(409).send(sharedInPlace('data source'));
    // A copy keeps its original's name, under which it stands in for the
    // original in the workspace's previews (AC-280; T346's review).
    if (source.origin !== null && change.name !== undefined && change.name !== source.name)
      return reply.status(409).send({
        error: `A copy keeps its original’s name, “${source.name}”, which it stands in for in your workspace. Make a new data source for another name.`,
      });
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
    /**
     * A change to where or how it connects is saved only from a test of
     * exactly that change, of this version, that passed and was run by the
     * one saving it: never without (T461, AC-158; rule 23; R32). A rename
     * needs none. A change of type is refused by the store, whatever else.
     */
    const retyped = change.driver !== undefined && change.driver !== source.driver;
    const connects =
      !retyped &&
      ((change.authMethod !== undefined && change.authMethod !== source.authMethod) ||
        (change.fields !== undefined && !sameFields(change.fields, source.fields)) ||
        (change.sealed !== undefined && Object.keys(change.sealed).length > 0));
    let taken: { testId: string; print: string } | undefined;
    if (connects) {
      let print: string;
      try {
        print = changePrintOf(
          source,
          await store.plan(source.id, {
            ...(change.authMethod === undefined ? {} : { authMethod: change.authMethod }),
            ...(change.fields === undefined ? {} : { fields: change.fields }),
            ...(change.sealed === undefined ? {} : { sealed: change.sealed }),
          }),
        );
      } catch (failure) {
        return refused(reply, failure);
      }
      const testId = typeof value['testId'] === 'string' ? value['testId'] : undefined;
      const byKey = request.wechartUser?.key ?? null;
      if (
        testId === undefined ||
        tests === undefined ||
        !(await tests.claimChange(source.id, testId, print, byKey))
      )
        return reply.status(422).send(UNTESTED_CHANGE);
      taken = { testId, print };
    }
    try {
      // Over the version its test was of, or refused (T461's review): two
      // saves never mix into settings nobody tested.
      // Landed in xcube only for a change xcube holds: where or how it
      // connects, or its name. Each landing swaps every instance's driver, so
      // a description changes wechart alone (T499's review; research
      // xcube-slice-6.md, "PUT only on a real change").
      const renamed = change.name !== undefined && change.name !== source.name;
      const updated = await store.update(
        source.id,
        change,
        workspaced || !(connects || renamed) ? {} : await landingIn(source.folderId),
        source.version,
      );
      // The test it was saved from is its health now (AC-163, AC-157).
      if (taken !== undefined)
        await tests!
          .adoptChange(source.id, taken.testId, updated.settingsPrint)
          .catch((error: unknown) => {
            request.log.warn({ err: error }, 'could not keep its test as its health');
          });
      const said = dataSourceChange(
        source.driver,
        source,
        updated,
        Object.keys(change.sealed ?? {}),
      );
      // With the test it was saved from, which the trail's record names (design 08 state A).
      await recordChange(request, updated, said.summary, {
        changes: said.changes,
        ...(taken === undefined ? {} : { testId: taken.testId }),
      });
      return viewOf(updated);
    } catch (failure) {
      if (taken !== undefined)
        await tests!.releaseChange(source.id, taken.testId, taken.print).catch(() => undefined);
      return refused(reply, failure);
    }
  });

  /**
   * "Edit in my workspace" for a data source (T346; AC-280, AC-298): copied
   * into the user's own workspace with its sealed credentials as they are,
   * or their copy already there opened (200, `created: false`). Only for a
   * read-write member of its folder, who has a workspace; what is in a
   * workspace is changed there. With sign-in off there are no workspaces.
   */
  app.post('/api/data-sources/:id/copy', USER, async (request, reply) => {
    if (ownWorkspace === undefined)
      return reply.status(404).send({ error: 'Workspaces need sign-in.' });
    const own = await ownWorkspace(request);
    if (own === undefined)
      return reply.status(403).send({
        error: 'You have no workspace: only read-write members and Super-Admins have one.',
      });
    const source = await reached(request, reply, 'read');
    if (source === undefined) return reply;
    if (await inAWorkspace(source))
      return reply.status(400).send({ error: 'It is in a workspace already: change it there.' });
    const refusal = await access(request, source.folderId, 'write');
    if (refusal !== undefined) return reply.status(refusal.status).send(refusal.body);
    const existing = await store.copyIn(source.id, own);
    if (existing !== undefined) return { ...viewOf(existing), created: false };
    try {
      const copied = await store.copy(source.id, own);
      // Recorded where the original is, which the copy goes back to (T368's review).
      await recordChange(
        request,
        { id: copied.id, name: copied.name, folderId: source.folderId },
        `Copied into a workspace, from version ${String(source.version)}`,
      );
      return reply.status(201).send({ ...viewOf(copied), created: true });
    } catch (failure) {
      // Two copies at once: the one made first opens (T346's review).
      const raced = await store.copyIn(source.id, own);
      if (raced !== undefined) return { ...viewOf(raced), created: false };
      return refused(reply, failure);
    }
  });

  app.delete('/api/data-sources/:id', USER, async (request, reply) => {
    const source = await reached(request, reply, 'write');
    if (source === undefined) return reply;
    try {
      const removed = await store.remove(
        source.id,
        landing === undefined || (await inAWorkspace(source)) ? {} : { unland: landing.unland },
      );
      // Gone already, another's removal first: nothing done, nothing recorded.
      if (!removed) return reply.status(404).send(NOT_THERE);
    } catch (failure) {
      return refused(reply, failure);
    }
    await recordChange(request, source, 'Removed');
    return reply.status(204).send();
  });
}
