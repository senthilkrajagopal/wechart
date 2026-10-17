import { randomUUID } from 'node:crypto';

import type { FastifyInstance, InjectOptions } from 'fastify';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { pgSessionStore } from '../auth/session-store';
import { PUBLIC_URL, signIn, USERS } from '../auth/sign-in.fixture';
import { closeDb, getDb } from '../db/client';
import { accessTokenStore } from '../repos/access-tokens';
import { auditStore } from '../repos/audit';
import { buildServer } from '../server';

/**
 * T767 (AC-430, AC-468, AC-469, AC-442): a personal access token made
 * through the API. A name, the three scopes with read always in, 7, 30 or
 * 90 days (30 unless said); its text answered once, never cached, and kept
 * only as a digest; listed to its owner without it; "Token made" in the
 * audit trail with who, its name and when.
 *
 * `writer` is Wren Writer; `super` a Super-Admin.
 */
const MARK = `pat${randomUUID().replaceAll('-', '').slice(0, 8)}`;
const DAY = 86_400_000;

let app: FastifyInstance;
const cookies: Record<string, string> = {};
const tokens = () => accessTokenStore(getDb());
const audit = () => auditStore(getDb());

beforeAll(async () => {
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
    accessTokens: tokens(),
  });
  for (const who of ['super', 'writer']) cookies[who] = await signIn(app, USERS[who]!);
});

afterAll(async () => {
  if (app !== undefined) await app.close();
  await getDb().deleteFrom('personal_access_tokens').where('name', 'like', `%${MARK}%`).execute();
  await closeDb();
});

const as = (who: string, options: InjectOptions) =>
  app.inject({ ...options, headers: { ...options.headers, cookie: cookies[who]! } });
const make = (who: string, payload: Record<string, unknown>) =>
  as(who, { method: 'POST', url: '/api/account/tokens', payload });

interface Listed {
  id: string;
  name: string;
  scopes: string[];
  createdAt: string;
  expiresAt: string;
  lastUsedAt: string | null;
}
const listOf = async (who: string): Promise<Listed[]> => {
  const answer = await as(who, { method: 'GET', url: '/api/account/tokens' });
  expect(answer.statusCode, answer.body).toBe(200);
  return answer.json<{ tokens: Listed[] }>().tokens.filter((each) => each.name.includes(MARK));
};

describe('making a token (T767, AC-430, AC-468)', () => {
  it('answers 201 with its text once, not to be cached, and lists it without the text', async () => {
    const before = Date.now();
    const made = await make('writer', {
      name: `Claude Code · desktop ${MARK}`,
      scopes: ['read', 'workspace-edit'],
      days: 7,
    });
    expect(made.statusCode, made.body).toBe(201);
    expect(made.headers['cache-control']).toBe('no-store');
    const { text, token } = made.json<{ text: string; token: Listed }>();
    expect(text).toMatch(/^wct_[0-9a-f]{64}_[0-9a-f]{8}$/);
    expect(token).toEqual({
      id: expect.any(String),
      name: `Claude Code · desktop ${MARK}`,
      scopes: ['read', 'workspace-edit'],
      createdAt: expect.any(String),
      expiresAt: expect.any(String),
      lastUsedAt: null,
    });
    const expires = Date.parse(token.expiresAt) - Date.parse(token.createdAt);
    expect(expires).toBe(7 * DAY);
    expect(Date.parse(token.createdAt)).toBeGreaterThanOrEqual(before - 1000);

    const listed = await as('writer', { method: 'GET', url: '/api/account/tokens' });
    expect(listed.body).not.toContain(text.slice(4, 68));
    const mine = await listOf('writer');
    expect(mine).toContainEqual(token);
    // Its owner's alone.
    expect((await listOf('super')).map((each) => each.id)).not.toContain(token.id);
  });

  it('lasts 30 days when no expiry is given, and 90 when asked', async () => {
    const thirty = await make('writer', { name: `thirty ${MARK}`, scopes: ['read'] });
    expect(thirty.statusCode, thirty.body).toBe(201);
    const a = thirty.json<{ token: Listed }>().token;
    expect(Date.parse(a.expiresAt) - Date.parse(a.createdAt)).toBe(30 * DAY);

    const ninety = await make('writer', {
      name: `ninety ${MARK}`,
      scopes: ['read', 'workspace-edit', 'proposals-and-jobs'],
      days: 90,
    });
    expect(ninety.statusCode, ninety.body).toBe(201);
    const b = ninety.json<{ token: Listed }>().token;
    expect(Date.parse(b.expiresAt) - Date.parse(b.createdAt)).toBe(90 * DAY);
    expect(b.scopes).toEqual(['read', 'workspace-edit', 'proposals-and-jobs']);
  });
});

describe('a token refused (T767, AC-430, AC-468, AC-469)', () => {
  it.each([
    ['no name', { scopes: ['read'] }, /name/i],
    ['a blank name', { name: '   ', scopes: ['read'] }, /name/i],
    ['a name over 100 characters', { name: `${MARK}${'n'.repeat(101)}`, scopes: ['read'] }, /100/],
    ['no scope', { name: `none ${MARK}`, scopes: [] }, /scope/i],
    ['no scopes at all', { name: `absent ${MARK}` }, /scope/i],
    [
      'a scope outside the three',
      { name: `admin ${MARK}`, scopes: ['read', 'admin'] },
      /read, workspace-edit and proposals-and-jobs/,
    ],
    ['a scope set without read', { name: `noread ${MARK}`, scopes: ['workspace-edit'] }, /read/],
    ['120 days', { name: `long ${MARK}`, scopes: ['read'], days: 120 }, /7, 30 or 90/],
    ['1 day', { name: `short ${MARK}`, scopes: ['read'], days: 1 }, /7, 30 or 90/],
  ])('with %s: 400 with the reason, and no token', async (_, payload, reason) => {
    const answer = await make('writer', payload);
    expect(answer.statusCode, answer.body).toBe(400);
    expect(answer.json<{ error: string }>().error).toMatch(reason);
    expect(answer.body).not.toMatch(/wct_/);
  });

  it('a name over 100 characters makes no token', async () => {
    const name = `${MARK}${'n'.repeat(101 - MARK.length)}`;
    expect((await make('writer', { name, scopes: ['read'] })).statusCode).toBe(400);
    // 100 exactly is allowed, counted in characters.
    const hundred = `${MARK}${'é'.repeat(100 - MARK.length)}`;
    expect((await make('writer', { name: hundred, scopes: ['read'] })).statusCode).toBe(201);
    expect((await listOf('writer')).map((each) => each.name)).not.toContain(name);
  });

  it('the name of another of the owner’s working tokens is refused; another user’s is not', async () => {
    const name = `laptop ${MARK}`;
    expect((await make('writer', { name, scopes: ['read'] })).statusCode).toBe(201);
    const again = await make('writer', { name, scopes: ['read'], days: 90 });
    expect(again.statusCode).toBe(400);
    expect(again.json<{ error: string }>().error).toMatch(/already/i);
    expect((await listOf('writer')).filter((each) => each.name === name)).toHaveLength(1);
    expect((await make('super', { name, scopes: ['read'] })).statusCode).toBe(201);
  });

  it('a token that no longer works leaves its name free', async () => {
    const name = `expired ${MARK}`;
    const made = await make('writer', { name, scopes: ['read'] });
    const { id } = made.json<{ token: Listed }>().token;
    await getDb()
      .updateTable('personal_access_tokens')
      .set({ expires_at: new Date(Date.now() - 1000) })
      .where('id', '=', id)
      .execute();
    expect((await make('writer', { name, scopes: ['read'] })).statusCode).toBe(201);
  });
});

describe('the text kept nowhere (T767, AC-430)', () => {
  it('no column of any table in the metadata database holds it', async () => {
    const made = await make('writer', { name: `kept ${MARK}`, scopes: ['read'] });
    const { text } = made.json<{ text: string }>();
    const secret = text.slice(4, 68);
    const tables = await sql<{ name: string }>`
      SELECT quote_ident(table_schema) || '.' || quote_ident(table_name) AS name
      FROM information_schema.tables
      WHERE table_type = 'BASE TABLE'
        AND table_schema NOT IN ('pg_catalog', 'information_schema')
    `.execute(getDb());
    expect(tables.rows.map((each) => each.name)).toContain('public.personal_access_tokens');
    const holding: string[] = [];
    for (const { name } of tables.rows) {
      const found = await sql<{ n: string }>`
        SELECT count(*) AS n FROM ${sql.raw(name)} AS t
        WHERE t::text LIKE ${`%${secret}%`} OR encode(convert_to(t::text, 'UTF8'), 'hex') LIKE ${`%${Buffer.from(secret).toString('hex')}%`}
      `.execute(getDb());
      if (Number(found.rows[0]!.n) > 0) holding.push(name);
    }
    expect(holding).toEqual([]);
  });
});

describe('“Token made” in the audit trail (T767, AC-442)', () => {
  it('records who, the token’s name and when', async () => {
    const name = `audited ${MARK}`;
    const before = new Date(Date.now() - 1000);
    const made = await make('writer', { name, scopes: ['read'], days: 30 });
    const { token, text } = made.json<{ token: Listed; text: string }>();
    const { records } = await audit().list({ events: ['token-made'], since: before, limit: 200 });
    const record = records.find((each) => each.item?.id === token.id);
    expect(record).toMatchObject({
      event: 'token-made',
      actor: { name: 'Wren Writer' },
      folderId: null,
      item: { kind: 'access-token', id: token.id, title: name },
      summary: `${name} · 30 days`,
    });
    expect(record!.at.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(JSON.stringify(record)).not.toContain(text.slice(4, 68));
  });
});

interface Stopped extends Listed {
  state: 'revoked' | 'expired';
  stoppedAt: string;
  revokedBy: { name: string } | null;
}
const stoppedOf = async (who: string): Promise<Stopped[]> => {
  const answer = await as(who, { method: 'GET', url: '/api/account/tokens' });
  expect(answer.statusCode, answer.body).toBe(200);
  return answer.json<{ stopped: Stopped[] }>().stopped.filter((each) => each.name.includes(MARK));
};
const madeId = async (who: string, name: string) => {
  const made = await make(who, { name, scopes: ['read'] });
  expect(made.statusCode, made.body).toBe(201);
  return made.json<{ token: Listed }>().token.id;
};
const revoke = (who: string, id: string) =>
  as(who, { method: 'DELETE', url: `/api/account/tokens/${id}` });
const remove = (who: string, id: string) =>
  as(who, { method: 'POST', url: `/api/account/tokens/${id}/remove` });

describe('revoking your own token (T768, AC-431)', () => {
  it('moves it under no longer working as “Revoked”, with when and the revoker’s name', async () => {
    const name = `revoked ${MARK}`;
    const id = await madeId('writer', name);
    const before = Date.now() - 1000;
    const answer = await revoke('writer', id);
    expect(answer.statusCode, answer.body).toBe(204);

    expect((await listOf('writer')).map((each) => each.id)).not.toContain(id);
    const stopped = (await stoppedOf('writer')).find((each) => each.id === id);
    expect(stopped).toEqual({
      id,
      name,
      scopes: ['read'],
      createdAt: expect.any(String),
      expiresAt: expect.any(String),
      lastUsedAt: null,
      state: 'revoked',
      stoppedAt: expect.any(String),
      revokedBy: { name: 'Wren Writer' },
    });
    expect(Date.parse(stopped!.stoppedAt)).toBeGreaterThanOrEqual(before);
    // Its name is free again.
    expect((await make('writer', { name, scopes: ['read'] })).statusCode).toBe(201);
  });

  it('lists a token past its expiry as “Expired”, with when', async () => {
    const id = await madeId('writer', `lapsed ${MARK}`);
    const expired = new Date(Date.now() - 60_000);
    await getDb()
      .updateTable('personal_access_tokens')
      .set({ expires_at: expired })
      .where('id', '=', id)
      .execute();
    const stopped = (await stoppedOf('writer')).find((each) => each.id === id);
    expect(stopped).toMatchObject({ state: 'expired', revokedBy: null });
    expect(Date.parse(stopped!.stoppedAt)).toBe(expired.getTime());
    // Too late to revoke: it already doesn't work.
    expect((await revoke('writer', id)).statusCode).toBe(409);
  });

  it('answers 404 for another user’s token, and leaves it working', async () => {
    const id = await madeId('super', `supers ${MARK}`);
    const answer = await revoke('writer', id);
    expect(answer.statusCode).toBe(404);
    expect((await listOf('super')).map((each) => each.id)).toContain(id);
    expect((await remove('writer', id)).statusCode).toBe(404);
    expect((await revoke('writer', randomUUID())).statusCode).toBe(404);
    expect((await revoke('writer', 'not-an-id')).statusCode).toBe(404);
  });
});

describe('Remove (T768, AC-431)', () => {
  it('takes a stopped token off the list, and its audit records stay', async () => {
    const name = `removed ${MARK}`;
    const since = new Date(Date.now() - 1000);
    const id = await madeId('writer', name);
    expect((await revoke('writer', id)).statusCode).toBe(204);
    const answer = await remove('writer', id);
    expect(answer.statusCode, answer.body).toBe(204);
    expect((await stoppedOf('writer')).map((each) => each.id)).not.toContain(id);
    expect((await listOf('writer')).map((each) => each.id)).not.toContain(id);

    const { records } = await audit().list({
      events: ['token-made', 'token-revoked'],
      since,
      limit: 200,
    });
    expect(
      records
        .filter((each) => each.item?.id === id)
        .map((each) => each.event)
        .sort(),
    ).toEqual(['token-made', 'token-revoked']);
  });

  it('refuses a working token: it must be revoked first', async () => {
    const id = await madeId('writer', `working ${MARK}`);
    const answer = await remove('writer', id);
    expect(answer.statusCode).toBe(409);
    expect((await listOf('writer')).map((each) => each.id)).toContain(id);
  });
});

describe('“Token revoked” in the audit trail (T768, AC-442)', () => {
  it('records who revoked it, the owner’s and the token’s name, and when', async () => {
    const name = `laptop revoked ${MARK}`;
    const id = await madeId('writer', name);
    const before = new Date(Date.now() - 1000);
    expect((await revoke('writer', id)).statusCode).toBe(204);
    const { records } = await audit().list({
      events: ['token-revoked'],
      since: before,
      limit: 200,
    });
    const record = records.find((each) => each.item?.id === id);
    expect(record).toMatchObject({
      event: 'token-revoked',
      actor: { name: 'Wren Writer' },
      folderId: null,
      item: { kind: 'access-token', id, title: name },
      summary: `Wren Writer’s ${name}`,
      details: { name, owner: { name: 'Wren Writer' } },
    });
    expect(record!.at.getTime()).toBeGreaterThanOrEqual(before.getTime());
  });
});
