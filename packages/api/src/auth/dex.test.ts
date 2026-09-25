import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * T315 (AC-257, the compose half): the development OIDC provider, Dex 2.45.1,
 * runs beside wechart in docker-compose with the test users and their groups
 * (research/dex.md). vitest.globalSetup.ts starts it.
 *
 * The users are test values for this application only, kept in
 * infra/dex/test-users.json; infra/dex/config.yaml holds their bcrypt hashes.
 */
interface TestUser {
  readonly email: string;
  readonly password: string;
  readonly groups: readonly string[];
}

const USERS = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('../../../../infra/dex/test-users.json', import.meta.url)),
    'utf8',
  ),
) as Record<string, TestUser>;

const ISSUER = process.env['DEX_ISSUER'] ?? 'http://localhost:5556/dex';
const CLIENT = {
  id: 'wechart',
  secret: process.env['WECHART_OIDC_CLIENT_SECRET'] ?? 'dev-oidc-secret',
};

/** Dex's password grant, which its test configuration enables (research/dex.md §6). */
async function idTokenClaims(user: TestUser): Promise<Record<string, unknown>> {
  const response = await fetch(`${ISSUER}/token`, {
    method: 'POST',
    headers: {
      authorization: `Basic ${Buffer.from(`${CLIENT.id}:${CLIENT.secret}`).toString('base64')}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'password',
      username: user.email,
      password: user.password,
      scope: 'openid profile email groups',
    }),
  });
  expect(response.status).toBe(200);
  const { id_token: idToken } = (await response.json()) as { id_token: string };
  const payload = idToken.split('.')[1] ?? '';
  return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<string, unknown>;
}

describe('Dex, the development provider, in docker-compose (T315, AC-257)', () => {
  it('answers discovery at the configured issuer', async () => {
    const response = await fetch(`${ISSUER}/.well-known/openid-configuration`);
    expect(response.status).toBe(200);
    const discovery = (await response.json()) as { issuer: string; scopes_supported: string[] };
    expect(discovery.issuer).toBe(ISSUER);
    expect(discovery.scopes_supported).toContain('groups');
  });

  it('puts all 20 of the 20-group user’s groups in the ID token', async () => {
    const many = USERS['many'];
    expect(many?.groups).toHaveLength(20);
    const claims = await idTokenClaims(many!);
    expect(claims['groups']).toEqual(many!.groups);
    expect(claims['iss']).toBe(ISSUER);
  });

  it('gives every test user exactly their groups, and no groups claim to one with none', async () => {
    for (const [name, user] of Object.entries(USERS)) {
      const claims = await idTokenClaims(user);
      if (user.groups.length === 0) expect(claims['groups'], name).toBeUndefined();
      else expect(claims['groups'], name).toEqual(user.groups);
      expect(claims['email'], name).toBe(user.email);
    }
  });

  it('refuses a wrong password', async () => {
    const response = await fetch(`${ISSUER}/token`, {
      method: 'POST',
      headers: {
        authorization: `Basic ${Buffer.from(`${CLIENT.id}:${CLIENT.secret}`).toString('base64')}`,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'password',
        username: USERS['writer']!.email,
        password: 'not-the-password',
        scope: 'openid groups',
      }),
    });
    // The password refused, not the client or the route (T315's review).
    expect(response.status).toBe(401);
    expect(((await response.json()) as { error: string }).error).toBe('access_denied');
  });
});
