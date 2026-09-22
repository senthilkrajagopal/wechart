import { expect, test, type Page } from '@playwright/test';

import { ownCubeFile, PUBLISHED } from './model-files';

/**
 * F16 — pre-aggregations, on the sample model's accelerated cube,
 * `cubes/monthly_orders.yml` (T014).
 *
 * T148 / AC-142: WHEN the user opens a cube's pre-aggregations, THE SYSTEM
 * SHALL list each rollup with its measures, dimensions, time dimension,
 * granularity, partition granularity and indexes.
 * Fails when: a declared rollup or any of those attributes is missing.
 */
test('a cube’s pre-aggregations list each rollup with what it declares', async ({ page }) => {
  await page.goto('/model/files/cubes%2Fmonthly_orders.yml');
  const form = page.getByRole('region', { name: 'Cube monthly_orders' });
  await form.getByRole('tab', { name: /^Pre-aggregations/ }).click();

  const rollups = form.getByRole('list', { name: 'Pre-aggregations' }).locator(':scope > li');
  await expect(rollups).toHaveCount(1);
  const rollup = rollups.first();
  await expect(rollup.locator('.model-member__name').first()).toHaveText('by_status_month');

  const facts = rollup.locator('.rollup-facts > div');
  await expect(facts.locator('dt')).toHaveText([
    'Measures',
    'Dimensions',
    'Time dimension',
    'Granularity',
    'Partition granularity',
    'Indexes',
  ]);
  await expect(facts.locator('dd')).toHaveText([
    'count, total_amount',
    'status',
    'ordered_at',
    'month',
    'year',
    'by_status (status)',
  ]);
  // Listed without opening the rollup's form.
  await expect(facts.first()).toBeVisible();
  await expect(rollup.locator(':scope > details')).not.toHaveAttribute('open', /.*/);
});

/**
 * T149 / AC-143: WHEN the user edits a rollup in the form, THE SYSTEM SHALL
 * write it into the model file as YAML, subject to the same validation and
 * publishing as any model change.
 * Fails when: the change is applied to Cube without being written to the
 * model file.
 *
 * On a cube file of this browser's own (the browsers publish at once), with a
 * rollup, against the real Cube: the edit is YAML in the file first, and goes
 * to Cube only through "Save & reload Cube" — compiled by Cube as a draft,
 * published if it compiles (T142).
 */
const withRollup = (cube: string) => `cubes:
  - name: ${cube}
    sql_table: public.orders

    dimensions:
      - name: id
        sql: id
        type: number
        primary_key: true
      - name: status
        sql: status
        type: string
      - name: ordered_at
        sql: ordered_at
        type: time

    measures:
      - name: count
        type: count

    pre_aggregations:
      - name: by_status
        measures:
          - count
        dimensions:
          - status
        time_dimension: ordered_at
        granularity: month
`;

/** The one rollup's form, opened. */
async function openRollup(page: Page, cube: string) {
  const form = page.getByRole('region', { name: `Cube ${cube}` });
  await form.getByRole('tab', { name: /^Pre-aggregations/ }).click();
  const rollup = form
    .getByRole('list', { name: 'Pre-aggregations' })
    .locator(':scope > li')
    .filter({ has: page.locator('.model-member__name', { hasText: /^by_status$/ }) });
  await rollup.locator(':scope > details > summary').click();
  const own = (key: string) =>
    rollup.locator(`:scope > details > .model-form__fields > [data-key="${key}"]`);
  return { rollup, own };
}

const storedFile = async (page: Page, path: string) =>
  (
    (await (await page.request.get('/api/model/files')).json()) as {
      files: { path: string; content: string }[];
    }
  ).files.find((file) => file.path === path)?.content ?? '';

test('a rollup edited in its form is YAML in its file, and published as any model change', async ({
  page,
}, testInfo) => {
  const cube = `e2e_rollup_${testInfo.project.name}`;
  const path = await ownCubeFile(page.request, cube, withRollup(cube));
  await page.goto(`/model/files/${encodeURIComponent(path)}`);
  const yaml = page.getByRole('textbox', { name: `${path}, as YAML` });
  const { rollup, own } = await openRollup(page, cube);

  // Free text: a model may define granularities of its own.
  await own('granularity').getByLabel('Granularity', { exact: true }).fill('day');

  // In the file's YAML at once; not in the stored model until it is saved.
  await expect(yaml).toContainText('granularity: day');
  expect(await storedFile(page, path)).toContain('granularity: month');
  await expect(rollup.locator('.rollup-facts dd').nth(3)).toHaveText('day');

  await page.getByRole('button', { name: 'Save & reload Cube' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Published' })).toHaveText(
    'Published. Cube is reading the new model.',
    PUBLISHED,
  );
  const stored = await storedFile(page, path);
  expect(stored).toContain('granularity: day');
  expect(stored).not.toContain('granularity: month');
});

test('a rollup edit Cube refuses is not published', async ({ page }, testInfo) => {
  const cube = `e2e_rollup_refused_${testInfo.project.name}`;
  const path = await ownCubeFile(page.request, cube, withRollup(cube));
  await page.goto(`/model/files/${encodeURIComponent(path)}`);
  const { own } = await openRollup(page, cube);

  /**
   * A time dimension with its granularity cleared: one of the rollup mistakes
   * Cube's compile refuses. An unknown member it lets through, to fail only
   * when the rollup is built (research/cube/pre-aggregations.md, "Observed
   * locally") — the same validation any model change gets, no more.
   */
  await own('granularity').getByLabel('Granularity', { exact: true }).fill('');
  await expect(page.getByRole('textbox', { name: `${path}, as YAML` })).not.toContainText(
    'granularity:',
  );
  await page.getByRole('button', { name: 'Save & reload Cube' }).click();

  await expect(page.getByRole('alert').filter({ hasText: 'Cube refused the model' })).toBeVisible(
    PUBLISHED,
  );
  const problem = page
    .getByRole('region', { name: 'Problems' })
    .getByRole('listitem')
    .filter({ hasText: 'preAggregations.by_status.granularity) is required' });
  await expect(problem.locator('.model-problems__where')).toHaveText(path);
  expect(await storedFile(page, path)).toContain('granularity: month');
});

/**
 * T152 / AC-146: WHEN the user defines an index on a rollup, THE SYSTEM SHALL
 * let the columns be ordered and mark aggregate indexes as such.
 * Fails when: the column order cannot be changed, or an aggregate index is
 * written as a regular one.
 *
 * On a cube file of this browser's own with an indexed rollup, against the
 * real Cube: the order and the type are what the file says, and Cube compiles
 * it.
 */
test('an index’s columns are moved into order, and an aggregate one is written so', async ({
  page,
}, testInfo) => {
  const cube = `e2e_index_${testInfo.project.name}`;
  const content = withRollup(cube)
    .replace(
      '      - name: status\n        sql: status\n        type: string\n',
      '      - name: status\n        sql: status\n        type: string\n' +
        '      - name: customer_id\n        sql: customer_id\n        type: number\n',
    )
    .replace(
      '        dimensions:\n          - status\n',
      '        dimensions:\n          - status\n          - customer_id\n' +
        '        indexes:\n          - name: by_customer\n            columns:\n' +
        '              - status\n              - customer_id\n',
    );
  const path = await ownCubeFile(page.request, cube, content);
  await page.goto(`/model/files/${encodeURIComponent(path)}`);
  const yaml = page.getByRole('textbox', { name: `${path}, as YAML` });
  const { rollup } = await openRollup(page, cube);
  await rollup.locator('.model-member__name', { hasText: /^by_customer$/ }).click();
  const index = rollup.locator('.model-member').filter({
    has: page.locator(':scope > summary .model-member__name', { hasText: /^by_customer$/ }),
  });
  const columns = index.getByRole('list', { name: 'Columns' });
  await expect(columns.locator('.ordered-references__name')).toHaveText(['status', 'customer_id']);

  await columns.getByRole('button', { name: 'Move customer_id up' }).click();
  await index.getByLabel('Type', { exact: true }).selectOption('aggregate');

  await expect(columns.locator('.ordered-references__name')).toHaveText(['customer_id', 'status']);
  await expect(yaml).toContainText('type: aggregate');
  await page.getByRole('button', { name: 'Save & reload Cube' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Published' })).toHaveText(
    'Published. Cube is reading the new model.',
    PUBLISHED,
  );
  // The file, in the order moved into, the index marked aggregate.
  expect(await storedFile(page, path)).toContain(
    '        indexes:\n          - name: by_customer\n            columns:\n' +
      '              - customer_id\n              - status\n            type: aggregate\n',
  );
});

/**
 * T150 / AC-144: WHEN the user opens a chart's acceleration panel, THE SYSTEM
 * SHALL say whether the chart's query matches a pre-aggregation, and when it
 * does not, name the member that prevents the match.
 * Fails when: the panel reports a match that Cube does not use, or names no
 * reason for a miss.
 *
 * In the chart editor, against the real Cube and the seed rollup: the match
 * the panel reports is the one Cube serves the chart from (`/api/load`'s
 * `usedPreAggregations`), and a miss names its member.
 */
test('a chart’s acceleration panel says which rollup serves it, and what stops one', async ({
  page,
}) => {
  const served = async (query: Record<string, unknown>) =>
    Object.values(
      (
        (await (await page.request.post('/api/load', { data: { query } })).json()) as {
          usedPreAggregations?: Record<string, { preAggregationId?: string }>;
        }
      ).usedPreAggregations ?? {},
    ).map((each) => each.preAggregationId);
  const byStatus = { measures: ['monthly_orders.count'], dimensions: ['monthly_orders.status'] };
  // The refresh worker builds the rollup a little after Cube starts.
  await expect(async () => {
    expect(await served(byStatus)).toEqual(['monthly_orders.by_status_month']);
  }).toPass({ timeout: 90_000, intervals: [2_000] });

  await page.goto('/explore/charts/seed-chart-empty/edit');
  await page.getByLabel('Cube or view').selectOption({ value: 'monthly_orders' });
  await page.getByTestId('add-measures').selectOption('monthly_orders.count');
  await page.getByTestId('add-dimensions').selectOption('monthly_orders.status');
  /**
   * Waited for longer than the default: the other browsers publish cube files
   * of their own at the same time, and Cube compiles the store's model again
   * after each — so a query just after one can take several seconds.
   */
  const cube = { timeout: 30_000 };
  await expect(page.getByTestId('result-row-count')).toHaveText('3 rows', cube);
  await page.getByRole('button', { name: 'Results', exact: true }).click();
  await page.getByTestId('drawer-tab-acceleration').click();

  // The rollup Cube serves the chart from, and no other.
  await expect(page.getByTestId('acceleration-matched')).toHaveText(
    'Served from the pre-aggregation monthly_orders.by_status_month.',
    cube,
  );

  // The time, asked by day (every time field is, `QUERY_GRANULARITY`): finer
  // than the rollup's month — a miss, and the member named.
  await page.getByTestId('add-timeDimensions').selectOption('monthly_orders.ordered_at');
  await expect(page.getByTestId('acceleration-member')).toHaveText(
    'monthly_orders.ordered_at',
    cube,
  );
  await expect(page.getByTestId('acceleration-miss')).toContainText(
    'the nearest is monthly_orders.by_status_month. Stopped by monthly_orders.ordered_at: ' +
      'monthly_orders.ordered_at is grouped by day, and the rollup keeps it by month.',
  );
  // And Cube does answer that chart from the database.
  expect(
    await served({
      measures: ['monthly_orders.count'],
      dimensions: ['monthly_orders.status'],
      timeDimensions: [{ dimension: 'monthly_orders.ordered_at', granularity: 'day' }],
    }),
  ).toEqual([]);

  // A cube with no rollups says so.
  await page.getByLabel('Cube or view').selectOption({ label: 'Orders' });
  await page.getByTestId('add-measures').selectOption('orders.count');
  await expect(page.getByTestId('acceleration-miss')).toHaveText(
    'Not served from a pre-aggregation. Stopped by orders.count: orders has no pre-aggregations.',
    cube,
  );
});

/**
 * T153 / AC-147: IF a query would fail under rollup-only mode, THEN THE
 * SYSTEM SHALL warn on the chart that it depends on the source database.
 * Fails when: such a chart shows no warning.
 *
 * Under rollup-only mode Cube refuses what no pre-aggregation serves
 * (research/cube/pre-aggregations.md §2): on the real Cube, a chart on
 * `orders`, which has no rollups, is such a chart, and one the seed rollup
 * serves is not.
 */
test('a chart no rollup serves is warned of depending on the source database', async ({ page }) => {
  const cube = { timeout: 30_000 };
  await page.goto('/explore/charts/seed-chart-empty/edit');
  await page.getByLabel('Cube or view').selectOption({ label: 'Orders' });
  await page.getByTestId('add-measures').selectOption('orders.count');

  // On the chart itself, beside its result — nothing to open first (T153's
  // review: "warn on the chart").
  const onChart = page.getByTestId('result-source');
  const warning = onChart.getByTestId('rollup-only-warning');
  await expect(warning).toHaveText(
    'Depends on the source database: in rollup-only mode, Cube would refuse this chart.',
    cube,
  );
  await expect(warning).toHaveAttribute('role', 'status');
  await expect(warning.locator('[data-icon="warning"]')).toHaveCount(1);
  await expect(onChart.getByTestId('acceleration')).toContainText('Live');
  // And in its acceleration panel.
  await page.getByRole('button', { name: 'Results', exact: true }).click();
  await page.getByTestId('drawer-tab-acceleration').click();
  await expect(
    page.getByRole('tabpanel', { name: 'Acceleration' }).getByTestId('rollup-only-warning'),
  ).toBeVisible(cube);

  // A chart the rollup serves: no warning, on the chart or in the panel.
  await page.getByLabel('Cube or view').selectOption({ value: 'monthly_orders' });
  await page.getByTestId('add-measures').selectOption('monthly_orders.count');
  await page.getByTestId('add-dimensions').selectOption('monthly_orders.status');
  await expect(page.getByTestId('acceleration-matched')).toBeVisible(cube);
  await expect(onChart.getByTestId('acceleration')).toContainText('Accelerated', cube);
  await expect(page.getByTestId('rollup-only-warning')).toHaveCount(0);
});
