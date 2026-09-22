import { expect, test, type Page } from '@playwright/test';

import { ownCubeFile } from './model-files';

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

  await expect(page.getByRole('alert').filter({ hasText: 'Cube refused the model' })).toBeVisible();
  const problem = page
    .getByRole('region', { name: 'Problems' })
    .getByRole('listitem')
    .filter({ hasText: 'preAggregations.by_status.granularity) is required' });
  await expect(problem.locator('.model-problems__where')).toHaveText(path);
  expect(await storedFile(page, path)).toContain('granularity: month');
});
