import { randomUUID } from 'node:crypto';

import { afterAll, describe, expect, it } from 'vitest';

import { closeDb, getDb } from '../db/client';
import { catalog } from './catalog';
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

  // T448, AC-337: a file declaring several becomes one file each, in one step.
  it('replaces a file with the files it was split into, together', async () => {
    const [whole, one, two] = [path('sales'), path('orders'), path('returns')];
    await store().seed([{ path: whole, content: 'both\n' }]);

    await store().replace(whole, [
      { path: one, content: 'orders\n' },
      { path: two, content: 'returns\n' },
    ]);

    const files = await store().list();
    expect(files.some((each) => each.path === whole)).toBe(false);
    expect(files.find((each) => each.path === one)?.content).toBe('orders\n');
    expect(files.find((each) => each.path === two)?.content).toBe('returns\n');
  });

  // Two replicas starting at once split the same file (T448's review, finding 3):
  // the second finds it gone, and leaves what the first wrote.
  it('does nothing when the file it would replace is already gone', async () => {
    const [whole, one] = [path('sales'), path('orders')];
    await store().seed([{ path: one, content: 'first replica\n' }]);

    await store().replace(whole, [{ path: one, content: 'second replica\n' }]);

    const files = await store().list();
    expect(files.find((each) => each.path === one)?.content).toBe('first replica\n');
    expect(files.some((each) => each.path === whole)).toBe(false);
  });

  it('writes over no other file, and keeps the one it would replace when it would', async () => {
    const [whole, other] = [path('sales'), path('orders')];
    await store().seed([
      { path: whole, content: 'both\n' },
      { path: other, content: 'kept\n' },
    ]);

    await expect(
      store().replace(whole, [
        { path: other, content: 'orders\n' },
        { path: path('returns'), content: 'returns\n' },
      ]),
    ).rejects.toThrow();

    const files = await store().list();
    expect(files.find((each) => each.path === whole)?.content).toBe('both\n');
    expect(files.find((each) => each.path === other)?.content).toBe('kept\n');
  });
});

/**
 * T334, AC-269, AC-131: a model file lives in a folder. The same path in two
 * folders is two files; a folder's listing names each of its own.
 */
describe('model files in folders', () => {
  const cube = (name: string) =>
    `cubes:\n  - name: ${name}\n    sql_table: public.${name}\n    measures:\n      - name: count\n        type: count\n`;

  it('keeps each file in its folder, and a folder lists only its own', async () => {
    const [a, b] = [`folder-${randomUUID()}`, `folder-${randomUUID()}`];
    const file = path('sales');
    await store().seed([
      { folderId: a, path: file, content: 'in a\n' },
      { folderId: b, path: file, content: 'in b\n' },
    ]);
    await store().write([{ folderId: b, path: file, content: 'b, changed\n' }]);

    expect(await store().list(a)).toEqual([{ folderId: a, path: file, content: 'in a\n' }]);
    expect(await store().list(b)).toEqual([{ folderId: b, path: file, content: 'b, changed\n' }]);
    // The root's are the root's alone.
    expect((await store().list()).some((each) => each.path === file)).toBe(false);
  });

  it('lists a folder’s model files in its contents, each a model with the cubes and views it declares', async () => {
    const folder = `folder-${randomUUID()}`;
    // In one directory, so their order is their names' (T334's review).
    const dir = `model/test-${randomUUID()}`;
    const [orders, byMonth] = [`${dir}/orders.yml`, `${dir}/orders_by_month.yml`];
    await store().seed([
      { folderId: folder, path: orders, content: cube('orders') },
      {
        folderId: folder,
        path: byMonth,
        content:
          'views:\n  - name: orders_by_month\n    cubes:\n      - join_path: orders\n        includes: "*"\n',
      },
    ]);

    const rows = await catalog(getDb()).contents(folder);

    expect(
      rows.map(({ kind, id, title, folderId, declares }) => ({
        kind,
        id,
        title,
        folderId,
        declares,
      })),
    ).toEqual([
      {
        kind: 'model',
        id: orders,
        title: 'orders.yml',
        folderId: folder,
        declares: { cubes: 1, views: 0 },
      },
      {
        kind: 'model',
        id: byMonth,
        title: 'orders_by_month.yml',
        folderId: folder,
        declares: { cubes: 0, views: 1 },
      },
    ]);
  });
});
