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
    // One random part, so `a` sorts before `b` (T452's `all()` orders by folder).
    const unique = randomUUID();
    const [a, b] = [`folder-${unique}-a`, `folder-${unique}-b`];
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
    // And every folder's, for the whole model xcube is sent (T452).
    expect((await store().all()).filter((each) => each.path === file)).toEqual([
      { folderId: a, path: file, content: 'in a\n' },
      { folderId: b, path: file, content: 'b, changed\n' },
    ]);

    // Removed from one folder, it stays in the other (T428).
    await store().remove(a, file);
    expect(await store().list(a)).toEqual([]);
    expect(await store().list(b)).toEqual([{ folderId: b, path: file, content: 'b, changed\n' }]);
  });

  /**
   * T347 (AC-281, AC-282): a model in a workspace says where it is to go, and
   * a copy what it was copied from, as the workspace's dashboards and data
   * sources do; and every file has an id and a version, which a proposal
   * names it by (T350).
   */
  it('gives each file an id and a version, which a write over it raises', async () => {
    const folder = `folder-${randomUUID()}`;
    const file = path('orders');
    await store().write([{ folderId: folder, path: file, content: cube('orders') }]);
    const [first] = await store().inFolders([folder]);
    expect(first).toMatchObject({ folderId: folder, path: file, version: 1 });
    expect(first?.id).toMatch(/^[0-9a-f-]{36}$/);

    await store().write([{ folderId: folder, path: file, content: cube('orders_v2') }]);

    const [second] = await store().inFolders([folder]);
    expect(second).toMatchObject({ id: first?.id, version: 2, content: cube('orders_v2') });
    expect(await store().byId(first!.id)).toEqual(second);
  });

  it('keeps a workspace model’s target and origin as first stored, whatever a later write says', async () => {
    const [workspace, inside] = [`ws:test-${randomUUID()}`, `folder-${randomUUID()}`];
    const [mine, copied] = [path('mine'), path('copied')];
    const origin = { id: randomUUID(), folderId: 'sales', path: 'cubes/orders.yml', version: 3 };
    await store().write([
      { folderId: workspace, path: mine, content: cube('mine'), targetFolderId: 'sales' },
      {
        folderId: inside,
        path: copied,
        content: cube('orders'),
        targetFolderId: 'sales',
        origin,
      },
    ]);
    await store().write([
      { folderId: workspace, path: mine, content: cube('mine_v2'), targetFolderId: 'ops' },
      { folderId: inside, path: copied, content: cube('orders_v2') },
    ]);

    const files = await store().inFolders([workspace, inside]);
    expect(
      files.map(({ folderId, path: at, content, targetFolderId, origin: from }) => ({
        folderId,
        path: at,
        content,
        targetFolderId,
        origin: from,
      })),
    ).toEqual([
      {
        folderId: inside,
        path: copied,
        content: cube('orders_v2'),
        targetFolderId: 'sales',
        origin,
      },
      {
        folderId: workspace,
        path: mine,
        content: cube('mine_v2'),
        targetFolderId: 'sales',
        origin: null,
      },
    ]);
    // And Explore says so under each one's name (T498, design 04 pin 3).
    const listed = await catalog(getDb()).contents(inside);
    expect(listed).toEqual([
      expect.objectContaining({
        kind: 'model',
        id: copied,
        targetFolderId: 'sales',
        origin: { kind: 'model', id: origin.id, version: 3, folderId: 'sales' },
      }),
    ]);
    // A shared folder's own have neither.
    expect(await store().byId(randomUUID())).toBeUndefined();
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
