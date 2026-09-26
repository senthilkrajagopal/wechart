import { describe, expect, it } from 'vitest';

import { ConfigError, loadConfig } from '../config';
import { buildServer } from '../server';
import { PUBLIC, USER } from './guard';

/**
 * T311 (AC-254): WHILE security is disabled, THE SYSTEM SHALL run in
 * single-user mode: no sign-in, and one user holding every permission, as a
 * Super-Admin does. Every request carries its user; with security off it is
 * the one user, a Super-Admin.
 */
const config = {
  cubeApiUrl: 'http://cube.invalid/cubejs-api',
  cubeApiSecret: 'secret',
  securityContext: {},
  port: 4100,
  modelDir: '',
};

/** Security on, with sign-in configured (T316); nothing here reaches the provider. */
const secured = {
  ...config,
  security: 'oidc' as const,
  publicUrl: 'http://localhost:5373',
  sessionSecret: 'a-test-session-secret-at-least-32-characters',
  oidc: {
    issuer: 'http://localhost:5556/dex',
    clientId: 'wechart',
    clientSecret: 'dev-oidc-secret',
    groupsClaim: 'groups',
    scopes: 'openid',
    allowHttp: true,
  },
};

/** What sign-in needs with security on (T316). */
const SIGN_IN_ENV = {
  WECHART_PUBLIC_URL: 'http://localhost:5373',
  WECHART_SESSION_SECRET: 'a-test-session-secret-at-least-32-characters',
  WECHART_OIDC_ISSUER: 'http://localhost:5556/dex',
  WECHART_OIDC_CLIENT_ID: 'wechart',
  WECHART_OIDC_CLIENT_SECRET: 'dev-oidc-secret',
  // Required with sign-in on too (T416, AC-318; the user's R26).
  WECHART_SUPER_ADMIN_GROUP: 'wechart-super-admins',
};

describe('the security mode (T311)', () => {
  it('is off unless the deployment turns it on', () => {
    expect(loadConfig({ CUBE_API_SECRET: 's' }).security).toBe('off');
    expect(
      loadConfig({ CUBE_API_SECRET: 's', WECHART_SECURITY: 'oidc', ...SIGN_IN_ENV }).security,
    ).toBe('oidc');
  });

  it('refuses security on without everything sign-in needs (T316)', () => {
    for (const missing of Object.keys(SIGN_IN_ENV)) {
      const env: Record<string, string> = {
        CUBE_API_SECRET: 's',
        WECHART_SECURITY: 'oidc',
        ...SIGN_IN_ENV,
      };
      delete env[missing];
      expect(() => loadConfig(env), missing).toThrow(new RegExp(missing));
    }
    expect(() =>
      loadConfig({
        CUBE_API_SECRET: 's',
        WECHART_SECURITY: 'oidc',
        ...SIGN_IN_ENV,
        WECHART_SESSION_SECRET: 'too-short',
      }),
    ).toThrow(/32 characters/);
  });

  it('reads the provider’s settings, groups claim and scopes included', () => {
    const loaded = loadConfig({
      CUBE_API_SECRET: 's',
      WECHART_SECURITY: 'oidc',
      ...SIGN_IN_ENV,
      WECHART_OIDC_GROUPS_CLAIM: 'roles',
      WECHART_OIDC_ALLOW_HTTP: 'true',
    });
    expect(loaded.oidc).toEqual({
      issuer: 'http://localhost:5556/dex',
      clientId: 'wechart',
      clientSecret: 'dev-oidc-secret',
      groupsClaim: 'roles',
      // No `groups` scope unless asked for: it is Dex's, and Entra ID refuses
      // it (T316's review).
      scopes: 'openid profile email',
      allowHttp: true,
    });
  });

  it('refuses an https address with no proxy trusted, which could never set the cookie', () => {
    expect(() =>
      loadConfig({
        CUBE_API_SECRET: 's',
        WECHART_SECURITY: 'oidc',
        ...SIGN_IN_ENV,
        WECHART_PUBLIC_URL: 'https://wechart.example',
      }),
    ).toThrow(/WECHART_TRUST_PROXY/);
    expect(
      loadConfig({
        CUBE_API_SECRET: 's',
        WECHART_SECURITY: 'oidc',
        ...SIGN_IN_ENV,
        WECHART_PUBLIC_URL: 'https://wechart.example',
        WECHART_TRUST_PROXY: '10.0.0.5, 10.0.0.6',
      }).trustProxy,
    ).toEqual(['10.0.0.5', '10.0.0.6']);
  });

  it('refuses a mode it does not know, rather than running open', () => {
    expect(() => loadConfig({ CUBE_API_SECRET: 's', WECHART_SECURITY: 'on' })).toThrow(ConfigError);
  });
});

describe('with security off, every request is the single Super-Admin (AC-254)', () => {
  it('names that user, and says security is off', async () => {
    const app = buildServer({ config });

    const response = await app.inject({ method: 'GET', url: '/api/me' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      name: 'admin',
      groups: [],
      superAdmin: true,
      security: 'off',
    });
    await app.close();
  });

  it('carries that user on every request, with no session asked for', async () => {
    const app = buildServer({ config: { ...config, security: 'off' as const } });
    // A route of the test's own, declaring its class as every route must (T318).
    app.get('/probe', USER, async (request) => request.wechartUser);

    const response = await app.inject({ method: 'GET', url: '/probe' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ key: 'admin', name: 'admin', groups: [], superAdmin: true });
    expect(response.headers['set-cookie']).toBeUndefined();
    await app.close();
  });
});

describe('with security on and nobody signed in, no one is the Super-Admin (T311’s review)', () => {
  it('carries no user, and never falls back to the single user', async () => {
    const app = buildServer({ config: secured });
    // Public, so it reaches its handler past the guard (T318) and shows what
    // the request carries: no user at all.
    app.get('/probe', PUBLIC, async (request) => ({ user: request.wechartUser }));

    const probe = await app.inject({ method: 'GET', url: '/probe' });
    expect(probe.json()).toEqual({ user: null });

    const me = await app.inject({ method: 'GET', url: '/api/me' });
    expect(me.statusCode).toBe(401);
    expect(me.json()).toEqual({ error: 'unauthenticated' });
    await app.close();
  });

  it('creates nothing on behalf of a user who isn’t there', async () => {
    const created: unknown[] = [];
    const app = buildServer({
      config: secured,
      documents: {
        create: async (document: unknown) => {
          created.push(document);
          return document;
        },
      } as never,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/documents',
      payload: { kind: 'folder', title: 'Nobody’s' },
    });

    expect(response.statusCode).toBe(401);
    expect(created).toEqual([]);
    await app.close();
  });
});
