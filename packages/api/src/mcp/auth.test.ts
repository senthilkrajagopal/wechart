import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { pgSessionStore } from '../auth/session-store';
import { PUBLIC_URL, signIn, USERS } from '../auth/sign-in.fixture';
import { closeDb, getDb } from '../db/client';
import { accessTokenStore } from '../repos/access-tokens';
import { buildServer } from '../server';
import { mintToken } from './tokenText';

/**
 * T776 (AC-435, AC-431, AC-430): `/mcp` takes a personal access token from
 * `Authorization: Bearer` and nowhere else. With no token, a bad, revoked
 * or expired one, one in the query string, or only the web app's session
 * cookie, it answers 401 with a `WWW-Authenticate: Bearer` challenge and
 * runs nothing; a working token passes, and its Last used moves to the
 * request's time.
 */
const HOST = 'mcp.wechart.example.com';
const store = () => accessTokenStore(getDb());
const DAY = 86_400_000;
const MISSING = 'Bearer error="invalid_token", error_description="Missing Authorization header"';
const REFUSED =
  'Bearer error="invalid_token", error_description="The token is unknown, revoked or expired."';

const base = {
  cubeApiUrl: 'http://cube.invalid/cubejs-api',
  cubeApiSecret: 'secret',
  securityContext: {},
  port: 0,
  modelDir: '',
  security: 'off' as const,
  mcpHost: HOST,
};

/** One token of `owner`'s, made `madeDaysAgo` days ago and lasting `days`. */
async function tokenOf(owner: string, madeDaysAgo: number, days: number) {
  const { text, digest } = mintToken();
  const createdAt = new Date(Date.now() - madeDaysAgo * DAY);
  const token = await store().create({
    owner: { key: owner, name: owner },
    name: `t776 ${owner} ${text.slice(4, 12)}`,
    scopes: ['read'],
    createdAt,
    expiresAt: new Date(createdAt.getTime() + days * DAY),
    digest,
  });
  return { text, id: token.id };
}

const lastUsed = async (owner: string, id: string) =>
  [...(await store().working(owner, new Date())), ...(await store().stopped(owner, new Date()))]
    .find((token) => token.id === id)!.lastUsedAt;

const tools = { jsonrpc: '2.0', id: 1, method: 'tools/list' };

afterAll(async () => {
  await getDb().deleteFrom('personal_access_tokens').where('name', 'like', 't776 %').execute();
  await closeDb();
});

describe('the token on /mcp, sign-in off (T776, AC-435, AC-431, AC-430, AC-479)', () => {
  const owner = `t776-${Date.now()}`;
  let working: { text: string; id: string };
  let revoked: { text: string; id: string };
  let expired: { text: string; id: string };
  let revokedByAdmin: { text: string; id: string };
  beforeAll(async () => {
    working = await tokenOf(owner, 0, 30);
    revoked = await tokenOf(owner, 0, 30);
    await store().revoke(revoked.id, { key: owner, name: owner }, new Date());
    // Revoked by a Super-Admin from Security's list (AC-470).
    revokedByAdmin = await tokenOf(owner, 0, 30);
    await store().revoke(revokedByAdmin.id, { key: 'super', name: 'Super Admin' }, new Date());
    expired = await tokenOf(owner, 8, 7);
  });

  const post = (app: ReturnType<typeof buildServer>, headers: Record<string, string>, url = '/mcp') =>
    app.inject({ method: 'POST', url, headers: { host: HOST, ...headers }, payload: tools });

  it('answers 401 with a Bearer challenge to a missing, bad, revoked or expired token, running nothing', async () => {
    const app = buildServer({ config: base, accessTokens: store() });
    try {
      const cases: [string, Record<string, string>, string, string][] = [
        ['none', {}, '/mcp', MISSING],
        ['the query string', {}, `/mcp?token=${working.text}`, MISSING],
        ['another scheme', { authorization: `Basic ${working.text}` }, '/mcp', ''],
        ['malformed', { authorization: 'Bearer wct_not-a-token' }, '/mcp', REFUSED],
        ['unknown', { authorization: `Bearer ${mintToken().text}` }, '/mcp', REFUSED],
        ['revoked', { authorization: `Bearer ${revoked.text}` }, '/mcp', REFUSED],
        [
          'revoked by a Super-Admin',
          { authorization: `Bearer ${revokedByAdmin.text}` },
          '/mcp',
          REFUSED,
        ],
        ['expired', { authorization: `Bearer ${expired.text}` }, '/mcp', REFUSED],
      ];
      for (const [label, headers, url, challenge] of cases) {
        const answer = await post(app, headers, url);
        expect(answer.statusCode, label).toBe(401);
        if (challenge === '')
          expect(answer.headers['www-authenticate'], label).toBe(
            'Bearer error="invalid_token", error_description="Invalid Authorization header format, expected \'Bearer TOKEN\'"',
          );
        else expect(answer.headers['www-authenticate'], label).toBe(challenge);
        expect(answer.json<{ error: string }>().error, label).toBe('invalid_token');
      }
      // Refused, neither stopped token was used.
      expect(await lastUsed(owner, revoked.id)).toBe(null);
      expect(await lastUsed(owner, revokedByAdmin.id)).toBe(null);
      expect(await lastUsed(owner, expired.id)).toBe(null);
    } finally {
      await app.close();
    }
  });

  it('refuses before the body is read: a body of another type gets the 401 too', async () => {
    const app = buildServer({ config: base, accessTokens: store() });
    try {
      const answer = await app.inject({
        method: 'POST',
        url: '/mcp',
        headers: { host: HOST, 'content-type': 'text/plain' },
        payload: 'not json',
      });
      expect(answer.statusCode).toBe(401);
      expect(answer.headers['www-authenticate']).toBe(MISSING);
    } finally {
      await app.close();
    }
  });

  it('lets a working token through and records when it was last used', async () => {
    const at = new Date('2026-10-17T12:34:56.000Z');
    const app = buildServer({ config: base, accessTokens: store(), now: () => at });
    try {
      const answer = await post(app, { authorization: `Bearer ${working.text}` });
      // Past the token check: until T778 serves MCP, the handler answers 501.
      expect(answer.statusCode).toBe(501);
      expect(answer.headers['www-authenticate']).toBeUndefined();
      expect(await lastUsed(owner, working.id)).toEqual(at);
    } finally {
      await app.close();
    }
  });
});

describe('the token on /mcp, sign-in on (T776, AC-435)', () => {
  const signedIn = () =>
    buildServer({
      config: {
        ...base,
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
      accessTokens: store(),
    });

  it('refuses a request signed in only by the web app’s session cookie', async () => {
    const app = signedIn();
    try {
      const cookie = await signIn(app, USERS.writer!);
      // The cookie is a working session: the web app's own route answers it.
      const web = await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } });
      expect(web.statusCode).toBe(200);
      const answer = await app.inject({
        method: 'POST',
        url: '/mcp',
        headers: { host: HOST, cookie },
        payload: tools,
      });
      expect(answer.statusCode).toBe(401);
      expect(answer.headers['www-authenticate']).toBe(MISSING);
    } finally {
      await app.close();
    }
  });

  it('lets a working token through, with no Origin or the MCP host’s own, past the web app’s cross-site check', async () => {
    const owner = `t776-on-${Date.now()}`;
    const working = await tokenOf(owner, 0, 30);
    const app = signedIn();
    try {
      for (const origin of [undefined, `https://${HOST}`]) {
        const answer = await app.inject({
          method: 'POST',
          url: '/mcp',
          headers: {
            host: HOST,
            authorization: `Bearer ${working.text}`,
            ...(origin === undefined ? {} : { origin }),
          },
          payload: tools,
        });
        expect(answer.statusCode, String(origin)).toBe(501);
      }
    } finally {
      await app.close();
    }
  });

  it('refuses a token a Super-Admin revoked from Security’s list (AC-470, AC-431)', async () => {
    const owner = `t776-sa-${Date.now()}`;
    const token = await tokenOf(owner, 0, 30);
    const app = signedIn();
    try {
      const bearing = () =>
        app.inject({
          method: 'POST',
          url: '/mcp',
          headers: { host: HOST, authorization: `Bearer ${token.text}` },
          payload: tools,
        });
      expect((await bearing()).statusCode).toBe(501);
      const cookie = await signIn(app, USERS.super!);
      const revoke = await app.inject({
        method: 'DELETE',
        url: `/api/security/tokens/${token.id}`,
        headers: { cookie, origin: PUBLIC_URL },
      });
      expect(revoke.statusCode).toBe(204);
      const after = await bearing();
      expect(after.statusCode).toBe(401);
      expect(after.headers['www-authenticate']).toBe(REFUSED);
    } finally {
      await app.close();
    }
  });
});
