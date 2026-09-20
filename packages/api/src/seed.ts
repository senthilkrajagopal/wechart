import type { Kysely } from 'kysely';

import type { Database } from './db/schema';
import { ROOT_FOLDER_ID } from './repos/catalog';
import { documents } from './repos/documents';

/**
 * Sample folders, dashboards and charts for local development and the browser
 * tests. Only ever runs behind `WECHART_SEED=1`, and only when the catalog is
 * empty, so it cannot overwrite anything real.
 *
 * The list is deliberately long enough to scroll: AC-003 says switching theme
 * must not lose scroll position, and that cannot be demonstrated on a surface
 * that fits on screen.
 */
const FOLDERS = ['Finance', 'Operations', 'Marketing', 'Archive'];

export async function seedDevData(db: Kysely<Database>): Promise<void> {
  const existing = await db
    .selectFrom('documents')
    .select('id')
    .where('kind', '=', 'folder')
    .limit(1)
    .executeTakeFirst();

  if (existing) return;

  const repo = documents(db);

  for (const [index, title] of FOLDERS.entries()) {
    const folderId = `seed-folder-${String(index)}`;
    await repo.create({
      kind: 'folder',
      id: folderId,
      body: { title, folderId: ROOT_FOLDER_ID, owner: 'admin' },
    });

    for (let n = 1; n <= 8; n += 1) {
      await repo.create({
        kind: n % 3 === 0 ? 'chart' : 'dashboard',
        id: `${folderId}-item-${String(n)}`,
        body: {
          title: `${title} ${n % 3 === 0 ? 'chart' : 'dashboard'} ${String(n)}`,
          folderId,
          owner: n % 2 === 0 ? 'admin' : 'analyst',
        },
      });
    }
  }

  // Enough rows at the root that the contents list scrolls.
  for (let n = 1; n <= 30; n += 1) {
    await repo.create({
      kind: 'dashboard',
      id: `seed-root-dashboard-${String(n)}`,
      body: {
        title: `Company dashboard ${String(n).padStart(2, '0')}`,
        folderId: ROOT_FOLDER_ID,
        owner: 'admin',
      },
    });
  }
}
