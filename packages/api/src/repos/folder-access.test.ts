import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeDb, getDb } from '../db/client';
import { documents, type StoredDocument } from './documents';
import { ROOT_ACCESS_ID, folderAccessStore } from './folder-access';

/**
 * T314 (AC-259, AC-260): each folder's read-only and read-write AD groups,
 * stored on the folder, the shared root's in the `root-access` setting
 * (tasks.md, Phase 2 decisions), and the shared tree the effective groups are
 * computed from. Against the real Postgres, as the other repos are.
 */
const store = () => folderAccessStore(getDb());
const docs = () => documents(getDb());

/** The root's setting as it was before these tests, put back after them. */
let rootBefore: StoredDocument | null = null;
beforeAll(async () => {
  rootBefore = await docs().get('setting', ROOT_ACCESS_ID);
});
/** The folders made here, removed after: none stays in the shared test tree. */
const made: string[] = [];
afterAll(async () => {
  for (const id of made) await docs().remove('folder', id);
  if ((await docs().get('setting', ROOT_ACCESS_ID)) !== null) {
    await docs().remove('setting', ROOT_ACCESS_ID);
  }
  if (rootBefore !== null) {
    await docs().create({ kind: 'setting', id: ROOT_ACCESS_ID, body: rootBefore.body });
  }
  await closeDb();
});

async function folder(parent: string, title = 'A folder'): Promise<string> {
  const id = randomUUID();
  made.push(id);
  await docs().create({ kind: 'folder', id, body: { title, folderId: parent, owner: 'admin' } });
  return id;
}

describe('the shared tree’s folders and their groups (T314)', () => {
  it('holds the root and every folder beneath it, each with both settings unset at first', async () => {
    const a = await folder('root');
    const b = await folder(a);

    const tree = await store().tree();
    // The root's own groups are the last test's to check: they're shared state.
    const root = tree.find((each) => each.id === 'root');
    expect(root?.id).toBe('root');
    expect(root?.parentId).toBeNull();
    expect(tree.find((each) => each.id === a)).toEqual({
      id: a,
      parentId: 'root',
      access: { readOnly: null, readWrite: null },
    });
    expect(tree.find((each) => each.id === b)).toEqual({
      id: b,
      parentId: a,
      access: { readOnly: null, readWrite: null },
    });
  });

  it('leaves out a workspace’s folders, which no group reaches (AC-276)', async () => {
    const inMine = await folder('mine');
    const inWorkspace = await folder('ws:someone');
    const below = await folder(inWorkspace);

    const ids = new Set((await store().tree()).map((each) => each.id));
    expect(ids.has(inMine)).toBe(false);
    expect(ids.has(inWorkspace)).toBe(false);
    expect(ids.has(below)).toBe(false);
    // And none of them takes groups.
    expect(await store().set(below, { readOnly: ['g'], readWrite: null })).toBe(false);
  });

  it('stores a folder’s groups on it, each setting on its own, and keeps the rest of it', async () => {
    const a = await folder('root', 'Sales');

    expect(await store().set(a, { readOnly: ['sales-ro'], readWrite: null })).toBe(true);
    expect((await store().tree()).find((each) => each.id === a)?.access).toEqual({
      readOnly: ['sales-ro'],
      readWrite: null,
    });
    // Set again: replaced, not merged.
    expect(await store().set(a, { readOnly: null, readWrite: ['sales-rw', 'finance-rw'] })).toBe(
      true,
    );
    expect((await store().tree()).find((each) => each.id === a)?.access).toEqual({
      readOnly: null,
      readWrite: ['sales-rw', 'finance-rw'],
    });
    const stored = await docs().get('folder', a);
    expect(stored?.body).toEqual({
      title: 'Sales',
      folderId: 'root',
      owner: 'admin',
      access: { readOnly: null, readWrite: ['sales-rw', 'finance-rw'] },
    });
  });

  it('stores the root’s groups in its setting, made when first set', async () => {
    const existing = await docs().get('setting', ROOT_ACCESS_ID);
    if (existing !== null) await docs().remove('setting', ROOT_ACCESS_ID);

    // Never set: the root's settings are both unset.
    expect((await store().tree()).find((each) => each.id === 'root')?.access).toEqual({
      readOnly: null,
      readWrite: null,
    });
    expect(await store().set('root', { readOnly: ['everyone'], readWrite: [] })).toBe(true);
    expect(await store().set('root', { readOnly: ['everyone'], readWrite: ['admins'] })).toBe(true);
    expect((await store().tree()).find((each) => each.id === 'root')?.access).toEqual({
      readOnly: ['everyone'],
      readWrite: ['admins'],
    });
  });

  it('sets nothing on a folder that isn’t there', async () => {
    expect(await store().set(randomUUID(), { readOnly: null, readWrite: ['g'] })).toBe(false);
  });

  it('reads a stored setting it can’t make sense of as unset, not as a grant', async () => {
    const a = randomUUID();
    made.push(a);
    await docs().create({
      kind: 'folder',
      id: a,
      body: {
        title: 'Odd',
        folderId: 'root',
        access: { readOnly: 'sales-ro', readWrite: [1, 'ok'] },
      },
    });
    expect((await store().tree()).find((each) => each.id === a)?.access).toEqual({
      readOnly: null,
      readWrite: null,
    });
  });
});
