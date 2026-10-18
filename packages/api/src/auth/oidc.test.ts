import { afterAll, describe, expect, it } from 'vitest';

import { closeDb, getDb } from '../db/client';
import { buildServer } from '../server';
import { identityFrom } from './oidc';
import { pgSessionStore } from './session-store';
import { PUBLIC_URL, signIn, USERS } from './sign-in.fixture';

/**
 * T777 (AC-471): each web sign-in records the user's groups, as the
 * provider sent them, and when: the groups their tokens act with on `/mcp`.
 */
describe('a web sign-in', () => {
  afterAll(async () => {
    await closeDb();
  });

  it('records the user’s groups and the time', async () => {
    const recorded: { key: string; groups: readonly string[]; at: Date }[] = [];
    const app = buildServer({
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
      signIns: {
        record: async (key, groups, at) => {
          recorded.push({ key, groups, at });
        },
        latest: async () => undefined,
      },
    });
    try {
      const before = Date.now();
      const cookie = await signIn(app, USERS.writer!);
      const me = await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } });
      expect(recorded).toHaveLength(1);
      expect(recorded[0]!.key.length).toBeGreaterThan(0);
      expect(recorded[0]!.groups).toEqual(me.json<{ groups: string[] }>().groups);
      expect(recorded[0]!.groups).toEqual(USERS.writer!.groups);
      expect(recorded[0]!.at.getTime()).toBeGreaterThanOrEqual(before);
      expect(recorded[0]!.at.getTime()).toBeLessThanOrEqual(Date.now());
    } finally {
      await app.close();
    }
  });
});

/**
 * T319 (AC-252; references.md › Phase 2 › Surface 1): the account menu shows,
 * under the name, the identity as the provider sent it. From the standard
 * claims (OIDC Core §5.1, research/dex.md and authelia.md): the email, else the
 * username, else the subject.
 */
describe('the identity the account menu shows', () => {
  it('is the email where the token has one', () => {
    expect(identityFrom({ sub: 's1', email: 'wren@example.com', preferred_username: 'wren' })).toBe(
      'wren@example.com',
    );
  });

  it('is the username without an email, and the subject without either', () => {
    expect(identityFrom({ sub: 's1', preferred_username: 'wren' })).toBe('wren');
    expect(identityFrom({ sub: 's1', email: '' })).toBe('s1');
  });

  it('skips a claim that isn’t text', () => {
    expect(identityFrom({ sub: 's1', email: ['a@example.com'] })).toBe('s1');
    expect(identityFrom({})).toBe('unknown');
  });
});
