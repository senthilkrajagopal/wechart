import { randomUUID } from 'node:crypto';

import { afterAll, describe, expect, it } from 'vitest';

import { closeDb, getDb } from '../db/client';
import { modelFileStore } from './model-files';

/**
 * T137 / AC-131: the model files, kept in wechart's metadata database — the
 * store the user chose for the model (research/cube/spike-model-store-and-
 * quick-calcs.md), which Cube will read through `repositoryFactory` once
 * publishing lands (T143). Until then it starts as a copy of the files Cube
 * reads from disk.
 */
const store = () => modelFileStore(getDb());
const path = (name: string) => `model/test-${randomUUID()}/${name}.yml`;

afterAll(async () => {
  await closeDb();
});

describe('model file store', () => {
  it('seeds a file it does not have, with its content', async () => {
    const file = path('orders');

    await store().seed([{ path: file, content: 'cubes: []\n' }]);

    const files = await store().list();
    expect(files.find((each) => each.path === file)?.content).toBe('cubes: []\n');
  });

  it('never seeds over a file it already has, so an edit survives a restart', async () => {
    const file = path('customers');
    await store().seed([{ path: file, content: 'first\n' }]);

    await store().seed([{ path: file, content: 'second\n' }]);

    expect((await store().list()).find((each) => each.path === file)?.content).toBe('first\n');
  });

  it('lists its files in path order', async () => {
    // Siblings, so their order is their names' order.
    const dir = `model/test-${randomUUID()}`;
    const [b, a] = [`${dir}/b.yml`, `${dir}/a.yml`];
    await store().seed([
      { path: b, content: 'b\n' },
      { path: a, content: 'a\n' },
    ]);

    const paths = (await store().list()).map((each) => each.path);
    expect(paths.indexOf(a)).toBeLessThan(paths.indexOf(b));
    expect([...paths].sort()).toEqual(paths);
  });
});
