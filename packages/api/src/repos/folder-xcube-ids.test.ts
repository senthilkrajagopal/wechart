import { randomUUID } from 'node:crypto';

import { afterAll, describe, expect, it } from 'vitest';

import { closeDb, getDb } from '../db/client';
import { documents } from './documents';
import { folderXcubeIds } from './folder-xcube-ids';

/**
 * T425 / AC-328: each folder's xcube id, stored and never reused (R30).
 * `Fails when: … two folders share an xcube id, or a removed folder's id is
 * given to another; renaming or moving a folder changes a published name …`
 * Against the real Postgres, as the other repos are.
 */
const ids = () => folderXcubeIds(getDb());
const docs = () => documents(getDb());

/** The folders made here, removed after: none stays in the shared test tree. */
const made: string[] = [];
afterAll(async () => {
  for (const id of made)
    await docs()
      .remove('folder', id)
      .catch(() => undefined);
  await closeDb();
});

async function folder(id: string, parent: string, title = 'A folder'): Promise<string> {
  made.push(id);
  await docs().create({ kind: 'folder', id, body: { title, folderId: parent, owner: 'admin' } });
  return id;
}

describe('folders’ xcube ids', () => {
  it('gives the root `froot`, a UUID folder `f` and its hex, and any other a stored `f` and 32 hex', async () => {
    const uuid = await folder(randomUUID(), 'root');
    const seedLike = await folder(`test-seed-${randomUUID()}`, 'root');

    const first = await ids().of(['root', uuid, seedLike]);

    expect(first.get('root')).toBe('froot');
    expect(first.get(uuid)).toBe(`f${uuid.replaceAll('-', '')}`);
    expect(first.get(seedLike)).toMatch(/^f[0-9a-f]{32}$/);
    // Stored: asked again, the same.
    expect((await ids().of([seedLike])).get(seedLike)).toBe(first.get(seedLike));
  });

  it('never gives two folders one id, nor a deleted folder’s id to another', async () => {
    const gone = await folder(`test-seed-${randomUUID()}`, 'root');
    const goneId = (await ids().of([gone])).get(gone);
    await docs().remove('folder', gone);

    const others = await Promise.all(
      Array.from({ length: 5 }, () => folder(`test-seed-${randomUUID()}`, 'root')),
    );
    const given = await ids().of(others);

    const all = [...given.values(), goneId];
    expect(new Set(all).size).toBe(all.length);
    // The deleted folder's id is kept, so nothing is ever given it.
    expect((await ids().of([gone])).get(gone)).toBe(goneId);
  });

  it('gives a folder another id where its own is taken (T425’s review)', async () => {
    // One UUID in two cases: both would take the same `f` and hex.
    const uuid = randomUUID();
    const given = await ids().of([uuid, uuid.toUpperCase()]);

    expect(given.get(uuid)).toBe(`f${uuid.replaceAll('-', '')}`);
    expect(given.get(uuid.toUpperCase())).toMatch(/^f[0-9a-f]{32}$/);
    expect(given.get(uuid.toUpperCase())).not.toBe(given.get(uuid));
  });

  it('keeps a folder’s id through a rename and a move', async () => {
    const parent = await folder(randomUUID(), 'root');
    const child = await folder(`test-seed-${randomUUID()}`, parent, 'Before');
    const before = (await ids().of([child])).get(child);

    const stored = await docs().get('folder', child);
    await docs().update({
      kind: 'folder',
      id: child,
      body: { ...stored?.body, title: 'After', folderId: 'root' },
      expectedVersion: stored?.version ?? 1,
    });

    expect((await ids().of([child])).get(child)).toBe(before);
  });

  it('builds the published tree from the stored folders: each reaching the root, and no workspace', async () => {
    const a = await folder(randomUUID(), 'root');
    const b = await folder(randomUUID(), a);
    const mine = await folder(randomUUID(), 'mine');

    const tree = await ids().tree();
    const idOf = await ids().of([a, b, mine]);

    expect(tree).toContainEqual({ id: 'froot', parentId: null });
    expect(tree).toContainEqual({ id: idOf.get(a), parentId: 'froot' });
    expect(tree).toContainEqual({ id: idOf.get(b), parentId: idOf.get(a) });
    expect(tree.map((each) => each.id)).not.toContain(idOf.get(mine));
    for (const each of tree) expect(each.id).toMatch(/^f[a-z0-9]{1,40}$/);
  });
});
