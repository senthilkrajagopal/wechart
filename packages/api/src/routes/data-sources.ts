import type { FieldValue, SealedV1 } from '@wechart/core';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { USER } from '../auth/guard';
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
  for (const key of ['name', 'driver', 'authMethod', 'folderId'])
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

  app.post('/api/data-sources', USER, async (request, reply) => {
    const { value, error } = readBody(request.body);
    if (value === undefined) return reply.status(400).send({ error });
    const folderId = typeof value['folderId'] === 'string' ? value['folderId'] : '';
    if (folderId === '') return reply.status(400).send({ error: 'Name the folder it goes in.' });
    const refusal = await access(request, folderId, 'write');
    if (refusal !== undefined) return reply.status(refusal.status).send(refusal.body);
    try {
      const made = await store.create(
        {
          folderId,
          name: String(value['name'] ?? ''),
          driver: String(value['driver'] ?? ''),
          authMethod: String(value['authMethod'] ?? ''),
          fields: (value['fields'] ?? {}) as Record<string, FieldValue>,
          sealed: (value['sealed'] ?? {}) as Record<string, SealedV1>,
        },
        await landingIn(folderId),
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
    try {
      return viewOf(await store.update(source.id, change, await landingIn(source.folderId)));
    } catch (failure) {
      return refused(reply, failure);
    }
  });

  app.delete('/api/data-sources/:id', USER, async (request, reply) => {
    const source = await reached(request, reply, 'write');
    if (source === undefined) return reply;
    try {
      await store.remove(source.id, landing === undefined ? {} : { unland: landing.unland });
    } catch (failure) {
      return refused(reply, failure);
    }
    return reply.status(204).send();
  });
}
