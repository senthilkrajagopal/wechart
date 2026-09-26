import type { FastifyInstance } from 'fastify';
import { describe, expect, it, vi } from 'vitest';

import { CubeClient } from '../cube/client';
import type { Config } from '../config';
import { memoryDraftStore } from '../model/drafts';
import { buildServer, type ModelFile, type ModelFileStore } from '../server';
import { xcubeAdmin } from './client';
import { fakeXcube, FAKE_ADMIN_TOKEN } from './fake';
import { memoryPublications } from './publications';
import { contentHashOf, modelSync } from './snapshot';

/**
 * T419, AC-333, through the publish route: a publish is committed to wechart's
 * store first, and then sent to xcube; one whose send is lost still stands in
 * wechart, and the next reconcile sends it.
 *
 * The publish's own check is today's (a Cube that reads the draft back);
 * T445 replaces it with xcube's dry run.
 */
const KEY = 'model-key';
const config: Config = {
  port: 0,
  cubeApiUrl: 'http://cube.invalid/cubejs-api',
  cubeApiSecret: 'secret',
  securityContext: {},
  modelDir: '',
  modelKey: KEY,
  cubeStoreUrl: 'http://host.docker.internal:4100',
};
const ORDERS: ModelFile = { path: 'cubes/orders.yml', content: 'cubes:\n  - name: orders\n' };

function store(initial: readonly ModelFile[]): ModelFileStore & { files: ModelFile[] } {
  const held = {
    files: [...initial],
    list: async () => held.files,
    seed: async () => undefined,
    write: async (files: readonly ModelFile[]) => {
      for (const file of files)
        held.files = [...held.files.filter((each) => each.path !== file.path), file];
    },
  };
  return held;
}

/** A Cube that reads each draft back through the same API, and compiles it. */
function cubeReading(reader: { app?: FastifyInstance }) {
  const client = new CubeClient({
    apiUrl: config.cubeApiUrl,
    apiSecret: 'secret',
    securityContext: {},
  });
  return Object.create(client, {
    meta: {
      value: async (context?: Record<string, unknown>) => {
        const draft = context?.['wechartDraft'];
        if (typeof draft === 'string')
          await reader.app!.inject({
            method: 'GET',
            url: `/api/cube-model/drafts/${draft}`,
            headers: { 'x-wechart-model-key': KEY },
          });
        return { cubes: [] };
      },
    },
    sqlUnder: { value: async () => ({ sql: {} }) },
  }) as CubeClient;
}

function serving(
  files: ModelFileStore & { files: ModelFile[] },
  stub: ReturnType<typeof fakeXcube>,
) {
  const reader: { app?: FastifyInstance } = {};
  const sync = modelSync({
    model: 'dev',
    admin: xcubeAdmin({
      cubeApiUrl: config.cubeApiUrl,
      model: 'dev',
      token: FAKE_ADMIN_TOKEN,
      fetch: stub.fetch,
    }),
    files: () => files.list(),
    publications: memoryPublications(),
    log: { warn: vi.fn(), info: vi.fn() },
  });
  const app = buildServer({
    config,
    modelFiles: files,
    drafts: memoryDraftStore(),
    cube: cubeReading(reader),
    afterPublish: () => sync.sync('publish'),
  });
  reader.app = app;
  return { app, sync };
}

const edited = { ...ORDERS, content: 'cubes:\n  - name: orders\n    title: Orders\n' };

describe('a publish, sent to xcube after it is committed (T419, AC-333)', () => {
  it('sends the whole set, as the store holds it once the publish is written', async () => {
    const files = store([ORDERS]);
    const stub = fakeXcube();
    const { app } = serving(files, stub);

    const published = await app.inject({
      method: 'POST',
      url: '/api/model/publish',
      payload: { files: [edited] },
    });

    expect(published.statusCode).toBe(200);
    expect(stub.head('dev')?.contentHash).toBe(contentHashOf([edited]));
    await app.close();
  });

  it('stands in wechart when xcube can’t be reached, and is sent by the next reconcile', async () => {
    const files = store([ORDERS]);
    const stub = fakeXcube();
    const { app, sync } = serving(files, stub);
    stub.down(true);

    const published = await app.inject({
      method: 'POST',
      url: '/api/model/publish',
      payload: { files: [edited] },
    });

    // Committed: wechart is the system of record, and xcube is never ahead of it.
    expect(published.statusCode).toBe(200);
    expect(files.files).toEqual([edited]);
    expect(stub.head('dev')).toBeUndefined();

    stub.down(false);
    await sync.sync('reconcile');
    expect(stub.head('dev')?.contentHash).toBe(contentHashOf([edited]));
    await app.close();
  });
});
