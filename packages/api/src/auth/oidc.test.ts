import { afterAll, describe, expect, it } from 'vitest';

import { closeDb, getDb } from '../db/client';
import { buildServer } from '../server';
import { identityFrom } from './oidc';
import { pgSessionStore } from './session-store';
import { cookieOf, PUBLIC_URL, signIn, signInAtDex, USERS } from './sign-in.fixture';

/**
 * T777 (AC-471): each web sign-in records the user's groups, as the
 * provider sent them, and when: the groups their tokens act with on `/mcp`.
 */
describe('a web sign-in', () => {
  afterAll(async () => {
    await closeDb();
  });

  /** Sign-in on, its sign-ins kept by `signIns` and its audit records in `audited`. */
  const server = (
    signIns: { record: (key: string, groups: readonly string[], at: Date) => Promise<void> },
    audited: { actor: { key: string } }[] = [],
  ) =>
    buildServer({
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
      signIns: { ...signIns, latest: async () => undefined },
      audit: {
        record: async (entry: { actor: { key: string } }) => {
          audited.push(entry);
        },
      } as never,
    });

  it('records the user’s groups and the time, under the key the session has', async () => {
    const recorded: { key: string; groups: readonly string[]; at: Date }[] = [];
    const audited: { actor: { key: string } }[] = [];
    const app = server(
      {
        record: async (key, groups, at) => {
          recorded.push({ key, groups, at });
        },
      },
      audited,
    );
    try {
      const before = Date.now();
      const cookie = await signIn(app, USERS.writer!);
      const me = await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } });
      expect(recorded).toHaveLength(1);
      // The key the session's user has, as the sign-in's audit record names it.
      expect(audited.map((entry) => entry.actor.key)).toEqual([recorded[0]!.key]);
      expect(recorded[0]!.groups).toEqual(me.json<{ groups: string[] }>().groups);
      expect(recorded[0]!.groups).toEqual(USERS.writer!.groups);
      expect(recorded[0]!.at.getTime()).toBeGreaterThanOrEqual(before);
      expect(recorded[0]!.at.getTime()).toBeLessThanOrEqual(Date.now());
    } finally {
      await app.close();
    }
  });

  it('fails, on wechart’s own page, and signs no one in, where the groups can’t be kept', async () => {
    const app = server({
      record: async () => {
        throw new Error('the metadata database is away');
      },
    });
    try {
      const login = await app.inject({ method: 'GET', url: '/api/auth/login?returnTo=/explore' });
      const callback = new URL(await signInAtDex(login.headers.location as string, USERS.writer!));
      const done = await app.inject({
        method: 'GET',
        url: `${callback.pathname}${callback.search}`,
        headers: { cookie: cookieOf(login.headers['set-cookie']) },
      });
      expect(done.statusCode).toBe(302);
      expect(done.headers.location).toBe('/sign-in-failed');
      const cookie = cookieOf(done.headers['set-cookie'] ?? login.headers['set-cookie']);
      const me = await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } });
      expect(me.statusCode).toBe(401);
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
