import { randomUUID } from 'node:crypto';

import type { FastifyInstance, InjectOptions } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { pgSessionStore } from '../auth/session-store';
import { PUBLIC_URL, signIn, USERS } from '../auth/sign-in.fixture';
import { closeDb, getDb } from '../db/client';
import { auditStore } from '../repos/audit';
import { savedQueryStore } from '../repos/saved-queries';
import { buildServer } from '../server';

/**
 * T812 (AC-457, AC-483): a query saved from the SQL runner workspace keeps
 * its SQL, its data source and each parameter's name, type and last value;
 * Save on a saved query updates it, and Save as new… makes another. Saving
 * needs no proposal and makes no audit event. A name is required, at most
 * 100 characters and none of its owner's other saved queries' names; a
 * description at most 1,000 characters; anything else is refused with the
 * reason, on save and on rename.
 *
 * `writer` is Wren Writer; `super` a Super-Admin.
 */
const MARK = `sq${randomUUID().replaceAll('-', '').slice(0, 8)}`;

let app: FastifyInstance;
const cookies: Record<string, string> = {};
const audit = () => auditStore(getDb());
let started: Date;

beforeAll(async () => {
  started = new Date();
  app = buildServer({
    config: {
      cubeApiUrl: 'http://cube.invalid/cubejs-api',
      cubeApiSecret: 'secret',
      securityContext: {},
      port: 0,
      modelDir: '',
      security: 'oidc',
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
    },
    sessions: pgSessionStore(getDb()),
    audit: audit(),
    savedQueries: savedQueryStore(getDb()),
  });
  for (const who of ['super', 'writer']) cookies[who] = await signIn(app, USERS[who]!);
});

afterAll(async () => {
  if (app !== undefined) await app.close();
  await getDb().deleteFrom('saved_queries').where('name', 'like', `%${MARK}%`).execute();
  await closeDb();
});

const as = (who: string, options: InjectOptions) =>
  app.inject({ ...options, headers: { ...options.headers, cookie: cookies[who]! } });
const save = (who: string, payload: Record<string, unknown>) =>
  as(who, { method: 'POST', url: '/api/sql/saved', payload });
const update = (who: string, id: string, payload: Record<string, unknown>) =>
  as(who, { method: 'PUT', url: `/api/sql/saved/${id}`, payload });
const reopen = (who: string, id: string) => as(who, { method: 'GET', url: `/api/sql/saved/${id}` });

const QUERY = {
  description: 'Largest EMEA orders since a date, for the month-end check.',
  sourceId: 'emea-source-id',
  sql: 'SELECT * FROM orders WHERE region = {{region}} AND at >= {{since}}',
  parameters: [
    { name: 'region', type: 'text', value: 'EMEA' },
    { name: 'since', type: 'date', value: '2026-09-01' },
  ],
};
interface Saved {
  id: string;
  name: string;
  description: string;
  sourceId: string;
  sql: string;
  parameters: { name: string; type: string; value: string }[];
}

describe('saving a query (T812, AC-457)', () => {
  it('keeps the SQL, the data source and each parameter’s name, type and last value, and reopening returns them all', async () => {
    const name = `Top EMEA orders ${MARK}`;
    const made = await save('writer', { name, ...QUERY });
    expect(made.statusCode, made.body).toBe(201);
    const { id } = made.json<Saved>();
    expect(id).toMatch(/^[0-9a-f-]{36}$/);

    const back = await reopen('writer', id);
    expect(back.statusCode, back.body).toBe(200);
    expect(back.json<Saved>()).toMatchObject({ id, name, ...QUERY });
  });

  it('Save on a saved query updates it and makes no second; Save as new… makes another', async () => {
    const name = `GL postings ${MARK}`;
    const { id } = (await save('writer', { name, ...QUERY })).json<Saved>();
    const changed = { ...QUERY, sql: 'SELECT 2', parameters: [{ name: 'n', type: 'number', value: '7' }] };

    const updated = await update('writer', id, { name, ...changed });
    expect(updated.statusCode, updated.body).toBe(200);
    expect((await reopen('writer', id)).json<Saved>()).toMatchObject({ id, name, ...changed });
    const rows = await getDb().selectFrom('saved_queries').select('id').where('name', '=', name).execute();
    expect(rows.map((row) => row.id)).toEqual([id]);

    const copy = await save('writer', { name: `${name} (copy)`, ...changed });
    expect(copy.statusCode, copy.body).toBe(201);
    expect(copy.json<Saved>().id).not.toBe(id);
  });

  it('makes no proposal and no audit event', async () => {
    await save('writer', { name: `Quiet ${MARK}`, ...QUERY });
    const events = await audit().list({ since: started, limit: 500 });
    expect(events.records.filter((record) => JSON.stringify(record).includes(MARK))).toEqual([]);
    const proposals = await getDb().selectFrom('proposals').select('id').where('proposed_at', '>=', started).execute();
    expect(proposals).toEqual([]);
  });

  it('is its owner’s alone: nobody else, a Super-Admin included, reopens or updates it', async () => {
    const { id } = (await save('writer', { name: `Mine ${MARK}`, ...QUERY })).json<Saved>();
    expect((await reopen('super', id)).statusCode).toBe(404);
    expect((await update('super', id, { name: `Taken ${MARK}`, ...QUERY })).statusCode).toBe(404);
    expect((await reopen('writer', id)).json<Saved>().name).toBe(`Mine ${MARK}`);
  });
});

describe('a saved query’s name and description (T812, AC-483)', () => {
  const refusedWith = async (answer: Awaited<ReturnType<typeof save>>, status: number, error: string) => {
    expect(answer.statusCode, answer.body).toBe(status);
    expect(answer.json<{ error: string }>().error).toBe(error);
  };

  it('refuses no name, a name over 100 characters, another of the owner’s names, or a description over 1,000, saying why', async () => {
    await refusedWith(await save('writer', { ...QUERY, name: '' }), 400, 'Give the query a name.');
    await refusedWith(await save('writer', { ...QUERY, name: '   ' }), 400, 'Give the query a name.');
    await refusedWith(
      await save('writer', { ...QUERY, name: `${MARK}${'x'.repeat(101 - MARK.length)}` }),
      400,
      'A name is at most 100 characters.',
    );
    const taken = `Taken ${MARK}`;
    expect((await save('writer', { ...QUERY, name: taken })).statusCode).toBe(201);
    await refusedWith(
      await save('writer', { ...QUERY, name: taken }),
      409,
      `You already have a saved query named “${taken}”.`,
    );
    await refusedWith(
      await save('writer', { ...QUERY, name: `Long ${MARK}`, description: 'd'.repeat(1001) }),
      400,
      'A description is at most 1,000 characters.',
    );
    // At the limits, it's kept.
    expect(
      (await save('writer', { ...QUERY, name: `${MARK}${'y'.repeat(100 - MARK.length)}`, description: 'd'.repeat(1000) }))
        .statusCode,
    ).toBe(201);
  });

  it('another user may use the same name: it is unique to its owner', async () => {
    const name = `Shared name ${MARK}`;
    expect((await save('writer', { ...QUERY, name })).statusCode).toBe(201);
    expect((await save('super', { ...QUERY, name })).statusCode).toBe(201);
  });

  it('refuses a rename to another of the owner’s names, or to none, saying why', async () => {
    const first = `First ${MARK}`;
    await save('writer', { ...QUERY, name: first });
    const { id } = (await save('writer', { ...QUERY, name: `Second ${MARK}` })).json<Saved>();

    await refusedWith(
      await update('writer', id, { ...QUERY, name: first }),
      409,
      `You already have a saved query named “${first}”.`,
    );
    await refusedWith(await update('writer', id, { ...QUERY, name: '' }), 400, 'Give the query a name.');
    // Keeping its own name is no clash.
    expect((await update('writer', id, { ...QUERY, name: `Second ${MARK}` })).statusCode).toBe(200);
  });

  it('refuses a parameter of another type, or a name not of the parameter grammar', async () => {
    for (const parameters of [
      [{ name: 'x', type: 'json', value: '1' }],
      [{ name: '1x', type: 'text', value: '1' }],
      [{ name: 'x', type: 'text', value: 1 }],
      'x',
    ]) {
      const answer = await save('writer', { ...QUERY, name: `Bad ${MARK}`, parameters });
      expect(answer.statusCode, JSON.stringify(parameters)).toBe(400);
    }
  });
});
