import { expect, test } from '@playwright/test';

import { chooseChartType, expectChartType } from './chartType';
import { cubePicker } from './cubePicker';
import { wellPicker } from './wells';
import { newInMyWorkspace } from './workspace';

/**
 * Lane CHARTS-A's types, on the running app (docs/tasks.md §P2.27; T972
 * gathers them on one dashboard).
 *
 * T936 / AC-564: WHEN a KPI is edited, THE SYSTEM SHALL offer, after
 * Metrics, the optional wells Compare to (Previous period, Same period last
 * year, Another measure, A value, or None), Target (a measure or a value),
 * Time (the period and the trend's time dimension), Tile by (one dimension)
 * and Direction (Higher is better, the default, Lower is better, or Neutral);
 * and a KPI with none of the new wells set … SHALL draw exactly as before,
 * with no change line, sparkline or target …
 * `Fails when: a well or a Compare to choice is missing, or another is
 * offered; Direction starts other than Higher is better; or a KPI with none
 * set gains a change line, a sparkline, a target or a new layout.`
 * And AC-037 (R81): a spec of one of R81's types, saved and reopened, is
 * the same.
 */
test('a KPI offers its five wells after Metrics, keeps what is set through a save, and draws as before', async ({
  page,
}) => {
  await newInMyWorkspace(page, 'Chart', 'seed-folder-0');
  await expect(page).toHaveURL(/\/explore\/charts\/[^/]+\/edit\?new=true$/);
  const id = /\/explore\/charts\/([^/]+)\/edit/.exec(page.url())?.[1] ?? '';
  await cubePicker(page).selectOption({ label: 'Orders' });
  await expect(page.getByTestId('member-orders.count')).toBeVisible();
  await wellPicker(page, 'measures').selectOption('orders.count');
  await chooseChartType(page, 'kpi');
  await expectChartType(page, 'kpi');

  // After Metrics, in design 23's order.
  const labels = page.locator('.wells .well-field__label');
  const all = (await labels.allTextContents()).map((label) => label.trim());
  const at = all.findIndex((label) => label.startsWith('Metrics'));
  expect(all.slice(at, at + 6)).toEqual([
    'Metrics',
    'Compare to',
    'Target',
    'Time',
    'Tile by',
    'Direction',
  ]);
  const compare = page.getByRole('combobox', { name: 'Compare to', exact: true });
  await expect(compare.locator('option')).toHaveText([
    'None',
    'Previous period',
    'Same period last year',
    'Another measure',
    'A value',
  ]);
  await expect(compare).toHaveValue('none');
  await expect(page.getByRole('radio', { name: 'Higher is better' })).toBeChecked();

  // None set: the KPI draws as it always has — its value and label, and no
  // change line, sparkline or target.
  const result = page.getByTestId('editor-result');
  await expect(result.getByTestId('kpi-value')).toBeVisible();
  await expect(result.getByTestId('kpi').locator(':scope > *')).toHaveCount(2);
  for (const part of ['kpi-change', 'kpi-trend', 'kpi-target'])
    await expect(result.getByTestId(part)).toHaveCount(0);

  await compare.selectOption('samePeriodLastYear');
  await page.getByRole('radio', { name: 'Lower is better' }).click();

  const title = `KPI ${String(Date.now())}`;
  const head = page.getByTestId('editor-bar');
  await head.getByLabel('Chart title').fill(title);
  await head.getByRole('button', { name: '← Back to Explore' }).click();
  await expect(page).toHaveURL(new RegExp(`/explore/charts/${id}$`));

  // Reopened: the same settings.
  await page.goto(`/explore/charts/${id}/edit`);
  await expectChartType(page, 'kpi');
  await expect(page.getByRole('combobox', { name: 'Compare to', exact: true })).toHaveValue(
    'samePeriodLastYear',
  );
  await expect(page.getByRole('radio', { name: 'Lower is better' })).toBeChecked();
  // What wasn't set stays unset.
  await expect(page.getByRole('combobox', { name: 'Target', exact: true })).toHaveValue('');
  await expect(page.getByRole('combobox', { name: 'Tile by', exact: true })).toHaveValue('');
  await expect(page.getByTestId('editor-result').getByTestId('kpi-value')).toBeVisible();
});
