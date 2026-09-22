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
    // And the model, which the tests publish to (T142): seeded again from
    // the directory at start, so each run begins from the same model.
    await db.deleteFrom('model_files').execute();
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
                  items: [
                    // No height: a header is as tall as its own text, which
                    // is what `SIZED_KINDS` says of it.
                    { id: 'tile-heading', kind: 'header', w: 12, text: 'Definitions' },
                    // A tab group, so the case AC-056 singles out — a drop on
                    // a *tab-group* label, as distinct from a page tab — has
                    // somewhere real to be tried. Inside a section, because
                    // direction.md rule 37 allows it nowhere else.
                    {
                      id: 'section-terms',
                      kind: 'section',
                      title: 'Terms',
                      items: [
                        {
                          id: 'group-terms',
                          kind: 'tabs',
                          w: 12,
                          tabs: [
                            {
                              id: 'measures',
                              title: 'Measures',
                              items: [
                                {
                                  id: 'tile-measures',
                                  kind: 'markdown',
                                  w: 6,
                                  h: 16,
                                  text: 'Count is the number of orders.',
                                },
                              ],
                            },
                            { id: 'dimensions', title: 'Dimensions', items: [] },
                          ],
                        },
                      ],
                    },
                  ],
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

  /**
   * A chart nobody has built yet, stored exactly as `POST /api/documents`
   * stores one: a title and an owner, with **no `schemaVersion` and no chart
   * definition**. The repo upgrades it on every read into a well-formed empty
   * chart (`UPGRADES[0]`), which is how a brand-new chart reaches the editor.
   *
   * Editor e2e specs open this rather than a made-up id. Before AC-182 they
   * navigated to `/explore/charts/new/edit`, which worked only because the
   * editor ignored its id and always opened blank; once the editor loads the
   * chart it is given, that id is a missing chart and is correctly refused.
   * Opening this one instead exercises the path a real new chart takes.
   *
   * No `folderId`, which the real endpoint does write: that has no bearing on
   * what is being proven, and a foldered chart would appear in Explore's
   * listings and move other specs' counts.
   */
  await repo.create({
    kind: 'chart',
    id: 'seed-chart-empty',
    body: { title: 'Untitled chart', owner: 'admin' },
  });

  /**
   * A dashboard whose one chart has **no saved type** — the document's way of
   * saying "follow the recommender" (T193). Every other seeded chart saves an
   * explicit `bar`, which is why a dashboard could refuse typeless charts for
   * so long without any test noticing.
   *
   * A dashboard of its own rather than a change to the main one: the main
   * dashboard's second chart runs over time, so making it typeless would
   * redraw it as lines, and AC-039's colour test finds legend markers as small
   * *filled* shapes. Unfoldered, so it appears in no folder listing, and
   * titled to match none of the search specs' queries.
   */
  await repo.create({
    kind: 'dashboard',
    id: 'seed-dashboard-recommended',
    body: {
      title: 'Recommended chart dashboard',
      owner: 'admin',
      schemaVersion: 1,
      settings: { width: 'fixed' },
      pages: [
        {
          id: 'main',
          title: 'Main',
          items: [
            {
              id: 'tile-recommended',
              kind: 'chart',
              w: 12,
              h: 40,
              chartId: 'seed-chart-recommended',
            },
            /**
             * A chart on the *second* tab of a tab group (T032). A tab group's
             * open tab is its own local state, so an overlay that unmounted the
             * dashboard brought it back on the first tab — the tile just edited
             * was not on screen on return. Inside a section, because direction.md
             * rule 37 allows a tab group nowhere else.
             */
            {
              id: 'section-tabbed',
              kind: 'section',
              title: 'Tabbed',
              items: [
                {
                  id: 'group-tabbed',
                  kind: 'tabs',
                  w: 12,
                  tabs: [
                    {
                      id: 'tab-notes',
                      title: 'Notes',
                      items: [
                        {
                          id: 'tile-tab-notes',
                          kind: 'markdown',
                          w: 12,
                          h: 16,
                          text: 'Read me first.',
                        },
                      ],
                    },
                    {
                      id: 'tab-chart',
                      title: 'Chart',
                      items: [
                        {
                          id: 'tile-tabbed',
                          kind: 'chart',
                          w: 12,
                          h: 40,
                          chartId: 'seed-chart-tabbed',
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  });
  await repo.create({
    kind: 'chart',
    id: 'seed-chart-tabbed',
    body: {
      schemaVersion: 1,
      title: 'Orders by status, on a second tab',
      localToDashboardId: 'seed-dashboard-recommended',
      owner: 'admin',
      chart: {
        source: { cube: 'orders' },
        wells: { measures: ['orders.count'], dimensions: ['orders.status'], timeDimensions: [] },
        chartType: 'bar',
      },
    },
  });
  await repo.create({
    kind: 'chart',
    id: 'seed-chart-recommended',
    body: {
      schemaVersion: 1,
      title: 'Orders over time, following the recommendation',
      localToDashboardId: 'seed-dashboard-recommended',
      owner: 'admin',
      // Over time, so the recommendation is *not* `bar`. Count by status
      // recommends `bar` — the type every other seeded chart saves — and a
      // dashboard that drew every typeless chart as `bar` would then pass.
      chart: {
        source: { cube: 'orders' },
        wells: {
          measures: ['orders.count'],
          dimensions: [],
          timeDimensions: ['orders.ordered_at'],
        },
      },
    },
  });

  /**
   * A dashboard showing a currency measure, so AC-046 can be seen on a tile
   * (T194). None of the main dashboard's charts uses a formatted member —
   * both count orders — which is why tiles could draw raw numbers for so long
   * without any test noticing.
   *
   * Unfoldered, so it appears in no folder listing, and titled to match none
   * of the search specs' queries ("Company dashboard", "chart 3", "Seeded
   * local chart", "Finance chart"); its charts are local to it, so search
   * never lists them (AC-019).
   */
  await repo.create({
    kind: 'dashboard',
    id: 'seed-dashboard-formats',
    body: {
      title: 'Revenue formats dashboard',
      owner: 'admin',
      schemaVersion: 1,
      settings: { width: 'fixed' },
      pages: [
        {
          id: 'main',
          title: 'Main',
          items: [
            { id: 'tile-revenue', kind: 'chart', w: 12, h: 40, chartId: 'seed-chart-revenue' },
            // A measure with no format beside it, so a change that wrote every
            // measure as money would fail rather than pass.
            { id: 'tile-count', kind: 'chart', w: 12, h: 40, chartId: 'seed-chart-count-plain' },
          ],
        },
      ],
    },
  });
  await repo.create({
    kind: 'chart',
    id: 'seed-chart-revenue',
    body: {
      schemaVersion: 1,
      title: 'Revenue by status',
      localToDashboardId: 'seed-dashboard-formats',
      owner: 'admin',
      chart: {
        source: { cube: 'orders' },
        wells: {
          measures: ['orders.total_amount'],
          dimensions: ['orders.status'],
          timeDimensions: [],
        },
        chartType: 'bar',
      },
    },
  });
  await repo.create({
    kind: 'chart',
    id: 'seed-chart-count-plain',
    body: {
      schemaVersion: 1,
      title: 'Orders by status',
      localToDashboardId: 'seed-dashboard-formats',
      owner: 'admin',
      chart: {
        source: { cube: 'orders' },
        wells: { measures: ['orders.count'], dimensions: ['orders.status'], timeDimensions: [] },
        chartType: 'bar',
      },
    },
  });

  /**
   * A chart whose axis settings are saved, so AC-182's "axis settings" can be
   * seen to load in the editor's Axes panel. None of the dashboard's charts
   * carries any, and giving one of them some would change how that tile draws
   * under every other spec. Values chosen so none could pass for a default.
   */
  await repo.create({
    kind: 'chart',
    id: 'seed-chart-axes',
    body: {
      schemaVersion: 1,
      title: 'Orders with axis settings',
      owner: 'admin',
      chart: {
        source: { cube: 'orders' },
        wells: { measures: ['orders.count'], dimensions: ['orders.status'], timeDimensions: [] },
        chartType: 'bar',
        options: { axes: { y: { title: 'Order count', min: 5 } } },
      },
    },
  });
}
