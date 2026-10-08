import { expect, test, type APIRequestContext } from '@playwright/test';

import { IN_MY_WORKSPACE } from './workspace';

/**
 * T014 / AC-013: WHEN a result is served from a pre-aggregation, THE SYSTEM
 * SHALL mark the tile as accelerated and show the age of the data; otherwise
 * it SHALL mark the tile as live.
 * Fails when: a result with `usedPreAggregations` shows no accelerated
 * indicator, or a source-database result is labelled accelerated.
 *
 * On a dashboard, against the real Cube: `monthly_orders` is the sample
 * model's accelerated cube — its rollup, built by the compose stack's refresh
 * worker, answers orders counted by status — and `orders` has no rollup, so
 * Postgres answers it.
 */
const API = 'http://localhost:4100/api';

const ACCELERATED_QUERY = {
  measures: ['monthly_orders.count'],
  dimensions: ['monthly_orders.status'],
};

/**
 * The refresh worker builds the rollup some seconds after Cube starts, and
 * until it has, Cube refuses the query (research/cube/pre-aggregations.md,
 * "Observed locally"). Waited for here, so the test is about the tile.
 */
test.beforeAll(async ({ request }) => {
  await expect(async () => {
    const answer = (await (
      await request.post(`${API}/load`, { data: { query: ACCELERATED_QUERY } })
    ).json()) as {
      usedPreAggregations?: Record<string, unknown>;
    };
    expect(Object.keys(answer.usedPreAggregations ?? {})).not.toHaveLength(0);
  }).toPass({ timeout: 120_000, intervals: [2_000] });
});

/** A dashboard of its own, with one bar chart of `count` by `status` on each cube given. */
async function dashboardOn(request: APIRequestContext, cubes: readonly string[]) {
  const unique = `${String(Date.now())}-${String(Math.round(Math.random() * 1e6))}`;
  const title = `Acceleration ${unique}`;
  const dashboard = (await (
    await request.post(`${API}/documents`, {
      data: { kind: 'dashboard', title, ...IN_MY_WORKSPACE },
    })
  ).json()) as { id: string };
  const items = [];
  for (const cube of cubes) {
    const chart = (await (
      await request.post(`${API}/documents`, {
        data: { kind: 'chart', title: `${cube} by status`, ...IN_MY_WORKSPACE },
      })
    ).json()) as { id: string };
    await request.put(`${API}/documents/chart/${chart.id}`, {
      data: {
        version: 1,
        body: {
          schemaVersion: 1,
          title: `${cube} by status`,
          owner: 'admin',
          localToDashboardId: dashboard.id,
          chart: {
            source: { cube },
            wells: {
              measures: [`${cube}.count`],
              dimensions: [`${cube}.status`],
              timeDimensions: [],
            },
            chartType: 'bar',
          },
        },
      },
    });
    items.push({ id: `tile-${cube}`, kind: 'chart', w: 6, h: 40, chartId: chart.id });
  }
  await request.put(`${API}/documents/dashboard/${dashboard.id}`, {
    data: {
      version: 1,
      body: {
        schemaVersion: 1,
        title,
        ...IN_MY_WORKSPACE,
        owner: 'admin',
        settings: { width: 'fixed' },
        pages: [{ id: 'only', title: 'Only', items }],
      },
    },
  });
  return { id: dashboard.id, title };
}

/**
 * T270 / AC-238: WHILE a tile shows a drilled view, THE SYSTEM SHALL show the
 * drilled answer's own freshness: the pre-aggregation that served it, or
 * that the database did. `Fails when: a drilled view the database answered
 * shows the parent view's pre-aggregation.`
 *
 * `monthly_orders` by status is served by `by_status_month`; drilled by day
 * it is finer than the rollup's month, and Cube asks the database (checked
 * here first). Every item marked (Mark all), so the drill is the tile's whole
 * answer by day.
 */
test('a drilled tile says what served its own answer, not the rollup that served its chart', async ({
  page,
  request,
}) => {
  const byDay = (await (
    await request.post(`${API}/load`, {
      data: {
        query: {
          measures: ['monthly_orders.count'],
          timeDimensions: [{ dimension: 'monthly_orders.ordered_at', granularity: 'day' }],
        },
      },
    })
  ).json()) as { usedPreAggregations?: Record<string, unknown> };
  expect(Object.keys(byDay.usedPreAggregations ?? {})).toHaveLength(0);

  const { id, title } = await dashboardOn(request, ['monthly_orders']);
  await page.goto(`/explore/dashboards/${id}`);
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  const tile = page.locator('[data-tile="tile-monthly_orders"]');
  // The tile's one badge, "✓ Pre-agg · 3m" or "● Live" (T681; design 04 note 4).
  const served = tile.getByTestId('tile-freshness');
  await expect(served).toHaveText(/^Pre-agg/);

  const marked = async () => {
    await tile.getByRole('button', { name: /^Actions for / }).click();
    return tile
      .getByRole('menu', { name: /^Actions for / })
      .getByRole('group', { name: /marked$/ });
  };
  await (await marked()).getByRole('menuitem', { name: 'Mark all' }).click();
  await (await marked()).getByRole('menuitem', { name: /^Drill by/ }).click();
  await page
    .getByRole('menu', { name: /^Drill by/ })
    .getByRole('group', { name: /^Time · / })
    .getByRole('menuitem', { name: 'By day' })
    .click();

  await expect(tile.getByTestId('drill-crumb')).toBeVisible();
  await expect(served).toHaveText(/^Live/);
  await expect(served).not.toHaveText(/Pre-agg/);
  // Nor does its Data as of name the rollup.
  await tile.getByRole('button', { name: /^Actions for / }).click();
  await tile
    .getByRole('menu', { name: /^Actions for / })
    .getByRole('menuitem', { name: /^Data as of/ })
    .click();
  await expect(page.getByRole('menu', { name: /^Data as of/ })).not.toContainText(
    'by_status_month',
  );
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');

  // Back: the chart, served by its rollup again.
  await tile.getByTestId('drill-crumb').getByRole('button', { name: '← Back' }).click();
  await expect(served).toHaveText(/^Pre-agg/);
});

test('a tile served from a pre-aggregation says so with its age, and one from the database says live', async ({
  page,
  request,
}) => {
  const { id, title } = await dashboardOn(request, ['monthly_orders', 'orders']);
  await page.goto(`/explore/dashboards/${id}`);
  await expect(page.getByRole('heading', { name: title })).toBeVisible();

  // Design 04 note 4 (T681): "✓ Pre-agg · 3m", the build's age in a word, the
  // rest in its tooltip: the rollup's name, the time to the second, how long
  // the answer took, and how long ago it was built.
  const accelerated = page
    .locator('[data-tile="tile-monthly_orders"]')
    .getByTestId('tile-freshness');
  // Its words with the time, for a screen reader reading the tile.
  await expect(accelerated).toHaveText(/^Pre-agg · \d+[smhdw] · as of .*\d{2}:\d{2}:\d{2}$/);
  // Its icon and its words, never colour alone.
  await expect(accelerated.locator('[data-icon="ok"]')).toHaveCount(1);
  await expect(accelerated).toHaveAttribute(
    'title',
    /^Pre-aggregation monthly_orders\.by_status_month · as of .+ \d{2}:\d{2}:\d{2} \(.*\d{2}:\d{2}:\d{2} UTC\) · \d+ ms · built .+ ago$/,
  );

  // So a half-width tile keeps its title readable (T014's review), and its
  // head clear of the corner controls: Table view is ⋯'s since T681's
  // follow-up (R76 dashboard-Q1), and the badge ends before ↻ begins.
  const tile = page.locator('[data-tile="tile-monthly_orders"]');
  await expect(accelerated.locator('.tile-freshness__label')).toHaveText(/^Pre-agg · \d+[smhdw]$/);
  const heading = await tile
    .getByRole('heading', { name: 'monthly_orders by status' })
    .boundingBox();
  expect(heading?.width ?? 0).toBeGreaterThanOrEqual(96);
  await tile.hover();
  await expect(tile.getByTestId('toggle-table-view')).toHaveCount(0);
  const badge = await accelerated.boundingBox();
  const refresh = await tile.getByRole('button', { name: /^Refresh / }).boundingBox();
  expect((badge?.x ?? 0) + (badge?.width ?? 0)).toBeLessThanOrEqual(refresh?.x ?? 0);

  const live = page.locator('[data-tile="tile-orders"]').getByTestId('tile-freshness');
  await expect(live.locator('.tile-freshness__label')).toHaveText('Live');
  await expect(live).not.toHaveText(/Pre-agg/);
  await expect(live.locator('.tile-freshness__dot')).toHaveCount(1);
  await expect(live).toHaveAttribute(
    'title',
    /^Live query · as of .+ \d{2}:\d{2}:\d{2} \(.*\d{2}:\d{2}:\d{2} UTC\) · \d+ ms · no pre-aggregation$/,
  );
});

/**
 * T154 / AC-148, as reworded at the user's decision (2026-09-22): a refresh
 * Cube answers from a rollup is the rollup's data as last built — `no-cache`
 * does not rebuild it (research/cube/refresh-jobs-caching.md) — so the tile
 * says so, and names Jobs as where it is rebuilt; a tile the database
 * answered says nothing of the kind.
 */
test('refreshing a tile a pre-aggregation serves says its data is as of the last build, and where to rebuild it', async ({
  page,
  request,
}) => {
  const { id, title } = await dashboardOn(request, ['monthly_orders', 'orders']);
  await page.goto(`/explore/dashboards/${id}`);
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  const accelerated = page.locator('[data-tile="tile-monthly_orders"]');
  const live = page.locator('[data-tile="tile-orders"]');
  await expect(accelerated.getByTestId('tile-freshness')).toHaveText(/^Pre-agg/);
  await expect(live.getByTestId('tile-freshness')).toHaveText(/^Live/);

  await accelerated.hover();
  await accelerated.getByRole('button', { name: /^Refresh / }).click();
  await live.hover();
  await live.getByRole('button', { name: /^Refresh / }).click();

  const note = accelerated.getByTestId('rollup-refresh-note');
  await expect(note).toContainText('monthly_orders.by_status_month');
  await expect(note).toContainText('as of its last build');
  await expect(note.locator('[data-icon]')).toHaveCount(1);
  await expect(note.getByRole('link', { name: 'Jobs' })).toHaveAttribute('href', '/jobs');
  await expect(live.getByTestId('rollup-refresh-note')).toHaveCount(0);
  // AC-004 (T233): the rollup's name in the note is text like any other —
  // it was set at 11 px, on a state the type audit's pages never reach.
  expect(
    Number.parseFloat(
      await note.locator('code').evaluate((node) => getComputedStyle(node).fontSize),
    ),
  ).toBeGreaterThanOrEqual(12);

  await note.getByRole('button', { name: 'Dismiss' }).click();
  await expect(note).toHaveCount(0);
});

/**
 * T273 / AC-245: WHEN the user opens the tile menu's Data as of submenu, THE
 * SYSTEM SHALL show, for an answer a pre-aggregation served, its name, its
 * last build, its refresh schedule in words and as written, and its next run
 * with how late it may start, with Refresh now, Open in Jobs on that
 * pre-aggregation and Edit schedule in Model; and, for an answer the database
 * served, say so, with Refresh now and Why not accelerated.
 * `Fails when: one of those items is missing, Open in Jobs does not select
 * that pre-aggregation, or a database answer is described as a
 * pre-aggregation's.`
 *
 * The seed rollup is refreshed every hour, so the worker may start a run up
 * to 5½ minutes after its turn-over (research/cube/refresh-key-schedule.md).
 */
test('Data as of says what served a tile, how fresh it is and where that is set', async ({
  page,
  request,
}) => {
  const { id, title } = await dashboardOn(request, ['monthly_orders', 'orders']);
  await page.goto(`/explore/dashboards/${id}`);
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  const accelerated = page.locator('[data-tile="tile-monthly_orders"]');
  const live = page.locator('[data-tile="tile-orders"]');
  await expect(accelerated.getByTestId('tile-freshness')).toHaveText(/^Pre-agg/);
  await expect(live.getByTestId('tile-freshness')).toHaveText(/^Live/);
  const asOf = async (tile: typeof live) => {
    await tile.getByRole('button', { name: /^Actions for / }).click();
    await tile.getByRole('menuitem', { name: /^Data as of \d/ }).click();
    return tile.getByRole('menu', { name: /^Data as of \d/ });
  };

  // A pre-aggregation's answer: what it is, when built, when it runs next.
  // The footer's second line names it, with its interval (T681; design 08, pin 10).
  await accelerated.getByRole('button', { name: /^Actions for / }).click();
  await expect(
    accelerated.getByRole('menuitem', { name: /^Data as of \d/ }).locator('.menu__detail'),
  ).toHaveText('⚡Pre-aggregation · every hour');
  await page.keyboard.press('Escape');
  let menu = await asOf(accelerated);
  await expect(menu.getByRole('menuitem')).toHaveText([
    'Pre-aggregation monthly_orders.by_status_month',
    /^Last built \d/,
    // In Schedules' words (T551).
    'Refreshed every hour',
    'As written: every: "1 hour"',
    // The day too, when the next hour is tomorrow's (T273's review).
    // Day first, no comma, never "Sept" (T477; Q6, Q8).
    /^Next run (\d{1,2} [A-Z][a-z]{2} )?\d{2}:\d{2}, may start up to 5½ min late$/,
    'Refresh now',
    'Open in Jobs',
    'Edit schedule in Model',
  ]);
  // Open in Jobs: that pre-aggregation, selected.
  await menu.getByRole('menuitem', { name: 'Open in Jobs' }).click();
  await expect(page).toHaveURL(/\/jobs\?preagg=monthly_orders\.by_status_month$/);
  // Its row, by its name, a button read as the row is (T611).
  await expect(
    page
      .getByRole('table', { name: 'Pre-aggregations' })
      .getByRole('row')
      .filter({
        has: page
          .getByTestId('preagg-name')
          .filter({ hasText: /^monthly_orders\.by_status_month$/ }),
      }),
  ).toHaveAttribute('aria-selected', 'true');

  // Edit schedule in Model: its file, on its cube's pre-aggregations.
  await page.goto(`/explore/dashboards/${id}`);
  menu = await asOf(accelerated);
  await menu.getByRole('menuitem', { name: 'Edit schedule in Model' }).click();
  await expect(page).toHaveURL(
    /\/model\/files\/cubes%2Fmonthly_orders\.yml\?cube=monthly_orders&tab=pre_aggregations$/,
  );

  // The database's answer is said to be the database's, and why not a rollup:
  // design 08 state D, with the time to the second (T681).
  await page.goto(`/explore/dashboards/${id}`);
  // The footer on two lines, with its clock (design 08, pin 10).
  await live.getByRole('button', { name: /^Actions for / }).click();
  const footer = live.getByRole('menuitem', { name: /^Data as of \d/ });
  await expect(footer.locator('.menu__icon svg')).toHaveCount(1);
  await expect(footer.locator('.menu__detail')).toHaveText('Live · from the database');
  await footer.click();
  menu = live.getByRole('menu', { name: /^Data as of \d/ });
  await expect(menu.getByRole('menuitem')).toHaveText([
    'Answered by the database No pre-aggregation matched this chart’s query.',
    /^Data as of (Today|Yesterday|\d{1,2} [A-Z][a-z]{2}) \d{2}:\d{2}:\d{2} when Cube answered$/,
    'Refresh now',
    'Why not accelerated?',
  ]);
  await menu.getByRole('menuitem', { name: 'Why not accelerated?' }).click();
  const why = page.getByRole('dialog', { name: /is not accelerated$/ });
  // In the model's titles, never its internal names (T403, AC-220).
  await expect(why.getByTestId('acceleration-miss')).toContainText(
    'Orders has no pre-aggregations',
  );
  await expect(why.getByTestId('acceleration-miss')).not.toContainText('orders.count');
  await page.keyboard.press('Escape');
  await expect(why).toHaveCount(0);
});
