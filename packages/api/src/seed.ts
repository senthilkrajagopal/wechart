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
  /**
   * The browser tests create objects, so without a reset each run starts from
   * whatever the last one left behind — and assertions that were precise on a
   * clean catalog start matching leftovers. Only ever set for those runs.
   */
  if (process.env['WECHART_RESET_DATA'] === '1') {
    await db.deleteFrom('documents').execute();
    await db.deleteFrom('query_log').execute();
  }

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

  // A chart that belongs to a dashboard rather than to a folder: it must never
  // appear in a folder listing or in search (AC-019, AC-126), and the browser
  // tests need one to prove that.
  await repo.create({
    kind: 'chart',
    id: 'seed-local-chart',
    body: {
      title: 'Seeded local chart',
      localToDashboardId: 'seed-root-dashboard-1',
      owner: 'admin',
    },
  });

  // Enough rows at the root that the contents list scrolls.
  for (let n = 1; n <= 30; n += 1) {
    await repo.create({
      kind: 'dashboard',
      id: `seed-root-dashboard-${String(n)}`,
      body: {
        title: `Company dashboard ${String(n).padStart(2, '0')}`,
        folderId: ROOT_FOLDER_ID,
        owner: 'admin',
        // The first one carries a real structure, so there is a dashboard to
        // open (AC-018) with more than one page tab, a nested section and two
        // charts that share a member — which is what AC-039 is about. The
        // others stay title-only: the folder list is what they are for.
        ...(n === 1
          ? {
              schemaVersion: 1,
              settings: { width: 'fixed' },
              pages: [
                {
                  id: 'overview',
                  title: 'Overview',
                  items: [
                    { id: 'tile-status', kind: 'chart', w: 6, h: 40, chartId: 'seed-chart-status' },
                    {
                      id: 'tile-notes',
                      kind: 'markdown',
                      w: 6,
                      h: 40,
                      text: 'Orders by status, this quarter.',
                    },
                    {
                      id: 'section-detail',
                      kind: 'section',
                      title: 'Detail',
                      items: [
                        {
                          id: 'tile-region',
                          kind: 'chart',
                          w: 12,
                          h: 40,
                          chartId: 'seed-chart-region',
                        },
                      ],
                    },
                  ],
                },
                {
                  id: 'appendix',
                  title: 'Appendix',
                  items: [{ id: 'tile-heading', kind: 'header', w: 12, h: 8, text: 'Definitions' }],
                },
              ],
            }
          : {}),
      },
    });
  }

  // The two charts the seeded dashboard shows. Both split by status, so the
  // same members appear in both tiles and a reader can see that a member keeps
  // one colour across them (AC-039).
  /**
   * Both split by `orders.status`, so the same members are drawn in both and
   * AC-039 has something to be true about. They deliberately reach those
   * members in a **different order**: the first is grouped by category, the
   * second runs over time, and the sample orders cycle through the statuses
   * day by day, so the earliest dates put them in a different sequence.
   *
   * That difference is the whole point. Colour follows first appearance when
   * a tile is left to choose for itself, so two charts that happened to list
   * their members in the same order would paint identically whether or not
   * the dashboard's assignment reached them — and a test on such a pair would
   * pass without proving anything.
   */
  const charts = [
    {
      id: 'seed-chart-status',
      title: 'Orders by category and status',
      wells: {
        measures: ['orders.count'],
        dimensions: ['products.category', 'orders.status'],
        timeDimensions: [],
      },
    },
    {
      id: 'seed-chart-region',
      title: 'Orders over time by status',
      wells: {
        measures: ['orders.count'],
        dimensions: ['orders.status'],
        timeDimensions: ['orders.ordered_at'],
      },
    },
  ] as const;

  for (const chart of charts) {
    await repo.create({
      kind: 'chart',
      id: chart.id,
      body: {
        schemaVersion: 1,
        title: chart.title,
        localToDashboardId: 'seed-root-dashboard-1',
        owner: 'admin',
        chart: {
          source: { cube: 'orders' },
          wells: chart.wells,
          chartType: 'bar',
        },
      },
    });
  }
}
