import { describe, expect, it } from 'vitest';

import { ConfigError, loadConfig } from '../config';
import { buildServer } from '../server';

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

describe('the security mode (T311)', () => {
  it('is off unless the deployment turns it on', () => {
    expect(loadConfig({ CUBE_API_SECRET: 's' }).security).toBe('off');
    expect(loadConfig({ CUBE_API_SECRET: 's', WECHART_SECURITY: 'oidc' }).security).toBe('oidc');
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
    expect(response.json()).toEqual({ name: 'admin', superAdmin: true, security: 'off' });
    await app.close();
  });

  it('carries that user on every request, with no session asked for', async () => {
    const app = buildServer({ config: { ...config, security: 'off' as const } });
    app.get('/probe', async (request) => request.wechartUser);

    const response = await app.inject({ method: 'GET', url: '/probe' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ key: 'admin', name: 'admin', groups: [], superAdmin: true });
    expect(response.headers['set-cookie']).toBeUndefined();
    await app.close();
  });
});

describe('with security on and nobody signed in, no one is the Super-Admin (T311’s review)', () => {
  it('carries no user, and never falls back to the single user', async () => {
    const app = buildServer({ config: { ...config, security: 'oidc' as const } });
    app.get('/probe', async (request) => ({ user: request.wechartUser }));

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
      config: { ...config, security: 'oidc' as const },
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
