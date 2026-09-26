import type { FastifyInstance } from 'fastify';
import { afterAll, describe, expect, it } from 'vitest';

import { CubeClient } from '../cube/client';
import type { Config } from '../config';
import { closeDb, getDb } from '../db/client';
import { buildServer, type ModelFile, type ModelFileStore } from '../server';
import { publishDraftStore } from './drafts';

/**
 * T418, AC-319: "Any API replica SHALL serve any request, keeping no work of
 * its own in memory."
 *
 * A publish asks Cube to compile a draft, and Cube reads that draft back
 * through wechart's API, which with two replicas can be the other one
 * (research/cube/ha-topology.md, table row 1). Held in one process's memory,
 * the other answers 404 and nothing is published. Held in the metadata
 * database, either replica answers it. This lasts until slice 3 removes the
 * read-back (T431).
 */
const KEY = 'model-key';
const config: Config = {
  port: 0,
  cubeApiUrl: 'http://cube.invalid/cubejs-api',
  cubeApiSecret: 'secret',
  securityContext: { tenant: 'acme' },
  modelDir: '',
  modelKey: KEY,
  cubeStoreUrl: 'http://host.docker.internal:4100',
};

const ORDERS = { path: 'cubes/orders.yml', content: 'cubes:\n  - name: orders\n' };

/** One model store for both replicas, as the metadata database is. */
function shared(initial: readonly ModelFile[]): ModelFileStore & { files: ModelFile[] } {
  const store = {
    files: [...initial],
    list: async () => store.files,
    seed: async () => undefined,
    write: async (files: readonly ModelFile[]) => {
      for (const file of files) {
        store.files = [...store.files.filter((each) => each.path !== file.path), file];
      }
    },
  };
  return store;
}

/**
 * A Cube that reads each draft through `reader`, whichever replica its request
 * reaches, and records what it was answered; or, with `reading` off, answers
 * without reading it, as a Cube reading another model would.
 */
function cubeReadingThrough(reader: { app?: FastifyInstance }, reading = true) {
  const client = new CubeClient({
    apiUrl: config.cubeApiUrl,
    apiSecret: 'secret',
    securityContext: config.securityContext,
  });
  const asked: { draft?: string; status: number }[] = [];
  const meta = async (context?: Record<string, unknown>) => {
    const draft = context?.['wechartDraft'];
    if (!reading || typeof draft !== 'string') return { cubes: [] };
    const response = await reader.app!.inject({
      method: 'GET',
      url: `/api/cube-model/drafts/${draft}`,
      headers: { 'x-wechart-model-key': KEY },
    });
    asked.push({ draft, status: response.statusCode });
    return { cubes: [] };
  };
  const cube = Object.create(client, {
    meta: { value: meta },
    sqlUnder: { value: async () => ({ sql: {} }) },
  }) as CubeClient;
  return { cube, asked };
}

const draftRow = (id: string) =>
  getDb().selectFrom('publish_drafts').select('id').where('id', '=', id).executeTakeFirst();

afterAll(async () => {
  await closeDb();
});

describe('a publish through one replica, read back by Cube through the other (T418, AC-319)', () => {
  it('publishes, holding no draft in the process that asked', async () => {
    const store = shared([ORDERS]);
    const other: { app?: FastifyInstance } = {};
    const { cube, asked } = cubeReadingThrough(other);
    const first = buildServer({
      config,
      modelFiles: store,
      drafts: publishDraftStore(getDb()),
      cube,
    });
    other.app = buildServer({
      config,
      modelFiles: store,
      drafts: publishDraftStore(getDb()),
    });
    const edited = { ...ORDERS, content: 'cubes:\n  - name: orders\n    title: Orders\n' };

    const response = await first.inject({
      method: 'POST',
      url: '/api/model/publish',
      payload: { files: [edited] },
    });

    // The other replica had the draft, and answered it.
    expect(asked.length).toBeGreaterThan(0);
    expect(asked.every(({ status }) => status === 200)).toBe(true);
    expect(response.statusCode).toBe(200);
    expect(store.files).toEqual([edited]);
    // Gone once answered, from the database as from memory.
    expect(await draftRow(asked[0]!.draft!)).toBeUndefined();
    await first.close();
    await other.app.close();
  });

  it('still refuses a publish Cube answered without reading, and keeps no draft', async () => {
    const store = shared([ORDERS]);
    let made: string | undefined;
    const drafts = publishDraftStore(getDb());
    const watched = {
      ...drafts,
      put: async (id: string, files: Parameters<typeof drafts.put>[1]) => {
        made = id;
        await drafts.put(id, files);
      },
    };
    const app = buildServer({
      config,
      modelFiles: store,
      drafts: watched,
      cube: cubeReadingThrough({}, false).cube,
    });
    const edited = { ...ORDERS, content: 'cubes:\n  - name: orders\n    title: Orders\n' };

    const response = await app.inject({
      method: 'POST',
      url: '/api/model/publish',
      payload: { files: [edited] },
    });

    expect(response.statusCode).toBe(502);
    expect(response.json<{ error: string }>().error).toMatch(/without reading the change/);
    expect(store.files).toEqual([ORDERS]);
    expect(made).toBeDefined();
    expect(await draftRow(made!)).toBeUndefined();
    await app.close();
  });

  it('answers 404 for a draft that isn’t there, and only to Cube’s key', async () => {
    const app = buildServer({
      config,
      modelFiles: shared([ORDERS]),
      drafts: publishDraftStore(getDb()),
    });
    const missing = await app.inject({
      method: 'GET',
      url: '/api/cube-model/drafts/00000000-0000-4000-8000-000000000000',
      headers: { 'x-wechart-model-key': KEY },
    });
    expect(missing.statusCode).toBe(404);
    // A malformed id is a draft that isn't there, not a server fault.
    const malformed = await app.inject({
      method: 'GET',
      url: '/api/cube-model/drafts/not-a-draft',
      headers: { 'x-wechart-model-key': KEY },
    });
    expect(malformed.statusCode).toBe(404);
    const unkeyed = await app.inject({
      method: 'GET',
      url: '/api/cube-model/drafts/00000000-0000-4000-8000-000000000000',
    });
    expect(unkeyed.statusCode).toBe(401);
    await app.close();
  });
});
