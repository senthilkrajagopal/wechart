import { randomUUID } from 'node:crypto';

import { afterAll, describe, expect, it } from 'vitest';

import { closeDb, getDb } from '../db/client';
import { ROOT_FOLDER_ID, catalog } from './catalog';
import { documents } from './documents';

/**
 * AC-017: WHEN the user opens Explore, THE SYSTEM SHALL show a folder tree and
 * the contents of the selected folder, listing dashboards and library charts
 * with their type, owner and last-updated time.
 * Fails when: the list omits an item in the folder, or a column is blank for an
 * item that has that value.
 */
const repo = () => documents(getDb());
const cat = () => catalog(getDb());

afterAll(async () => {
  await closeDb();
});

async function folder(title: string, parentId: string = ROOT_FOLDER_ID) {
  const id = randomUUID();
  await repo().create({ kind: 'folder', id, body: { title, folderId: parentId } });
  return id;
}

describe('folder contents (AC-017)', () => {
  it('lists dashboards and charts with their type, owner and last-updated time', async () => {
    const here = await folder('Finance');
    await repo().create({
      kind: 'dashboard',
      id: randomUUID(),
      body: { title: 'Revenue', folderId: here, owner: 'admin' },
    });
    await repo().create({
      kind: 'chart',
      id: randomUUID(),
      body: { title: 'Revenue by region', folderId: here, owner: 'admin' },
    });

    const contents = await cat().contents(here);

    expect(contents).toHaveLength(2);
    for (const item of contents) {
      expect(item.title).not.toBe('(untitled)');
      expect(item.owner).toBe('admin');
      expect(item.updatedAt).toBeInstanceOf(Date);
    }
    expect(contents.map((item) => item.kind).sort()).toEqual(['chart', 'dashboard']);
  });

  it('omits nothing that is in the folder', async () => {
    const here = await folder('Busy');
    const titles = ['A', 'B', 'C', 'D'];
    for (const title of titles) {
      await repo().create({
        kind: 'dashboard',
        id: randomUUID(),
        body: { title, folderId: here },
      });
    }

    expect((await cat().contents(here)).map((item) => item.title).sort()).toEqual(titles);
  });

  it('lists sub-folders alongside their contents', async () => {
    const parent = await folder('Parent');
    await folder('Child', parent);

    const contents = await cat().contents(parent);
    expect(contents.map((item) => item.kind)).toContain('folder');
  });

  it('does not list a dashboard-local chart, which belongs to its dashboard (AC-126)', async () => {
    const here = await folder('Has a dashboard');
    await repo().create({
      kind: 'chart',
      id: randomUUID(),
      body: { title: 'Local chart', folderId: here, localToDashboardId: 'dash-1' },
    });

    expect(await cat().contents(here)).toHaveLength(0);
  });

  it('does not list items from another folder', async () => {
    const mine = await folder('Mine');
    const theirs = await folder('Theirs');
    await repo().create({
      kind: 'dashboard',
      id: randomUUID(),
      body: { title: 'Not mine', folderId: theirs },
    });

    expect(await cat().contents(mine)).toHaveLength(0);
  });

  it('derives the columns from the body, so a rename cannot leave them stale', async () => {
    const id = randomUUID();
    const here = await folder('Renames');
    await repo().create({
      kind: 'dashboard',
      id,
      body: { title: 'Before', folderId: here, owner: 'admin' },
    });

    await repo().update({
      kind: 'dashboard',
      id,
      body: { title: 'After', folderId: here, owner: 'admin' },
      expectedVersion: 1,
    });

    expect((await cat().contents(here))[0]?.title).toBe('After');
  });
});

describe('folder tree (AC-017)', () => {
  it('reports each folder with its parent, so a tree can be built', async () => {
    const parent = await folder('Tree parent');
    const child = await folder('Tree child', parent);

    const folders = await cat().folders();
    const found = folders.find((node) => node.id === child);

    expect(found?.parentId).toBe(parent);
    expect(found?.title).toBe('Tree child');
  });
});
