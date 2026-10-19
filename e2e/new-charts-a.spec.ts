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
    'Time period and trend',
    'Tile by',
    'Direction',
  ]);
  // One "Time" heading: the query's own (T936 follow-up).
  expect(all.filter((label) => label === 'Time')).toHaveLength(1);
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

/**
 * T943 / AC-570: WHEN a graphical table is edited, THE SYSTEM SHALL take Rows
 * (one dimension), Group rows by (an optional second dimension …), and
 * Columns, an ordered list in which each column is a Value, Change,
 * Sparkline, Bullet or Icon, set with R80's element settings for that kind
 * …; each column row SHALL open its settings, and its ⋯ menu SHALL hold Move
 * up, Move down and Remove, with Undo; and with no column, … SHALL say "Add a
 * column: Value, Change, Sparkline, Bullet or Icon." with + Column.
 * `Fails when: a column kind is missing or another is offered; … a column
 * can't be moved or removed without dragging, or Remove can't be undone; …
 * or an empty table lacks the sentence or the action.`
 * And AC-037 (R81): its spec, saved and reopened, is the same.
 */
test('a graphical table takes Rows, Group rows by and ordered columns, moved and removed from ⋯ with Undo, through a save', async ({
  page,
}) => {
  await newInMyWorkspace(page, 'Chart', 'seed-folder-0');
  await expect(page).toHaveURL(/\/explore\/charts\/[^/]+\/edit\?new=true$/);
  const id = /\/explore\/charts\/([^/]+)\/edit/.exec(page.url())?.[1] ?? '';
  await cubePicker(page).selectOption({ label: 'Orders' });
  await expect(page.getByTestId('member-orders.count')).toBeVisible();
  await wellPicker(page, 'measures').selectOption('orders.count');
  await wellPicker(page, 'dimensions').selectOption('orders.status');
  await chooseChartType(page, 'graphicalTable');
  await expectChartType(page, 'graphicalTable');

  await expect(page.getByTestId('graphicalTable-rows')).toHaveText('Orders Status');
  await expect(page.getByTestId('graphicalTable-groupBy')).toContainText('Optional');
  const columns = page.getByTestId('well-graphicalTable-columns');
  await expect(columns).toContainText('Add a column: Value, Change, Sparkline, Bullet or Icon.');

  const add = columns.getByRole('button', { name: 'Add a column' });
  await add.click();
  await expect(page.getByRole('menu').getByRole('menuitem')).toHaveText([
    'Value',
    'Change',
    'Sparkline',
    'Bullet',
    'Icon',
  ]);
  await page.getByRole('menuitem', { name: 'Value' }).click();
  await add.click();
  await page.getByRole('menuitem', { name: 'Change' }).click();
  await add.click();
  await page.getByRole('menuitem', { name: 'Icon' }).click();
  const list = columns.getByRole('list', { name: 'Columns' });
  const names = list.locator('.gt-columns__name');
  await expect(names).toHaveText([
    'Value · Orders Count',
    'Change · Orders Count vs the previous period',
    'Icon · Orders Count',
  ]);

  // A column's row opens R80's settings for its kind: a Change's.
  await names.nth(1).click();
  const change = page.getByRole('group', { name: 'Change · Orders Count vs the previous period' });
  await change.getByRole('combobox', { name: 'Period' }).selectOption('quarter');
  await expect(names.nth(1)).toHaveText('Change · Orders Count vs last quarter');
  await page
    .getByRole('group', { name: 'Change · Orders Count vs last quarter' })
    .getByRole('radio', { name: 'Lower is better' })
    .check();

  // Moved by its ⋯ menu, with no drag.
  await columns.getByRole('button', { name: 'Column 3, Icon · Orders Count: more' }).click();
  await page.getByRole('menuitem', { name: 'Move up' }).click();
  await expect(names).toHaveText([
    'Value · Orders Count',
    'Icon · Orders Count',
    'Change · Orders Count vs last quarter',
  ]);

  // Removed, and put back by Undo where it was.
  await columns.getByRole('button', { name: 'Column 1, Value · Orders Count: more' }).click();
  await page.getByRole('menuitem', { name: 'Remove' }).click();
  await expect(names).toHaveText(['Icon · Orders Count', 'Change · Orders Count vs last quarter']);
  const toast = page.getByTestId('undo-toast');
  await expect(toast).toContainText('Removed the column Value · Orders Count.');
  await toast.getByRole('button', { name: 'Undo' }).click();
  await expect(names).toHaveText([
    'Value · Orders Count',
    'Icon · Orders Count',
    'Change · Orders Count vs last quarter',
  ]);

  const title = `Graphical table ${String(Date.now())}`;
  const head = page.getByTestId('editor-bar');
  await head.getByLabel('Chart title').fill(title);
  await head.getByRole('button', { name: '← Back to Explore' }).click();
  await expect(page).toHaveURL(new RegExp(`/explore/charts/${id}$`));

  // Reopened: the same columns, in the same order, with their settings.
  await page.goto(`/explore/charts/${id}/edit`);
  await expectChartType(page, 'graphicalTable');
  const reopened = page.getByTestId('well-graphicalTable-columns').locator('.gt-columns__name');
  await expect(reopened).toHaveText([
    'Value · Orders Count',
    'Icon · Orders Count',
    'Change · Orders Count vs last quarter',
  ]);
  await reopened.nth(2).click();
  await expect(
    page
      .getByRole('group', { name: 'Change · Orders Count vs last quarter' })
      .getByRole('radio', { name: 'Lower is better' }),
  ).toBeChecked();
});

/**
 * T953 / AC-580: THE SYSTEM SHALL offer the bullet chart only while Target
 * holds a measure or a value, its card otherwise greyed with "Put a measure
 * or a value in Target"; take Metrics, Target, Bands as 2 or 3 percentages
 * of the target (80 %, 100 % and 120 % by default), and one dimension; refuse
 * a fourth band, saying "At most 3 bands: R80's three greys, and no fourth
 * without a new colour."; and with Target emptied, say "A bullet chart
 * compares each member with a target. Put a measure or a value in Target."
 * with the Target well as its action.
 * `Fails when: a bullet chart can be drawn with no target; fewer than 2 or
 * more than 3 bands can be set; the defaults differ; or a sentence or action
 * is missing.` And AC-217 (R81): a greyed card chosen highlights the well it
 * needs; AC-037 (R81): the spec, saved and reopened, is the same.
 */
test('a bullet chart is drawable only with a Target, takes 2 or 3 bands from 80, 100 and 120 %, and keeps them through a save', async ({
  page,
}) => {
  await newInMyWorkspace(page, 'Chart', 'seed-folder-0');
  await expect(page).toHaveURL(/\/explore\/charts\/[^/]+\/edit\?new=true$/);
  const id = /\/explore\/charts\/([^/]+)\/edit/.exec(page.url())?.[1] ?? '';
  await cubePicker(page).selectOption({ label: 'Orders' });
  await expect(page.getByTestId('member-orders.count')).toBeVisible();
  await wellPicker(page, 'measures').selectOption('orders.count');
  await wellPicker(page, 'dimensions').selectOption('orders.status');

  // Greyed with what it needs, and still chosen: Target highlighted.
  await page.getByTestId('chart-type-change').click();
  const gallery = page.getByRole('dialog', { name: 'Choose chart type' });
  await gallery.getByRole('button', { name: 'All charts' }).click();
  const card = gallery.getByTestId('type-card-bullet');
  await expect(card).toHaveAttribute('data-drawable', 'false');
  await expect(card.locator('.type-card__missing')).toHaveText(
    'Put a measure or a value in Target',
  );
  await card.click();
  await expectChartType(page, 'bullet');
  const target = page.getByTestId('well-bullet-target');
  await expect(target).toHaveAttribute('data-highlight', 'true');
  await expect(target).toContainText(
    'A bullet chart compares each member with a target. Put a measure or a value in Target.',
  );
  // Not drawn with no target.
  await expect(page.getByTestId('missing-fields')).toContainText(
    'Put a measure or a value in Target',
  );

  // Target is the action.
  await target
    .getByRole('combobox', { name: 'Target', exact: true })
    .selectOption('orders.total_amount');
  await expect(page.getByTestId('missing-fields')).toHaveCount(0);
  await expect(target).not.toContainText('compares each member with a target');

  // Bands: 80, 100 and 120 % by default; a fourth refused; two at least.
  const bands = page.getByRole('group', { name: 'Bands' });
  await expect(bands.getByRole('spinbutton')).toHaveCount(3);
  for (const [at, band] of ['80', '100', '120'].entries())
    await expect(bands.getByRole('spinbutton').nth(at)).toHaveValue(band);
  // Disabled by `aria-disabled`, so still reached, and pressed, from the keyboard.
  await bands.getByRole('button', { name: '+ Band' }).press('Enter');
  await expect(bands).toContainText(
    'At most 3 bands: R80’s three greys, and no fourth without a new colour.',
  );
  await expect(bands.getByRole('spinbutton')).toHaveCount(3);
  await bands.getByRole('button', { name: 'Remove band 3, 120 %' }).click();
  await expect(bands.getByRole('spinbutton')).toHaveCount(2);
  await bands.getByRole('button', { name: 'Remove band 2, 100 %' }).press('Enter');
  await expect(bands).toContainText('At least 2 bands: a bullet chart’s bands are 2 or 3.');
  await expect(bands.getByRole('spinbutton')).toHaveCount(2);
  const first = bands.getByRole('spinbutton', { name: 'Band 1, % of target' });
  await first.fill('90');
  await first.press('Enter');

  const title = `Bullet ${String(Date.now())}`;
  const head = page.getByTestId('editor-bar');
  await head.getByLabel('Chart title').fill(title);
  await head.getByRole('button', { name: '← Back to Explore' }).click();
  await expect(page).toHaveURL(new RegExp(`/explore/charts/${id}$`));

  // Reopened: the same target and bands.
  await page.goto(`/explore/charts/${id}/edit`);
  await expectChartType(page, 'bullet');
  await expect(
    page.getByTestId('well-bullet-target').getByRole('combobox', { name: 'Target', exact: true }),
  ).toHaveValue('orders.total_amount');
  const reopened = page.getByRole('group', { name: 'Bands' }).getByRole('spinbutton');
  await expect(reopened).toHaveCount(2);
  await expect(reopened.nth(0)).toHaveValue('90');
  await expect(reopened.nth(1)).toHaveValue('100');
});
