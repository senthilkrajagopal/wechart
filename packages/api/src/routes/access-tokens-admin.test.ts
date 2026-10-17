import { randomUUID } from 'node:crypto';

import type { FastifyInstance, InjectOptions } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { pgSessionStore } from '../auth/session-store';
import { PUBLIC_URL, signIn, USERS } from '../auth/sign-in.fixture';
import { closeDb, getDb } from '../db/client';
import { accessTokenStore } from '../repos/access-tokens';
import { auditStore } from '../repos/audit';
import { buildServer } from '../server';

/**
 * T772 (AC-470, with AC-431): Security › Access tokens. A Super-Admin lists
 * every user's tokens, working and stopped, with owner, name, scopes, made,
 * expires and last used, and never their text; and revokes any of them, the
 * owner then seeing that Super-Admin as who revoked it. To anyone else the
 * routes are as none: 404.
 *
 * `writer` is Wren Writer; `super` a Super-Admin.
 */
const MARK = `patadm${randomUUID().replaceAll('-', '').slice(0, 8)}`;

let app: FastifyInstance;
const cookies: Record<string, string> = {};
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
    accessTokens: accessTokenStore(getDb()),
  });
  for (const who of ['super', 'writer', 'reader']) cookies[who] = await signIn(app, USERS[who]!);
});

afterAll(async () => {
  if (app !== undefined) await app.close();
  await getDb().deleteFrom('personal_access_tokens').where('name', 'like', `%${MARK}%`).execute();
  await closeDb();
});

const as = (who: string, options: InjectOptions) =>
  app.inject({ ...options, headers: { ...options.headers, cookie: cookies[who]! } });
const made = async (who: string, name: string, scopes: string[] = ['read']) => {
  const answer = await as(who, {
    method: 'POST',
    url: '/api/account/tokens',
    payload: { name, scopes, days: 7 },
  });
  expect(answer.statusCode, answer.body).toBe(201);
  return answer.json<{ token: { id: string }; text: string }>();
};

interface Everyone {
  id: string;
  name: string;
  owner: { key: string; name: string };
  yours: boolean;
  scopes: string[];
  createdAt: string;
  expiresAt: string;
  lastUsedAt: string | null;
  state: 'working' | 'revoked' | 'expired';
  stoppedAt: string | null;
  revokedBy: { name: string } | null;
}
const everyone = async (): Promise<Everyone[]> => {
  const answer = await as('super', { method: 'GET', url: '/api/security/tokens' });
  expect(answer.statusCode, answer.body).toBe(200);
  return answer.json<{ tokens: Everyone[] }>().tokens.filter((each) => each.name.includes(MARK));
};

describe('every user’s tokens, to a Super-Admin (T772, AC-470)', () => {
  it('lists working and stopped tokens with owner and fields, never the text', async () => {
    const wren = await made('writer', `Claude Code · laptop ${MARK}`, ['read', 'workspace-edit']);
    const ada = await made('super', `admin box ${MARK}`);
    const gone = await made('writer', `CI experiment ${MARK}`);
    expect(
      (await as('writer', { method: 'DELETE', url: `/api/account/tokens/${gone.token.id}` }))
        .statusCode,
    ).toBe(204);

    const answer = await as('super', { method: 'GET', url: '/api/security/tokens' });
    expect(answer.headers['cache-control']).toBe('no-store');
    for (const { text } of [wren, ada, gone]) expect(answer.body).not.toContain(text.slice(4, 68));
    expect(answer.body).not.toMatch(/digest/i);

    const listed = await everyone();
    // Newest first.
    expect(listed.map((each) => each.id)).toEqual([gone.token.id, ada.token.id, wren.token.id]);
    const laptop = listed.find((each) => each.id === wren.token.id)!;
    expect(laptop).toMatchObject({
      name: `Claude Code · laptop ${MARK}`,
      owner: { name: 'Wren Writer' },
      yours: false,
      scopes: ['read', 'workspace-edit'],
      state: 'working',
      stoppedAt: null,
      revokedBy: null,
      lastUsedAt: null,
    });
    expect(Date.parse(laptop.createdAt)).toBeLessThan(Date.parse(laptop.expiresAt));
    expect(listed.find((each) => each.id === ada.token.id)).toMatchObject({
      owner: { name: 'Super Admin' },
      yours: true,
    });
    expect(listed.find((each) => each.id === gone.token.id)).toMatchObject({
      state: 'revoked',
      revokedBy: { name: 'Wren Writer' },
    });
  });

  it('is as none to anyone else: 404', async () => {
    for (const who of ['writer', 'reader']) {
      expect((await as(who, { method: 'GET', url: '/api/security/tokens' })).statusCode).toBe(404);
    }
  });
});

describe('a Super-Admin revoking another user’s token (T772, AC-470, AC-431)', () => {
  it('stops it, and the owner’s list names that Super-Admin as who revoked it', async () => {
    const name = `revoked by admin ${MARK}`;
    const { token } = await made('writer', name);
    const before = new Date(Date.now() - 1000);
    const answer = await as('super', { method: 'DELETE', url: `/api/security/tokens/${token.id}` });
    expect(answer.statusCode, answer.body).toBe(204);

    const own = await as('writer', { method: 'GET', url: '/api/account/tokens' });
    const lists = own.json<{
      tokens: { id: string }[];
      stopped: { id: string; state: string; revokedBy: { name: string } | null }[];
    }>();
    expect(lists.tokens.map((each) => each.id)).not.toContain(token.id);
    expect(lists.stopped.find((each) => each.id === token.id)).toEqual(
      expect.objectContaining({ state: 'revoked', revokedBy: { name: 'Super Admin' } }),
    );
    expect((await everyone()).find((each) => each.id === token.id)?.state).toBe('revoked');

    // "Token revoked" names the Super-Admin as who did it (AC-442).
    const { records } = await audit().list({
      events: ['token-revoked'],
      since: before,
      limit: 200,
    });
    expect(records.find((each) => each.item?.id === token.id)).toMatchObject({
      actor: { name: 'Super Admin' },
      summary: `Wren Writer’s ${name}`,
    });
  });

  it('answers 409 for a token that already doesn’t work, 404 for none', async () => {
    const { token } = await made('writer', `twice ${MARK}`);
    const url = `/api/security/tokens/${token.id}`;
    expect((await as('super', { method: 'DELETE', url })).statusCode).toBe(204);
    expect((await as('super', { method: 'DELETE', url })).statusCode).toBe(409);
    expect(
      (await as('super', { method: 'DELETE', url: `/api/security/tokens/${randomUUID()}` }))
        .statusCode,
    ).toBe(404);
  });

  it('is refused to anyone else, with 404, and the token keeps working', async () => {
    const { token } = await made('super', `not theirs ${MARK}`);
    const answer = await as('writer', {
      method: 'DELETE',
      url: `/api/security/tokens/${token.id}`,
    });
    expect(answer.statusCode).toBe(404);
    expect((await everyone()).find((each) => each.id === token.id)?.state).toBe('working');
  });
});
