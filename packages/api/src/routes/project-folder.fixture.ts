import { sql } from 'kysely';

import { getDb } from '../db/client';

/** The time zone the tests' copies are named in (T523). */
export const TEST_TIME_ZONE = 'UTC';

/**
 * The key of the workspace a copy is in, from its folder: My workspace's
 * root, `ws:<key>`, or a project folder in it (T523).
 */
export async function workspaceKeyOf(folderId: string): Promise<string> {
  if (folderId.startsWith('ws:')) return folderId.slice('ws:'.length);
  const row = await getDb()
    .selectFrom('documents')
    .select(sql<string>`body ->> 'folderId'`.as('parent'))
    .where('kind', '=', 'folder')
    .where('id', '=', folderId)
    .executeTakeFirst();
  return (row?.parent ?? '').slice('ws:'.length);
}

/** The workspace `ws:<key>`'s root and the folders in it: where its copies are (T523). */
export async function workspaceFoldersOf(key: string): Promise<string[]> {
  const rows = await getDb()
    .selectFrom('documents')
    .select('id')
    .where('kind', '=', 'folder')
    .where(sql<boolean>`body ->> 'folderId' = ${`ws:${key}`}`)
    .execute();
  return [`ws:${key}`, ...rows.map((row) => row.id)];
}

/**
 * Takes away the project folders "Edit in my workspace" made in the tests'
 * workspaces (T523, AC-368), with what is in them: the copies, their
 * dashboards' own charts and the data sources copied. So none is left for a
 * later file to find in My workspace. The files run one at a time
 * (`vitest.config.ts`), so none is another's.
 */
export async function removeProjectFolders(): Promise<void> {
  const db = getDb();
  const folders = (
    await db
      .selectFrom('documents')
      .select('id')
      .where('kind', '=', 'folder')
      .where(sql<boolean>`body ->> 'folderId' like 'ws:%'`)
      .where(sql<boolean>`body ->> 'title' like 'project-%'`)
      .execute()
  ).map((row) => row.id);
  if (folders.length === 0) return;
  const boards = (
    await db
      .selectFrom('documents')
      .select('id')
      .where('kind', '=', 'dashboard')
      .where('folder_id', 'in', folders)
      .execute()
  ).map((row) => row.id);
  if (boards.length > 0)
    await db
      .deleteFrom('documents')
      .where('kind', '=', 'chart')
      .where('local_to_dashboard_id', 'in', boards)
      .execute();
  await db.deleteFrom('documents').where('folder_id', 'in', folders).execute();
  await db.deleteFrom('data_sources').where('folder_id', 'in', folders).execute();
  // And the models copied into them (T347).
  await db.deleteFrom('model_files').where('folder_id', 'in', folders).execute();
  await db
    .deleteFrom('documents')
    .where('kind', '=', 'folder')
    .where('id', 'in', folders)
    .execute();
}
