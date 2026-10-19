import { expect, test, type APIRequestContext, type Locator, type Page } from '@playwright/test';

import { chooseChartType, expectChartType } from './chartType';
import { cubePicker } from './cubePicker';
import { viewAs } from './tileMenu';
import { wellPicker } from './wells';
import { IN_MY_WORKSPACE, newInMyWorkspace } from './workspace';

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

/**
 * T957 / AC-584: THE SYSTEM SHALL offer Customize › Stack, Sum or 100 %, on
 * Stacked bar and Stacked area, the gallery's 100 % stacked bar and 100 %
 * stacked area cards opening them at 100 %; WHILE the measure isn't summed,
 * 100 % SHALL be disabled with "‹measure› is an average, so its shares of a
 * total wouldn't mean anything. 100 % takes a summed measure."; at 100 %, the
 * value axis SHALL be fixed at 0–100 % with ticks every 25 %, include zero
 * and log scale not offered; …
 * `Fails when: a 100 % card opens at Sum; 100 % can be chosen for an average;
 * the axis passes 100 % or isn't in steps of 25 %; …` (the shares, folding
 * and tooltips: `charts/src/series/stack100.test.ts`). And AC-037 (R81): the
 * chart, saved and reopened, is the same.
 */
test('the 100 % stacked bar card opens Stacked bar at 100 % on a 0–100 % axis, Stack switches it, and an average refuses it', async ({
  page,
}) => {
  const ticks = () => page.getByTestId('chart-canvas').locator('svg text').allTextContents();
  const percentTicks = ['0 %', '25 %', '50 %', '75 %', '100 %'];

  await newInMyWorkspace(page, 'Chart', 'seed-folder-0');
  await expect(page).toHaveURL(/\/explore\/charts\/[^/]+\/edit\?new=true$/);
  const id = /\/explore\/charts\/([^/]+)\/edit/.exec(page.url())?.[1] ?? '';
  await cubePicker(page).selectOption({ label: 'Orders' });
  await expect(page.getByTestId('member-orders.count')).toBeVisible();
  await wellPicker(page, 'measures').selectOption('orders.count');
  await wellPicker(page, 'dimensions').selectOption('orders.status');
  await wellPicker(page, 'dimensions').selectOption('customers.country');

  await chooseChartType(page, 'stackedBar100');
  await expectChartType(page, 'stackedBar');
  await expect.poll(ticks).toEqual(expect.arrayContaining(percentTicks));
  // Never past 100 %, and every tick a step of 25.
  const shown = (await ticks())
    .filter((text) => text.endsWith(' %'))
    .map((text) => parseFloat(text));
  expect(Math.max(...shown)).toBe(100);
  expect(shown.every((value) => value % 25 === 0)).toBe(true);

  await page.getByRole('tab', { name: 'Customize' }).click();
  const stack = page.getByRole('radiogroup', { name: 'Stack' });
  await expect(stack.getByRole('radio', { name: '100 %' })).toBeChecked();
  const y = page.getByTestId('axis-panel-y');
  await expect(y).toContainText('0–100 %, a tick every 25 %');
  for (const gone of ['Logarithmic scale', 'Include zero', 'Minimum', 'Maximum'])
    await expect(y.getByLabel(gone)).toHaveCount(0);

  // Sum, the same chart stacked by its values; then 100 % again.
  await stack.getByRole('radio', { name: 'Sum' }).check();
  await expect.poll(async () => (await ticks()).filter((t) => t.endsWith(' %'))).toEqual([]);
  await expect(y.getByLabel('Logarithmic scale')).toHaveCount(1);
  await stack.getByRole('radio', { name: '100 %' }).check();
  await expect.poll(ticks).toEqual(expect.arrayContaining(percentTicks));

  const head = page.getByTestId('editor-bar');
  await head.getByLabel('Chart title').fill(`Mix ${String(Date.now())}`);
  await head.getByRole('button', { name: '← Back to Explore' }).click();
  await expect(page).toHaveURL(new RegExp(`/explore/charts/${id}$`));
  await page.goto(`/explore/charts/${id}/edit`);
  await expectChartType(page, 'stackedBar');
  await expect.poll(ticks).toEqual(expect.arrayContaining(percentTicks));

  // An average: 100 % refused, with the reason, and the chart at Sum.
  await newInMyWorkspace(page, 'Chart', 'seed-folder-0');
  await cubePicker(page).selectOption({ label: 'Orders' });
  await expect(page.getByTestId('member-orders.average_amount')).toBeVisible();
  await wellPicker(page, 'measures').selectOption('orders.average_amount');
  await wellPicker(page, 'dimensions').selectOption('orders.status');
  await wellPicker(page, 'dimensions').selectOption('customers.country');
  await chooseChartType(page, 'stackedBar100');
  await expectChartType(page, 'stackedBar');
  await page.getByRole('tab', { name: 'Customize' }).click();
  const refused = page.getByRole('radiogroup', { name: 'Stack' });
  await expect(refused.getByRole('radio', { name: '100 %' })).toBeDisabled();
  await expect(refused.getByRole('radio', { name: 'Sum' })).toBeChecked();
  await expect(page.getByTestId('stack-section')).toContainText(
    'Orders Average Amount is an average, so its shares of a total wouldn’t mean anything. 100 % takes a summed measure.',
  );
  await expect.poll(async () => (await ticks()).filter((t) => t.endsWith(' %'))).toEqual([]);
});

const API = 'http://localhost:4100/api';

/**
 * A dashboard in Markings mode with a 100 % stacked bar of orders by status
 * and product category on a 5-column tile, and a bar of orders by country
 * beside it, which marks what the stacked bar doesn't group by.
 */
async function mixDashboard(request: APIRequestContext) {
  const title = `Mix ${String(Date.now())}-${String(Math.round(Math.random() * 1e6))}`;
  const dashboard = (await (
    await request.post(`${API}/documents`, {
      data: { kind: 'dashboard', title, ...IN_MY_WORKSPACE },
    })
  ).json()) as { id: string };
  const chartOn = async (
    chartTitle: string,
    dimensions: readonly string[],
    chartType: string,
    options?: Record<string, unknown>,
  ) => {
    const chart = (await (
      await request.post(`${API}/documents`, {
        data: { kind: 'chart', title: chartTitle, ...IN_MY_WORKSPACE },
      })
    ).json()) as { id: string };
    const saved = await request.put(`${API}/documents/chart/${chart.id}`, {
      data: {
        version: 1,
        body: {
          schemaVersion: 1,
          title: chartTitle,
          owner: 'admin',
          localToDashboardId: dashboard.id,
          chart: {
            source: { cube: 'orders' },
            wells: { measures: ['orders.count'], dimensions, timeDimensions: [] },
            chartType,
            ...(options === undefined ? {} : { options }),
          },
        },
      },
    });
    expect(saved.ok(), await saved.text()).toBe(true);
    return chart.id;
  };
  const mix = await chartOn(
    'Category mix by status',
    ['orders.status', 'products.category'],
    'stackedBar',
    { stack: 'percent' },
  );
  const country = await chartOn('By country', ['customers.country'], 'bar');
  const placed = await request.put(`${API}/documents/dashboard/${dashboard.id}`, {
    data: {
      version: 1,
      body: {
        schemaVersion: 1,
        title,
        ...IN_MY_WORKSPACE,
        owner: 'admin',
        settings: { width: 'fixed', interactions: { mode: 'markings' } },
        markings: [{ id: 'm1', name: 'Marking', slot: 'mk1', isDefault: true }],
        pages: [
          {
            id: 'only',
            title: 'Only',
            items: [
              { id: 'tile-mix', kind: 'chart', w: 5, h: 40, chartId: mix },
              { id: 'tile-country', kind: 'chart', w: 7, h: 40, chartId: country },
            ],
          },
        ],
      },
    },
  });
  expect(placed.ok(), await placed.text()).toBe(true);
  return { id: dashboard.id, title };
}

/**
 * Clicks just above a category's axis label: its bar's lowest segment. A
 * label turned to fit a narrow tile ends at its tick, its box's top right.
 */
async function clickAbove(page: Page, tile: Locator, category: string) {
  const label = tile.locator('svg text', { hasText: category }).first();
  await expect(label).toBeVisible();
  let last = '';
  let box = { x: 0, y: 0, width: 0, height: 0 };
  await expect
    .poll(async () => {
      box = await label.evaluate((text) => {
        const rect = text.getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      });
      const now = JSON.stringify(box);
      const settled = box.width > 0 && now === last;
      last = now;
      return settled;
    })
    .toBe(true);
  const turned = box.height > 24;
  await page.mouse.click(turned ? box.x + box.width - 3 : box.x + box.width / 2, box.y - 10);
}

/**
 * T958 / AC-585: THE SYSTEM SHALL mark a 100 % stacked segment as its
 * (category, colour member) tuple …; WHILE another tile's marking covers part
 * of a segment, it SHALL draw the marked share from the segment's own base as
 * a fraction of the segment; its text alternative SHALL name the largest and
 * smallest share of the first colour member …; and its table view SHALL add a
 * "Share of ‹category›" column.
 * `Fails when: a segment marks otherwise; a partly marked segment's share is
 * drawn from the bar's base or as a fraction of the bar; or the text
 * alternative or the share column is missing.` (How the share is drawn:
 * `charts/src/series/stack100Marking.test.ts`.) On a real dashboard tile 5
 * columns wide, as the Sales and Shipping dashboards place them.
 */
test('a 100 % stacked bar on a 5-column tile marks a segment as its tuple, shows another tile’s share, and says and lists its shares', async ({
  page,
  request,
}) => {
  const { id, title } = await mixDashboard(request);
  await page.goto(`/explore/dashboards/${id}`);
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  const mix = page.locator('[data-tile="tile-mix"]');
  const country = page.locator('[data-tile="tile-country"]');

  // Drawn on the tile at 100 %, its axis 0–100 % every 25 %.
  const ticks = () => mix.locator('svg text').allTextContents();
  await expect
    .poll(ticks)
    .toEqual(expect.arrayContaining(['0 %', '25 %', '50 %', '75 %', '100 %']));

  // Its text alternative, read with the chart.
  const said = mix.getByTestId('chart-text-alternative');
  await expect(said).toHaveText(
    /^100 % stacked bar of .+ by .+ and .+\. (Components|Instruments)’s share is largest in (completed|shipped|processing) \(\d+ %\) and smallest in (completed|shipped|processing) \(\d+ %\)\.$/,
  );
  await expect(mix.getByTestId('chart-canvas')).toHaveAttribute(
    'aria-describedby',
    (await said.getAttribute('id')) ?? '',
  );

  // A segment marks its (status, category) tuple, which the chip counts as
  // one item (a tuple across two members isn't written as one member's
  // values, `summariseMarking`); a Sum stack's click marks the category alone.
  await clickAbove(page, mix, 'shipped');
  const chip = page.getByTestId('mark-chip');
  await expect(chip).toContainText('1 item');
  await expect(chip).not.toContainText('Category:');

  // Another tile's marking, of what this one doesn't group by: its segments
  // draw the share, and its badge says whose.
  await clickAbove(page, country, 'Germany');
  await expect(chip).toContainText('Germany');
  await expect(mix.getByTestId('mark-badge')).toContainText('Germany');
  await expect(mix.getByTestId('mark-badge')).toContainText('share shown');

  // Its table view adds each row's share of its status.
  await viewAs(mix, 'table');
  const table = mix.getByTestId('data-table');
  await expect(table.getByRole('columnheader').last()).toHaveText(/^Share of /);
  const shares = await table
    .getByTestId('table-row')
    .evaluateAll((rows) => rows.map((row) => row.lastElementChild?.textContent ?? ''));
  expect(shares.length).toBeGreaterThan(0);
  expect(shares.every((share) => /^\d+\.\d%$/.test(share))).toBe(true);
});

/**
 * A dashboard of bullet charts, each on a tile 4 to 6 columns wide as the
 * Sales and Shipping dashboards place them: orders by status against a
 * target of 75; amounts against a Target measure; one with Target emptied;
 * and orders by ID, 240 members, more than a tile holds.
 */
async function bulletDashboard(request: APIRequestContext) {
  const title = `Bullets ${String(Date.now())}-${String(Math.round(Math.random() * 1e6))}`;
  const dashboard = (await (
    await request.post(`${API}/documents`, {
      data: { kind: 'dashboard', title, ...IN_MY_WORKSPACE },
    })
  ).json()) as { id: string };
  const bullet = async (
    chartTitle: string,
    measure: string,
    dimension: string,
    target: Record<string, unknown> | undefined,
  ) => {
    const chart = (await (
      await request.post(`${API}/documents`, {
        data: { kind: 'chart', title: chartTitle, ...IN_MY_WORKSPACE },
      })
    ).json()) as { id: string };
    const saved = await request.put(`${API}/documents/chart/${chart.id}`, {
      data: {
        version: 1,
        body: {
          schemaVersion: 1,
          title: chartTitle,
          owner: 'admin',
          localToDashboardId: dashboard.id,
          chart: {
            source: { cube: 'orders' },
            wells: { measures: [measure], dimensions: [dimension], timeDimensions: [] },
            chartType: 'bullet',
            ...(target === undefined ? {} : { options: { bullet: { target } } }),
          },
        },
      },
    });
    expect(saved.ok(), await saved.text()).toBe(true);
    return chart.id;
  };
  const byValue = await bullet('Orders against 75', 'orders.count', 'orders.status', {
    kind: 'value',
    value: 75,
  });
  const byMeasure = await bullet('Amount against count', 'orders.total_amount', 'orders.status', {
    kind: 'measure',
    member: 'orders.count',
  });
  const empty = await bullet('No target yet', 'orders.count', 'orders.status', undefined);
  const many = await bullet('Every order', 'orders.count', 'orders.id', {
    kind: 'value',
    value: 1,
  });
  const placed = await request.put(`${API}/documents/dashboard/${dashboard.id}`, {
    data: {
      version: 1,
      body: {
        schemaVersion: 1,
        title,
        ...IN_MY_WORKSPACE,
        owner: 'admin',
        settings: { width: 'fixed' },
        pages: [
          {
            id: 'only',
            title: 'Only',
            items: [
              { id: 'tile-value', kind: 'chart', w: 5, h: 40, chartId: byValue },
              { id: 'tile-measure', kind: 'chart', w: 6, h: 40, chartId: byMeasure },
              { id: 'tile-empty', kind: 'chart', w: 4, h: 40, chartId: empty },
              { id: 'tile-many', kind: 'chart', w: 5, h: 40, chartId: many },
            ],
          },
        ],
      },
    },
  });
  expect(placed.ok(), await placed.text()).toBe(true);
  return { id: dashboard.id, title };
}

/**
 * T954 / AC-581: THE SYSTEM SHALL draw one bullet per member on one shared
 * axis from zero, labelled "Axis starts at $0: bars are lengths": a 24 px
 * band row on a 48 px pitch, the bands in R80's three greys lightest lowest,
 * an 8 px `text-primary` value bar and a 2 × 32 px `text-primary` target; a
 * member with no target drawing its bar with "No target"; and members past
 * the tile's height scrolling with the axis fixed.
 * `Fails when: bullets have their own axes, or the axis doesn't start at
 * zero; a size or colour differs; the bands read in another lightness order;
 * a member with no target is dropped or unlabelled; or the axis scrolls away.`
 * (Sizes, colours and order: `charts/src/series/bullet.test.ts`.) And the
 * tile's empty state with Target emptied (T954, design 23 sheet 8).
 */
test('bullet charts draw on dashboard tiles 4 to 6 columns wide, against a value or a measure, say a missing target, and scroll their members with the axis fixed', async ({
  page,
  request,
}) => {
  const { id, title } = await bulletDashboard(request);
  // The Target measure is asked of Cube with the chart's own.
  const asked: string[][] = [];
  page.on('request', (sent) => {
    if (!sent.url().endsWith('/api/load') || sent.method() !== 'POST') return;
    const query = (sent.postDataJSON() as { query?: { measures?: string[] } } | null)?.query;
    if (query?.measures !== undefined) asked.push(query.measures);
  });
  await page.goto(`/explore/dashboards/${id}`);
  await expect(page.getByRole('heading', { name: title })).toBeVisible();

  const texts = (tile: string) => page.locator(`[data-tile="${tile}"] svg text`).allTextContents();
  const valueTile = page.locator('[data-tile="tile-value"]');
  // One axis from zero that says so, and every status a bullet with its figures.
  await expect.poll(() => texts('tile-value')).toContain('Axis starts at 0: bars are lengths');
  const drawn = await texts('tile-value');
  for (const status of ['completed', 'shipped', 'processing']) expect(drawn).toContain(status);
  expect(drawn.filter((text) => / of 75 · \d+ %$/.test(text))).toHaveLength(3);
  await expect(valueTile.getByTestId('chart-not-drawable')).toHaveCount(0);
  // Bands, bars and targets drawn: R80's three greys and the ink.
  for (const grey of ['#f0efec', '#e3e2de', '#c9c7c1'])
    await expect(valueTile.locator(`svg path[fill="${grey}"]`)).toHaveCount(3);

  // Against a Target measure: asked for, and every member drawn against it.
  await expect
    .poll(() => asked.some((measures) => measures.join() === 'orders.count,orders.total_amount'))
    .toBe(true);
  await expect
    .poll(async () => (await texts('tile-measure')).filter((t) => t.includes(' of ')))
    .toHaveLength(3);

  // Target emptied: what it needs, said in the tile.
  await expect(
    page.locator('[data-tile="tile-empty"]').getByTestId('bullet-no-target'),
  ).toContainText(
    'A bullet chart compares each member with a target. Put a measure or a value in Target.',
  );

  // 240 orders: the tile holds some, and the wheel scrolls the rest past a
  // value axis that stays as it was.
  const many = page.locator('[data-tile="tile-many"]');
  /** The value axis's tick labels: the lowest row of text above the axis's own name. */
  const ticks = async () => {
    const placed = await many
      .locator('svg text')
      .evaluateAll((all) =>
        all.map((text) => [text.textContent ?? '', text.getBoundingClientRect().y] as const),
      );
    const row = Math.max(
      ...placed.filter(([text]) => !text.startsWith('Axis starts')).map(([, y]) => y),
    );
    return placed.filter(([, y]) => Math.abs(y - row) < 3).map(([text]) => text);
  };
  await expect.poll(async () => (await texts('tile-many')).length).toBeGreaterThan(5);
  const before = await texts('tile-many');
  const axisBefore = await ticks();
  expect(axisBefore.length).toBeGreaterThan(1);
  expect(axisBefore[0]).toBe('0');
  const box = await many.getByTestId('chart-canvas').boundingBox();
  if (box === null) throw new Error('the bullet chart of every order is not drawn');
  // A few notches of the wheel over the bullets, as a reader scrolls.
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 3);
  for (let notch = 0; notch < 6; notch += 1) {
    await page.mouse.wheel(0, 120);
    await page.waitForTimeout(150);
  }
  await expect.poll(async () => (await texts('tile-many')).join()).not.toBe(before.join());
  expect(await ticks()).toEqual(axisBefore);
});

/**
 * T955 / AC-582: THE SYSTEM SHALL make a bullet its member: a click marks it,
 * Ctrl/⌘ toggles it, and a drag marks the bullets it touches; WHILE another
 * tile's marking covers part of a member, the value bar SHALL draw the marked
 * share from zero at full strength and fade the rest, an additive measure
 * only …; and as a cross-filter source a bullet SHALL filter the others to
 * its member.
 * `Fails when: a gesture marks otherwise; a non-additive bar draws a marked
 * share; or a bullet doesn't filter.` (The drawing and an average's hatch:
 * `charts/src/series/bulletMarking.test.ts`; the member a click or a filter
 * takes: `clickedBullet.test.ts`.) On a 5-column tile, in Markings mode.
 */
test('a bullet chart on a 5-column tile marks a bullet as its member, and splits its value bar by another tile’s marking', async ({
  page,
  request,
}) => {
  const title = `Bullet marks ${String(Date.now())}-${String(Math.round(Math.random() * 1e6))}`;
  const dashboard = (await (
    await request.post(`${API}/documents`, {
      data: { kind: 'dashboard', title, ...IN_MY_WORKSPACE },
    })
  ).json()) as { id: string };
  const chartOf = async (chart: Record<string, unknown>) => {
    const made = (await (
      await request.post(`${API}/documents`, {
        data: { kind: 'chart', title: 'chart', ...IN_MY_WORKSPACE },
      })
    ).json()) as { id: string };
    const saved = await request.put(`${API}/documents/chart/${made.id}`, {
      data: {
        version: 1,
        body: {
          schemaVersion: 1,
          title: 'chart',
          owner: 'admin',
          localToDashboardId: dashboard.id,
          chart: { source: { cube: 'orders' }, ...chart },
        },
      },
    });
    expect(saved.ok(), await saved.text()).toBe(true);
    return made.id;
  };
  // Wells beyond the member — an id and a time field — still give one bullet
  // per status, its total (checkpoint 1's review, AC-581).
  const bullet = await chartOf({
    wells: {
      measures: ['orders.count'],
      dimensions: ['orders.status', 'orders.id'],
      timeDimensions: ['orders.ordered_at'],
    },
    chartType: 'bullet',
    options: { bullet: { target: { kind: 'value', value: 75 } } },
  });
  const country = await chartOf({
    wells: { measures: ['orders.count'], dimensions: ['customers.country'], timeDimensions: [] },
    chartType: 'bar',
  });
  const placed = await request.put(`${API}/documents/dashboard/${dashboard.id}`, {
    data: {
      version: 1,
      body: {
        schemaVersion: 1,
        title,
        ...IN_MY_WORKSPACE,
        owner: 'admin',
        settings: { width: 'fixed', interactions: { mode: 'markings' } },
        markings: [{ id: 'm1', name: 'Marking', slot: 'mk1', isDefault: true }],
        pages: [
          {
            id: 'only',
            title: 'Only',
            items: [
              { id: 'tile-bullet', kind: 'chart', w: 5, h: 40, chartId: bullet },
              { id: 'tile-country', kind: 'chart', w: 7, h: 40, chartId: country },
            ],
          },
        ],
      },
    },
  });
  expect(placed.ok(), await placed.text()).toBe(true);

  await page.goto(`/explore/dashboards/${dashboard.id}`);
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  const tile = page.locator('[data-tile="tile-bullet"]');
  const ink = tile.locator('svg path[fill="#1f1f1e"]');
  // Three value bars and three targets.
  await expect(ink).toHaveCount(6);
  // Each the status's total: the 240 orders between them.
  const totals = (await tile.locator('svg text').allTextContents()).flatMap((text) => {
    const figure = /^(\d+) of 75 · \d+ %$/.exec(text)?.[1];
    return figure === undefined ? [] : [Number(figure)];
  });
  expect(totals).toHaveLength(3);
  expect(totals.reduce((sum, one) => sum + one, 0)).toBe(240);

  // A click on shipped's value bar, beside its label, marks shipped.
  const name = tile.locator('svg text', { hasText: /^shipped$/ });
  await expect(name).toBeVisible();
  const label = await name.boundingBox();
  const plot = await tile.getByTestId('chart-canvas').boundingBox();
  if (label === null || plot === null) throw new Error('the bullet chart is not drawn');
  // The value bar runs from zero, just right of the labels' column, centred on its row.
  await page.mouse.click(label.x + label.width + 40, label.y + label.height + 2);
  const chip = page.getByTestId('mark-chip');
  await expect(chip).toContainText('shipped');

  /** Where a status's value bar starts, on its row. */
  const rowOf = async (status: string) => {
    const text = tile.locator('svg text', { hasText: new RegExp(`^${status}$`) });
    await expect(text).toBeVisible();
    const box = await text.boundingBox();
    if (box === null) throw new Error(`${status} is not drawn`);
    return { x: box.x + box.width + 40, y: box.y + box.height + 2 };
  };
  // Ctrl/⌘ adds a bullet, and takes it off again (checkpoint 1's review).
  const completed = await rowOf('completed');
  await page.keyboard.down('ControlOrMeta');
  await page.mouse.click(completed.x, completed.y);
  await page.keyboard.up('ControlOrMeta');
  await expect(chip).toContainText('completed');
  await expect(chip).toContainText('shipped');
  await page.keyboard.down('ControlOrMeta');
  await page.mouse.click(completed.x, completed.y);
  await page.keyboard.up('ControlOrMeta');
  await expect(chip).not.toContainText('completed');
  await expect(chip).toContainText('shipped');

  // A drag along processing's row, past its target to the plot's edge,
  // marks processing alone: a target is its member, never "75".
  const processing = await rowOf('processing');
  await page.mouse.move(processing.x - 20, processing.y - 6);
  await page.mouse.down();
  await page.mouse.move(processing.x + 60, processing.y + 6, { steps: 4 });
  await page.mouse.move(plot.x + plot.width - 4, processing.y + 6, { steps: 4 });
  await page.mouse.up();
  await expect(chip).toContainText('processing');
  await expect(chip).not.toContainText('shipped');
  await expect(chip).not.toContainText('75');

  // Germany's orders, marked on the other tile: each bullet's value bar is
  // split into its marked part from zero and the rest.
  await clickAbove(page, page.locator('[data-tile="tile-country"]'), 'Germany');
  await expect(chip).toContainText('Germany');
  await expect.poll(() => ink.count()).toBeGreaterThan(6);

  // In cross-filter mode a bullet filters the other tile to its member
  // (checkpoint 1's review: AC-582's cross-filter, on the running app).
  const stored = (await (
    await request.get(`${API}/documents/dashboard/${dashboard.id}`)
  ).json()) as { version: number; body: { settings: Record<string, unknown> } };
  const crossFiltering = await request.put(`${API}/documents/dashboard/${dashboard.id}`, {
    data: {
      version: stored.version,
      body: {
        ...stored.body,
        settings: {
          ...stored.body.settings,
          interactions: { mode: 'crossFilter', crossFilter: { defaultAction: 'filter' } },
        },
      },
    },
  });
  expect(crossFiltering.ok(), await crossFiltering.text()).toBe(true);
  const asked: unknown[] = [];
  page.on('request', (sent) => {
    if (!sent.url().endsWith('/api/load') || sent.method() !== 'POST') return;
    asked.push((sent.postDataJSON() as { query?: unknown } | null)?.query);
  });
  await page.reload();
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  await expect(ink).toHaveCount(6);
  const shippedRow = await rowOf('shipped');
  await page.mouse.click(shippedRow.x, shippedRow.y);
  await expect(page.getByTestId('cross-filter-chip')).toContainText('shipped');
  // The country tile asked again, filtered to shipped.
  await expect
    .poll(() =>
      asked.some((query) => {
        const text = JSON.stringify(query);
        return text.includes('customers.country') && text.includes('"shipped"');
      }),
    )
    .toBe(true);
});

/**
 * T956 / AC-583: THE SYSTEM SHALL name each bullet "‹member›: ‹value› of
 * ‹target› target (‹p› %), in the ‹band› band", the chart "‹n› regions; ‹k›
 * above target (‹members›).", and give a table view of member, value,
 * target, percentage of target and band.
 * `Fails when: a bullet's name or the chart's summary lacks a part, or the
 * table lacks a column.` (Every part: `charts/src/describe/bullet.test.ts`,
 * `web/src/tiles/tableView/bullet.test.tsx`.) On a 5-column dashboard tile.
 */
test('a bullet chart’s tile names the chart and each bullet, and its table view lists target, share and band', async ({
  page,
  request,
}) => {
  const { id, title } = await bulletDashboard(request);
  await page.goto(`/explore/dashboards/${id}`);
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  const tile = page.locator('[data-tile="tile-value"]');

  // Orders by status against 75: the chart summed up, then each bullet.
  const said = tile.getByTestId('chart-text-alternative');
  await expect(said).toHaveText(
    /^3 orders statuses; (none|\d) above target.*\. (completed|shipped|processing): \d+ of 75 target \(\d+ %\), in the [^.]+ band\./,
  );
  await expect(tile.getByTestId('chart-canvas')).toHaveAttribute(
    'aria-describedby',
    (await said.getAttribute('id')) ?? '',
  );

  await viewAs(tile, 'table');
  const table = tile.getByTestId('data-table');
  await expect(table.getByRole('columnheader')).toHaveText([
    'Orders Status',
    'Orders Count',
    'Target',
    '% of target',
    'Band',
  ]);
  await expect(table.getByTestId('table-row')).toHaveCount(3);
  for (const cells of await table
    .getByTestId('table-row')
    .evaluateAll((rows) =>
      rows.map((row) => [...row.querySelectorAll('td')].map((cell) => cell.textContent ?? '')),
    )) {
    expect(cells[2]).toBe('75');
    expect(cells[3]).toMatch(/^\d+%$/);
    expect(cells[4]).toMatch(/ %$/);
  }
});

/** A dashboard of KPIs, each its own settings, on tiles 4 to 6 columns wide. */
async function kpiDashboard(
  request: APIRequestContext,
  kpis: readonly {
    readonly tile: string;
    readonly w: number;
    readonly measure: string;
    readonly kpi: Record<string, unknown>;
    readonly h?: number;
  }[],
) {
  const title = `KPIs ${String(Date.now())}-${String(Math.round(Math.random() * 1e6))}`;
  const dashboard = (await (
    await request.post(`${API}/documents`, {
      data: { kind: 'dashboard', title, ...IN_MY_WORKSPACE },
    })
  ).json()) as { id: string };
  const items = [];
  for (const { tile, w, measure, kpi, h = 32 } of kpis) {
    const chart = (await (
      await request.post(`${API}/documents`, {
        data: { kind: 'chart', title: tile, ...IN_MY_WORKSPACE },
      })
    ).json()) as { id: string };
    const saved = await request.put(`${API}/documents/chart/${chart.id}`, {
      data: {
        version: 1,
        body: {
          schemaVersion: 1,
          title: tile,
          owner: 'admin',
          localToDashboardId: dashboard.id,
          chart: {
            source: { cube: 'orders' },
            wells: { measures: [measure], dimensions: [], timeDimensions: [] },
            chartType: 'kpi',
            options: { kpi },
          },
        },
      },
    });
    expect(saved.ok(), await saved.text()).toBe(true);
    // 32 rows by default: tall enough for value, change, trend and target.
    items.push({ id: tile, kind: 'chart', w, h, chartId: chart.id });
  }
  const placed = await request.put(`${API}/documents/dashboard/${dashboard.id}`, {
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
  expect(placed.ok(), await placed.text()).toBe(true);
  return { id: dashboard.id, title };
}

/**
 * T937 / AC-565: WHEN a KPI has Compare to, Target or Time set, THE SYSTEM
 * SHALL draw its value in `text-kpi-solo` (40/52) alone …; its change as
 * R80's Change element, ▲ or ▼ following the value's direction, a sign and
 * the percentage, coloured by Direction (`status-success` when good,
 * `status-error` when bad, `text-secondary` when Neutral), then "vs
 * ‹period› (‹value›)" in `text-xs` `text-secondary`, the comparison coming
 * from Cube's `compareDateRange` for Previous period and Same period last
 * year.
 * `Fails when: … the glyph follows Direction rather than the value, or the
 * colour follows the value rather than Direction; or the comparison is
 * computed other than by compareDateRange …`
 *
 * On a fixed clock, 20 August 2026, as the sample orders end in August:
 * 29 orders for $50,605 in August against 31 for $47,120 in July.
 */
test('KPIs on 4- to 6-column tiles compare this month with the last through compareDateRange, and with a value, coloured by Direction', async ({
  page,
  request,
}) => {
  const time = { member: 'orders.ordered_at', granularity: 'month' };
  const { id, title } = await kpiDashboard(request, [
    {
      tile: 'kpi-count',
      w: 4,
      measure: 'orders.count',
      kpi: { compareTo: { kind: 'previousPeriod' }, time },
    },
    {
      tile: 'kpi-amount',
      w: 5,
      measure: 'orders.total_amount',
      kpi: { compareTo: { kind: 'previousPeriod' }, time, direction: 'lower' },
    },
    {
      tile: 'kpi-value',
      w: 6,
      measure: 'orders.count',
      kpi: { compareTo: { kind: 'value', value: 25 }, time, direction: 'neutral' },
    },
  ]);
  const compared: unknown[] = [];
  page.on('request', (sent) => {
    if (!sent.url().endsWith('/api/load') || sent.method() !== 'POST') return;
    const query = (sent.postDataJSON() as { query?: { timeDimensions?: unknown[] } } | null)?.query;
    for (const entry of query?.timeDimensions ?? [])
      if (typeof entry === 'object' && entry !== null && 'compareDateRange' in entry)
        compared.push((entry as { compareDateRange: unknown }).compareDateRange);
  });
  await page.clock.setFixedTime(new Date('2026-08-20T12:00:00Z'));
  await page.goto(`/explore/dashboards/${id}`);
  await expect(page.getByRole('heading', { name: title })).toBeVisible();

  const count = page.locator('[data-tile="kpi-count"]');
  await expect(count.getByTestId('kpi-value')).toHaveText('29');
  await expect(count.getByTestId('kpi-period')).toHaveText('Aug 2026');
  const countChange = count.getByTestId('kpi-change');
  await expect(countChange).toHaveText('▼ −6.5% vs Jul 2026 (31)');
  // Fewer orders, Higher is better: bad, in status-error.
  await expect(countChange.locator('.text-change')).toHaveAttribute('data-tone', 'error');
  // Alone, with a setting of R81's: text-kpi-solo, 40/52.
  await expect(count.getByTestId('kpi-value')).toHaveCSS('font-size', '40px');
  await expect(count.getByTestId('kpi-value')).toHaveCSS('line-height', '52px');
  // "vs …" in text-xs, text-secondary.
  await expect(countChange).toHaveCSS('font-size', '12px');
  const secondary = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--wc-text-secondary').trim(),
  );
  const vsColour = await countChange
    .locator('.kpi__vs')
    .evaluate((element) => getComputedStyle(element).color);
  const probe = await page.evaluate((colour) => {
    const span = document.createElement('span');
    span.style.color = colour;
    document.body.append(span);
    const read = getComputedStyle(span).color;
    span.remove();
    return read;
  }, secondary);
  expect(vsColour).toBe(probe);

  // More spent, Lower is better: ▲ for the value, status-error for Direction.
  const amount = page.locator('[data-tile="kpi-amount"]').getByTestId('kpi-change');
  await expect(amount).toHaveText(/^▲ \+7\.4% vs Jul 2026 \(\$?47\.1K\) · lower is better$/);
  await expect(amount.locator('.text-change')).toHaveAttribute('data-tone', 'error');

  // Against a value, Neutral: text-secondary whichever way it went.
  const value = page.locator('[data-tile="kpi-value"]').getByTestId('kpi-change');
  await expect(value).toHaveText('▲ +16.0% vs 25');
  await expect(value.locator('.text-change')).toHaveAttribute('data-tone', 'neutral');

  // Asked of Cube as compareDateRange: August, then July.
  expect(compared).toContainEqual([
    ['2026-08-01', '2026-08-31'],
    ['2026-07-01', '2026-07-31'],
  ]);
});

/**
 * T938 / AC-565: … its trend as R80's sparkline at the tile's content width
 * × 32 px over Time at its granularity; and its target as R80's bullet graph
 * at the content width × 16 px with "‹p›% of ‹target›".
 * `Fails when: … the sparkline isn't 32 px tall or isn't R80's; the target
 * line lacks its percentage …`
 *
 * On a fixed clock of 20 August 2026: the last 12 months to August, of which
 * the sample orders fill January to August; 29 orders in August against a
 * target of 30.
 */
test('KPIs on 4- to 6-column tiles draw their trend at the content width × 32 and their target × 16 with its share', async ({
  page,
  request,
}) => {
  const time = { member: 'orders.ordered_at', granularity: 'month' };
  const kpi = { compareTo: { kind: 'previousPeriod' }, time, target: { kind: 'value', value: 30 } };
  const { id, title } = await kpiDashboard(
    request,
    [4, 5, 6].map((w) => ({ tile: `kpi-${String(w)}`, w, measure: 'orders.count', kpi })),
  );
  const trends: unknown[] = [];
  page.on('request', (sent) => {
    if (!sent.url().endsWith('/api/load') || sent.method() !== 'POST') return;
    const query = (sent.postDataJSON() as { query?: { timeDimensions?: unknown[] } } | null)?.query;
    for (const entry of query?.timeDimensions ?? [])
      if (typeof entry === 'object' && entry !== null && 'granularity' in entry) trends.push(entry);
  });
  await page.clock.setFixedTime(new Date('2026-08-20T12:00:00Z'));
  await page.goto(`/explore/dashboards/${id}`);
  await expect(page.getByRole('heading', { name: title })).toBeVisible();

  for (const w of [4, 5, 6]) {
    const tile = page.locator(`[data-tile="kpi-${String(w)}"]`);
    const content = await tile.getByTestId('kpi').evaluate((element) => element.clientWidth);
    // The trend: R80's sparkline, the content width × 32, its words R80's,
    // the measure named as the KPI names it, by its short title.
    const sparkline = tile.getByTestId('kpi-trend').locator('svg.text-sparkline');
    await expect(sparkline).toHaveAttribute('height', '32');
    await expect(sparkline).toHaveAttribute('width', String(Math.round(content)));
    await expect(sparkline).toHaveAttribute('role', 'img');
    await expect(sparkline).toHaveAttribute(
      'aria-label',
      /^Count by month, last 12 months: from \d+ to 29, low \d+, high \d+$/,
    );
    // The target: R80's bullet graph, 16 px tall, and its share in words.
    const target = tile.getByTestId('kpi-target');
    await expect(target.locator('svg.text-bullet')).toHaveAttribute('height', '16');
    await expect(target.locator('.kpi__target-of')).toHaveText('97% of 30');
    // Both inside the tile, nothing cut.
    const tileBox = await tile.boundingBox();
    const targetBox = await target.boundingBox();
    if (tileBox === null || targetBox === null) throw new Error('the KPI is not drawn');
    expect(targetBox.x + targetBox.width).toBeLessThanOrEqual(tileBox.x + tileBox.width);
    expect(targetBox.y + targetBox.height).toBeLessThanOrEqual(tileBox.y + tileBox.height);
  }
  // The trend asked of Cube: Ordered at by month, September 2025 to August 2026.
  expect(trends).toContainEqual({
    dimension: 'orders.ordered_at',
    granularity: 'month',
    dateRange: ['2025-09-01', '2026-08-31'],
  });
});

/**
 * T938 follow-up (the coordinator, 2026-10-18; decision T938-2): a KPI on a
 * tile too short for all its parts clips none. At its usual 24 rows the
 * target gives way; at 16 the trend too; each still said, visually hidden.
 */
test('a KPI on a 24-row tile drops its target, and on a 16-row tile its trend too, clipping nothing', async ({
  page,
  request,
}) => {
  const time = { member: 'orders.ordered_at', granularity: 'month' };
  const kpi = { compareTo: { kind: 'previousPeriod' }, time, target: { kind: 'value', value: 30 } };
  const { id, title } = await kpiDashboard(request, [
    { tile: 'kpi-24', w: 4, h: 24, measure: 'orders.count', kpi },
    { tile: 'kpi-16', w: 4, h: 16, measure: 'orders.count', kpi },
  ]);
  await page.clock.setFixedTime(new Date('2026-08-20T12:00:00Z'));
  await page.goto(`/explore/dashboards/${id}`);
  await expect(page.getByRole('heading', { name: title })).toBeVisible();

  /** Whether every part of the KPI drawn ends inside its tile. */
  const unclipped = (tile: string) =>
    page.locator(`[data-tile="${tile}"]`).evaluate((element) => {
      const bottom = element.getBoundingClientRect().bottom;
      return [
        ...element.querySelectorAll('.kpi__core, .kpi__trend, .kpi__target, .kpi__change'),
      ].every((part) => part.getBoundingClientRect().bottom <= bottom + 0.5);
    });

  const at24 = page.locator('[data-tile="kpi-24"]');
  await expect(at24.getByTestId('kpi-change')).toHaveText('▼ −6.5% vs Jul 2026 (31)');
  await expect(at24.getByTestId('kpi-trend').locator('svg')).toHaveAttribute('height', '32');
  await expect(at24.getByTestId('kpi-target')).toHaveCount(0);
  await expect(at24.getByTestId('kpi-target-hidden')).toHaveText(
    'Not shown at this size: 97% of 30 target.',
  );
  expect(await unclipped('kpi-24')).toBe(true);

  const at16 = page.locator('[data-tile="kpi-16"]');
  await expect(at16.getByTestId('kpi-value')).toHaveText('29');
  await expect(at16.getByTestId('kpi-trend')).toHaveCount(0);
  await expect(at16.getByTestId('kpi-target')).toHaveCount(0);
  await expect(at16.getByTestId('kpi-trend-hidden').locator('svg[role="img"]')).toHaveAttribute(
    'aria-label',
    /^Count by month, last 12 months: /,
  );
  expect(await unclipped('kpi-16')).toBe(true);
});

/**
 * T940 / AC-567: WHILE a KPI has Tile by set, THE SYSTEM SHALL draw one tile
 * per member, 8 px apart, each with its own value, change, sparkline and
 * target, as a list whose items are named "‹member›: ‹value›, ‹up or down›
 * ‹change› vs ‹comparison›, ‹p›% of ‹target›"; order them by value, highest
 * first, unless the author orders them in Customize; and past 20 tiles, page
 * them with "Tiles 1–20 of ‹n›" and ‹ › buttons.
 * `Fails when: tiles share one value, aren't a list, or lack their names;
 * the order isn't by value without a custom order; or more than 20 show at
 * once.`
 * And AC-565's value in `text-kpi` (32/40) when tiled.
 */
test('a KPI tiled by status draws a named tile per member by value, and one tiled by order pages past 20', async ({
  page,
  request,
}) => {
  const time = { member: 'orders.ordered_at', granularity: 'month' };
  const kpi = {
    compareTo: { kind: 'previousPeriod' },
    time,
    target: { kind: 'value', value: 10 },
  };
  const { id, title } = await kpiDashboard(request, [
    {
      tile: 'kpi-status',
      w: 6,
      h: 40,
      measure: 'orders.count',
      kpi: { ...kpi, tileBy: 'orders.status' },
    },
    {
      tile: 'kpi-orders',
      w: 5,
      h: 40,
      measure: 'orders.total_amount',
      kpi: { time, tileBy: 'orders.id' },
    },
  ]);
  await page.clock.setFixedTime(new Date('2026-08-20T12:00:00Z'));
  await page.goto(`/explore/dashboards/${id}`);
  await expect(page.getByRole('heading', { name: title })).toBeVisible();

  const status = page.locator('[data-tile="kpi-status"]');
  const list = status.getByRole('list', { name: 'Count by Status' });
  const items = list.getByRole('listitem');
  await expect(items).toHaveCount(3);
  const names = await items.evaluateAll((all) => all.map((one) => one.getAttribute('aria-label')));
  for (const name of names)
    expect(name).toMatch(
      /^(completed|shipped|processing): \d+, (?:(?:up|down) [\d.]+%|unchanged|no data) vs Jul 2026, \d+% of 10$/,
    );
  // Highest first, each its own value.
  const values = names.map((name) => Number(/: (\d+),/.exec(name ?? '')?.[1]));
  expect(values).toEqual([...values].sort((a, b) => b - a));
  expect(values.reduce((sum, one) => sum + one, 0)).toBe(29);
  // Each its own change, trend and target; its value in text-kpi, 32/40.
  for (const part of ['kpi-change', 'kpi-trend', 'kpi-target'])
    await expect(items.first().getByTestId(part)).toHaveCount(1);
  const value = items.first().getByTestId('kpi-tile-value');
  await expect(value).toHaveCSS('font-size', '32px');
  await expect(value).toHaveCSS('line-height', '40px');
  // 8 px apart.
  await expect(list).toHaveCSS('column-gap', '8px');
  await expect(list).toHaveCSS('row-gap', '8px');

  // Each tile's trend and target within the tile.
  for (const item of await items.all()) {
    const inside = await item.evaluate((element) => {
      const right = element.getBoundingClientRect().right;
      return [...element.querySelectorAll('svg')].every(
        (svg) => svg.getBoundingClientRect().right <= right + 0.5,
      );
    });
    expect(inside).toBe(true);
  }
  // 29 orders in August: 20 on the first page, the rest on the next.
  const orders = page.locator('[data-tile="kpi-orders"]');
  await expect(orders.getByRole('listitem')).toHaveCount(20);
  await expect(orders.getByTestId('kpi-tiles-page')).toHaveText('Tiles 1–20 of 29');
  await orders.getByRole('button', { name: 'Next tiles' }).click();
  await expect(orders.getByRole('listitem')).toHaveCount(9);
  await expect(orders.getByTestId('kpi-tiles-page')).toHaveText('Tiles 21–29 of 29');
});

/**
 * T939 / AC-566: IF a KPI's Compare to is Previous period or Same period last
 * year and Time is empty, THEN THE SYSTEM SHALL say "Compare to: ‹choice›
 * needs a time dimension in Time." with the Time well as its action; and IF
 * the compared period has no data, THEN the change line SHALL read "— vs
 * ‹period› · No data for the comparison period".
 * `Fails when: a period comparison without Time draws a change, or says
 * nothing; or a period with no data reads as 0 % or as a change.`
 *
 * The sample orders start in January 2026, so on a fixed clock of 20 January
 * December 2025 has none.
 */
test('a KPI says a period comparison needs Time, its + Time reaching the well, and a compared period with no data says so', async ({
  page,
  request,
}) => {
  const { id, title } = await kpiDashboard(request, [
    {
      tile: 'kpi-no-data',
      w: 4,
      measure: 'orders.count',
      kpi: {
        compareTo: { kind: 'previousPeriod' },
        time: { member: 'orders.ordered_at', granularity: 'month' },
      },
    },
    {
      tile: 'kpi-no-time',
      w: 5,
      measure: 'orders.count',
      kpi: { compareTo: { kind: 'samePeriodLastYear' } },
    },
  ]);
  await page.clock.setFixedTime(new Date('2026-01-20T12:00:00Z'));
  await page.goto(`/explore/dashboards/${id}`);
  await expect(page.getByRole('heading', { name: title })).toBeVisible();

  const noData = page.locator('[data-tile="kpi-no-data"]');
  await expect(noData.getByTestId('kpi-period')).toHaveText('Jan 2026');
  await expect(noData.getByTestId('kpi-change')).toHaveText(
    '— vs Dec 2025 · No data for the comparison period',
  );
  await expect(page.locator('[data-tile="kpi-no-time"]').getByTestId('kpi-needs-time')).toHaveText(
    /^Compare to: Same period last year needs a time dimension in Time\./,
  );
  await expect(page.locator('[data-tile="kpi-no-time"]').getByTestId('kpi-change')).toHaveCount(0);

  // In the editor, + Time takes the author to the Time well.
  await newInMyWorkspace(page, 'Chart', 'seed-folder-0');
  await cubePicker(page).selectOption({ label: 'Orders' });
  await expect(page.getByTestId('member-orders.count')).toBeVisible();
  await wellPicker(page, 'measures').selectOption('orders.count');
  await chooseChartType(page, 'kpi');
  await page
    .getByRole('combobox', { name: 'Compare to', exact: true })
    .selectOption('previousPeriod');
  const result = page.getByTestId('editor-result');
  await expect(result.getByTestId('kpi-needs-time')).toContainText(
    'Compare to: Previous period needs a time dimension in Time.',
  );
  await result.getByRole('button', { name: '+ Time' }).click();
  await expect(page.getByTestId('well-kpi-time').locator('select').first()).toBeFocused();
});
