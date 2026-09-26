import { describe, expect, it, vi } from 'vitest';

import type { Config } from '../config';
import { buildServer, type ModelFile, type ModelFileStore } from '../server';
import { xcubeAdmin } from './client';
import { fakeXcube, FAKE_ADMIN_TOKEN } from './fake';
import { itemsHashOf, itemsOf } from './items';
import { memoryPublications } from './publications';
import { modelSync } from './snapshot';

/** What xcube holds of these files, as items (T449). */
const itemsHash = (files: readonly ModelFile[]) => itemsHashOf(itemsOf(files));

/**
 * T419, AC-333, through the publish route: a publish is committed to wechart's
 * store first, and then sent to xcube; one whose send is lost still stands in
 * wechart, and the next reconcile sends it.
 *
 * The publish is checked by xcube's dry run (T445); its send is lost between
 * that check and the push, as when xcube goes away in the meantime.
 */
const config: Config = {
  port: 0,
  cubeApiUrl: 'http://cube.invalid/cubejs-api',
  cubeApiSecret: 'secret',
  securityContext: {},
  modelDir: '',
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

function serving(
  files: ModelFileStore & { files: ModelFile[] },
  stub: ReturnType<typeof fakeXcube>,
) {
  const admin = (fetch: typeof globalThis.fetch) =>
    xcubeAdmin({ cubeApiUrl: config.cubeApiUrl, model: 'dev', token: FAKE_ADMIN_TOKEN, fetch });
  // The sends after a commit, lost while `lost.on` is set.
  const lost = { on: false };
  const sync = modelSync({
    model: 'dev',
    admin: admin((input, init) =>
      lost.on ? Promise.reject(new TypeError('fetch failed')) : stub.fetch(input, init),
    ),
    files: () => files.list(),
    tree: async () => [{ id: 'froot', parentId: null }],
    publications: memoryPublications(),
    log: { warn: vi.fn(), info: vi.fn() },
  });
  const app = buildServer({
    config,
    modelFiles: files,
    xcube: admin(stub.fetch),
    afterPublish: () => sync.sync('publish'),
  });
  return { app, sync, lost };
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
    expect(stub.head('dev')?.itemsHash).toBe(itemsHash([edited]));
    await app.close();
  });

  it('stands in wechart when xcube can’t be reached, and is sent by the next reconcile', async () => {
    const files = store([ORDERS]);
    const stub = fakeXcube();
    const { app, sync, lost } = serving(files, stub);
    lost.on = true;

    const published = await app.inject({
      method: 'POST',
      url: '/api/model/publish',
      payload: { files: [edited] },
    });

    // Committed: wechart is the system of record, and xcube is never ahead of it.
    expect(published.statusCode).toBe(200);
    expect(files.files).toEqual([edited]);
    expect(stub.head('dev')).toBeUndefined();

    lost.on = false;
    await sync.sync('reconcile');
    expect(stub.head('dev')?.itemsHash).toBe(itemsHash([edited]));
    await app.close();
  });
});
