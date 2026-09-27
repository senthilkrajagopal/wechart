import { randomUUID } from 'node:crypto';

import type { SealedV1 } from '@wechart/core';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { routesOf } from '../auth/guard';
import { pgSessionStore } from '../auth/session-store';
import { PUBLIC_URL, signIn, USERS } from '../auth/sign-in.fixture';
import { closeDb, getDb } from '../db/client';
import { catalog } from '../repos/catalog';
import { DataSourceRefused, dataSourceStore, type DataSource } from '../repos/data-sources';
import { documents } from '../repos/documents';
import { folderAccessStore } from '../repos/folder-access';
import { buildServer } from '../server';

/**
 * T443 (AC-310, AC-251): the shared root's `default` data source is seeded at
 * install by a Job, which seals the database password itself and sends wechart
 * only the envelope. Its route answers only the Job's token — no session, no
 * Super-Admin, stands in for it — returns nothing, and works only while the
 * root has no `default`; after that the root's `default` is managed like any
 * other data source.
 */
const TOKEN = `seed-${randomUUID()}`;
const unseeded = {
  cubeApiUrl: 'http://cube.invalid/cubejs-api',
  cubeApiSecret: 'secret',
  securityContext: {},
  port: 4100,
  modelDir: '',
  security: 'oidc' as const,
  publicUrl: PUBLIC_URL,
  sessionSecret: 'a-test-session-secret-at-least-32-characters',
  superAdminGroup: 'wechart-super-admins',
  oidc: {
    issuer: 'http://localhost:5556/dex',
    clientId: 'wechart',
    clientSecret: 'dev-oidc-secret',
    groupsClaim: 'groups',
    scopes: 'openid profile email groups',
    allowHttp: true,
  },
};
const secured = { ...unseeded, seedToken: TOKEN };
const MARK = randomUUID().slice(0, 8);
const sealed = (tag: string): SealedV1 => ({
  v: 1,
  kid: 'kid-1',
  enc: Buffer.alloc(32, `enc-${tag}-${MARK}`).toString('base64url'),
  ct: Buffer.alloc(272, `ct-${tag}-${MARK}`).toString('base64url'),
});
const body = {
  driver: 'postgres',
  authMethod: 'password',
  fields: { host: 'sample-db', port: 5432, database: 'sample', user: 'sample', ssl: false },
  sealed: { password: sealed('seeded') },
};
const URL = '/api/data-sources/root-default';

const sources = () => dataSourceStore(getDb());
const rootDefault = async () =>
  (await sources().inFolder('root')).find((source) => source.name === 'default');
const landed: string[] = [];
/** What xcube refuses the next landing with, if anything. */
let refuseLanding: DataSourceRefused | undefined;
let app: FastifyInstance;
let superCookie = '';

beforeAll(async () => {
  app = buildServer({
    config: secured,
    sessions: pgSessionStore(getDb()),
    documents: documents(getDb()),
    catalog: catalog(getDb()),
    folderAccess: folderAccessStore(getDb()),
    dataSources: sources(),
    dataSourceLanding: {
      prepare: async () => ({
        land: async (source: DataSource) => {
          if (refuseLanding !== undefined) throw refuseLanding;
          landed.push(`${source.folderId}/${source.name}`);
        },
        unland: async () => undefined,
      }),
      reconcile: async () => ({ put: [], removed: [], unopened: [], failed: [] }),
    } as never,
  });
  superCookie = await signIn(app, USERS['super']!);
});

// Each test starts from a root with no `default`: this file's own, from a run
// that stopped short, removed.
beforeEach(async () => {
  const left = await rootDefault();
  if (left !== undefined) await sources().remove(left.id);
  landed.length = 0;
});

afterAll(async () => {
  const left = await rootDefault();
  if (left !== undefined) await sources().remove(left.id);
  if (app !== undefined) await app.close();
  await closeDb();
});

const seed = (headers: Record<string, string>, payload: unknown = body) =>
  app.inject({ method: 'POST', url: URL, headers, payload: payload as never });

describe('seeding the shared root’s default data source (T443, AC-310)', () => {
  it('creates it from the Job’s envelope, lands it in xcube, and says nothing back', async () => {
    const answer = await seed({ authorization: `Bearer ${TOKEN}` });

    expect(answer.statusCode).toBe(204);
    expect(answer.body).toBe('');
    const made = await rootDefault();
    expect(made).toMatchObject({
      folderId: 'root',
      name: 'default',
      driver: 'postgres',
      authMethod: 'password',
      fields: body.fields,
      secrets: ['password'],
    });
    expect((await sources().sealedOf(made!.id)).sealed).toEqual(body.sealed);
    expect(landed).toEqual(['root/default']);
  });

  it('answers only the Job’s token: none, another, or a signed-in Super-Admin’s session is refused, and nothing is made', async () => {
    for (const headers of [
      {},
      { authorization: `Bearer ${TOKEN}x` },
      { authorization: TOKEN },
      { cookie: superCookie },
    ]) {
      const answer = await seed(headers);
      expect(answer.statusCode, JSON.stringify(headers)).toBe(401);
      expect(answer.body).toBe('');
    }
    expect(await rootDefault()).toBeUndefined();
    expect(landed).toEqual([]);
  });

  it('works only while the root has no default: then it changes nothing', async () => {
    expect((await seed({ authorization: `Bearer ${TOKEN}` })).statusCode).toBe(204);
    const first = await rootDefault();

    const again = await seed(
      { authorization: `Bearer ${TOKEN}` },
      { ...body, fields: { ...body.fields, host: 'elsewhere' }, sealed: { password: sealed('2') } },
    );
    expect(again.statusCode).toBe(409);
    expect(again.body).toBe('');
    expect(await rootDefault()).toEqual(first);
    expect((await sources().sealedOf(first!.id)).sealed).toEqual(body.sealed);
  });

  it('refuses a request without the token before reading its body: 401, never 500 (T443’s review)', async () => {
    for (const payload of ['{not json', '']) {
      const answer = await app.inject({
        method: 'POST',
        url: URL,
        headers: { 'content-type': 'application/json' },
        payload,
      });
      expect(answer.statusCode, JSON.stringify(payload)).toBe(401);
      expect(answer.body).toBe('');
    }
  });

  it('says 409 only when the root has its default: xcube’s refusal is another answer (T443’s review)', async () => {
    refuseLanding = new DataSourceRefused(409, 'Its driver can’t change: make a new data source.');
    try {
      const answer = await seed({ authorization: `Bearer ${TOKEN}` });
      expect(answer.statusCode).toBe(422);
      expect(answer.body).toBe('');
      expect(await rootDefault()).toBeUndefined();
    } finally {
      refuseLanding = undefined;
    }
  });

  it('takes a data source’s shape and nothing else: a plain password is refused', async () => {
    const plain = await seed(
      { authorization: `Bearer ${TOKEN}` },
      { ...body, fields: { ...body.fields, password: 'plain' }, sealed: {} },
    );

    expect(plain.statusCode).toBe(400);
    // Nothing said back, the refusal's reason included: it is in the API's log.
    expect(plain.body).toBe('');
    expect(await rootDefault()).toBeUndefined();
  });

  it('is there only when a token is configured, and is the one route of its kind (AC-251)', async () => {
    await app.ready();
    expect(
      routesOf(app)
        .filter((route) => route.access === 'install')
        .map((route) => `${route.method} ${route.url}`),
    ).toEqual([`POST ${URL}`]);

    const without = buildServer({
      config: unseeded,
      documents: documents(getDb()),
      catalog: catalog(getDb()),
      dataSources: sources(),
    });
    await without.ready();
    expect(routesOf(without).some((route) => route.url === URL)).toBe(false);
    await without.close();
  });
});
