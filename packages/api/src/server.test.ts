import { describe, expect, it } from 'vitest';

import { CubeClient, CubeError } from './cube/client';
import { ConfigError, loadConfig } from './config';
import { buildServer } from './server';

/**
 * AC-007: WHEN the browser needs data or metadata, THE SYSTEM SHALL obtain it
 * through the wechart API, and the browser SHALL make no request to the Cube
 * API host. This file covers the service half — that the API answers for
 * metadata and queries, and that no reply it produces carries the Cube secret.
 * The browser half is demonstrated at T024.
 */
const SECRET = 'cube-secret-must-not-leak';

const config = {
  cubeApiUrl: 'http://cube.invalid/cubejs-api',
  cubeApiSecret: SECRET,
  securityContext: { tenant: 'acme' },
  port: 4100,
};

/** A CubeClient whose outbound call is replaced, so no network is touched. */
function stubCube(handler: () => unknown): CubeClient {
  const client = new CubeClient({
    apiUrl: config.cubeApiUrl,
    apiSecret: SECRET,
    securityContext: config.securityContext,
  });
  const run = async () => handler();
  return Object.create(client, {
    meta: { value: run },
    load: { value: run },
  }) as CubeClient;
}

describe('the API answers for Cube (AC-007)', () => {
  it('serves metadata', async () => {
    const app = buildServer({ config, cube: stubCube(() => ({ cubes: [{ name: 'Orders' }] })) });

    const response = await app.inject({ method: 'GET', url: '/api/meta' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ cubes: [{ name: 'Orders' }] });
    await app.close();
  });

  it('serves a query result', async () => {
    const app = buildServer({
      config,
      cube: stubCube(() => ({ data: [{ 'Orders.count': '4' }] })),
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/load',
      payload: { query: { measures: ['Orders.count'] } },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ data: [{ 'Orders.count': '4' }] });
    await app.close();
  });

  it('refuses a load with no query rather than passing it to Cube', async () => {
    let reached = false;
    const app = buildServer({
      config,
      cube: stubCube(() => {
        reached = true;
        return {};
      }),
    });

    const response = await app.inject({ method: 'POST', url: '/api/load', payload: {} });

    expect(response.statusCode).toBe(400);
    expect(reached).toBe(false);
    await app.close();
  });
});

describe('the Cube secret never reaches the browser (AC-007)', () => {
  it('is absent from a successful reply', async () => {
    const app = buildServer({ config, cube: stubCube(() => ({ cubes: [] })) });

    const response = await app.inject({ method: 'GET', url: '/api/meta' });

    expect(response.body).not.toContain(SECRET);
    expect(JSON.stringify(response.headers)).not.toContain(SECRET);
    await app.close();
  });

  it('is absent from a reply when Cube fails, while Cube’s message survives', async () => {
    const app = buildServer({
      config,
      cube: stubCube(() => {
        throw new CubeError("Can't find join path between Orders and Suppliers", 400);
      }),
    });

    const response = await app.inject({ method: 'POST', url: '/api/load', payload: { query: {} } });

    expect(response.statusCode).toBe(400);
    expect(response.body).not.toContain(SECRET);
    // AC-012 depends on this message reaching the tile.
    expect(response.json()).toMatchObject({ error: expect.stringContaining('join path') });
    await app.close();
  });

  it('is absent from a reply when the service itself fails', async () => {
    const app = buildServer({
      config,
      cube: stubCube(() => {
        throw new Error(`boom, secret was ${SECRET}`);
      }),
    });

    const response = await app.inject({ method: 'GET', url: '/api/meta' });

    expect(response.statusCode).toBe(500);
    expect(response.body).not.toContain(SECRET);
    expect(response.json()).toEqual({ error: 'Internal error' });
    await app.close();
  });
});

describe('configuration', () => {
  it('refuses to start without a Cube secret', () => {
    expect(() => loadConfig({ CUBE_API_URL: 'http://cube.invalid' })).toThrow(ConfigError);
  });

  it('reads the security context as JSON', () => {
    const loaded = loadConfig({
      CUBE_API_SECRET: 'x',
      WECHART_SECURITY_CONTEXT: '{"tenant":"acme"}',
    });

    expect(loaded.securityContext).toEqual({ tenant: 'acme' });
  });

  it('refuses a security context that is not a JSON object', () => {
    expect(() => loadConfig({ CUBE_API_SECRET: 'x', WECHART_SECURITY_CONTEXT: '[1,2]' })).toThrow(
      ConfigError,
    );
    expect(() => loadConfig({ CUBE_API_SECRET: 'x', WECHART_SECURITY_CONTEXT: 'nope' })).toThrow(
      ConfigError,
    );
  });

  it('treats an absent security context as no claims, not as an error', () => {
    expect(loadConfig({ CUBE_API_SECRET: 'x' }).securityContext).toEqual({});
  });
});
