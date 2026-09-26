import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Config } from '../config';
import { buildServer } from '../server';
import { FAKE_ADMIN_TOKEN } from './fake';
import { memoryPublications } from './publications';

/**
 * T421, AC-334, through the server as `main.ts` builds it: where the
 * deployment names its model in xcube, every token wechart signs for Cube
 * names that model and the revision last recorded for it, and the field list
 * follows that revision as soon as it is recorded, whichever replica recorded
 * it (research `xcube-slice-2.md`, "Token claims").
 */
let server: Server;
let cubeApiUrl = '';
const tokens: Record<string, unknown>[] = [];

beforeAll(async () => {
  server = createServer((request, response) => {
    const token = (request.headers.authorization ?? '').replace(/^Bearer /, '');
    tokens.push(
      JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString()) as Record<
        string,
        unknown
      >,
    );
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ cubes: [] }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  cubeApiUrl = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}/cubejs-api`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

const configOf = (xcube: Config['xcube']): Config => ({
  port: 0,
  cubeApiUrl,
  cubeApiSecret: 'secret',
  securityContext: { tenant: 'acme' },
  modelDir: '',
  ...(xcube === undefined ? {} : { xcube }),
});

describe('the model and its revision in Cube’s tokens (T421, AC-334)', () => {
  it('names the model and the recorded revision, and asks again when it changes', async () => {
    tokens.length = 0;
    const publications = memoryPublications();
    await publications.put('dev', { generation: 'g', revision: 3, contentHash: 'h3' });
    const app = buildServer({
      config: configOf({ model: 'dev', adminToken: FAKE_ADMIN_TOKEN }),
      publications,
    });

    await app.inject({ method: 'GET', url: '/api/meta' });
    await app.inject({ method: 'GET', url: '/api/meta' });
    expect(tokens).toEqual([
      expect.objectContaining({ tenant: 'acme', wechartModel: 'dev', wechartRevision: 3 }),
    ]);

    // Recorded by another replica's publish: this one's field list follows at once.
    await publications.put('dev', { generation: 'g', revision: 4, contentHash: 'h4' });
    await app.inject({ method: 'GET', url: '/api/meta' });
    expect(tokens.at(-1)).toEqual(
      expect.objectContaining({ wechartModel: 'dev', wechartRevision: 4 }),
    );
    expect(tokens).toHaveLength(2);
    await app.close();
  });

  it('names the model alone before xcube has acknowledged a revision of it', async () => {
    tokens.length = 0;
    const app = buildServer({
      config: configOf({ model: 'dev', adminToken: FAKE_ADMIN_TOKEN }),
      publications: memoryPublications(),
    });

    await app.inject({ method: 'GET', url: '/api/meta' });

    expect(tokens).toHaveLength(1);
    expect(tokens[0]).toEqual(expect.objectContaining({ wechartModel: 'dev' }));
    expect(tokens[0]).not.toHaveProperty('wechartRevision');
    await app.close();
  });

  /** T421's review: the record read for every request is not what breaks a chart. */
  it('keeps to the last revision it read while the record can’t be read', async () => {
    tokens.length = 0;
    const publications = memoryPublications();
    await publications.put('dev', { generation: 'g', revision: 3, contentHash: 'h3' });
    let down = false;
    const app = buildServer({
      config: configOf({ model: 'dev', adminToken: FAKE_ADMIN_TOKEN }),
      publications: {
        ...publications,
        get: async (model) => {
          if (down) throw new Error('the metadata database is away');
          return publications.get(model);
        },
      },
    });
    await app.inject({ method: 'GET', url: '/api/meta' });

    down = true;
    const loaded = await app.inject({
      method: 'POST',
      url: '/api/load',
      payload: { query: { measures: ['orders.count'] } },
    });

    expect(loaded.statusCode).toBe(200);
    expect(tokens.at(-1)).toEqual(
      expect.objectContaining({ wechartModel: 'dev', wechartRevision: 3 }),
    );
    expect((await app.inject({ method: 'GET', url: '/api/meta' })).statusCode).toBe(200);
    await app.close();
  });

  it('names no model where xcube isn’t configured, as before the cut-over', async () => {
    tokens.length = 0;
    const app = buildServer({ config: configOf(undefined) });

    await app.inject({ method: 'GET', url: '/api/meta' });

    expect(tokens).toHaveLength(1);
    expect(tokens[0]).not.toHaveProperty('wechartModel');
    expect(tokens[0]).not.toHaveProperty('wechartRevision');
    await app.close();
  });
});
