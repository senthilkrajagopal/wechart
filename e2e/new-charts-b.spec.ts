import { expect, test, type APIRequestContext } from '@playwright/test';

import { chooseChartType, expectChartType } from './chartType';
import { cubePicker } from './cubePicker';
import { wellPicker } from './wells';
import { IN_MY_WORKSPACE, newInMyWorkspace } from './workspace';

const API = 'http://localhost:4100';

/**
 * Lane CHARTS-B's types, on the running app (docs/tasks.md §P2.27; T1014
 * gathers them on one dashboard).
 *
 * T981, T982 / AC-597: WHEN parallel coordinates are edited, THE SYSTEM SHALL
 * take Line by (one dimension), Metrics (3 or more, one axis each, in order),
 * Colour (an optional dimension) and Scale, … Shared enabled only while every
 * measure has one format and otherwise disabled with the reason; and with
 * fewer than 3 measures SHALL say "Parallel coordinates need at least 3
 * measures; there are ‹n›. Add a measure, or use Scatter." with + Measure.
 * `Fails when: a well or option is missing; Shared can be chosen for
 * measures of different formats; or fewer than 3 measures draw lines.`
 * AC-598: one 1.5 px line per member, … the scale warning under the chart,
 * as text.
 *
 * The real editor, against the seeded Cube: Orders' Count is a plain number
 * and its Total and Average amounts are currency.
 */
test('parallel coordinates take their wells, refuse Shared across formats, and draw lines from 3 measures', async ({
  page,
}) => {
  await newInMyWorkspace(page, 'Chart', 'seed-folder-0');
  await expect(page).toHaveURL(/\/explore\/charts\/[^/]+\/edit\?new=true$/);
  await cubePicker(page).selectOption({ label: 'Orders' });
  await expect(page.getByTestId('member-orders.count')).toBeVisible();
  await wellPicker(page, 'measures').selectOption('orders.count');
  await wellPicker(page, 'measures').selectOption('orders.total_amount');
  await wellPicker(page, 'dimensions').selectOption('orders.status');
  await chooseChartType(page, 'parallel');
  await expectChartType(page, 'parallel');

  // Its wells after Metrics, as the chart reads its fields.
  const labels = (await page.locator('.wells .well-field__label').allTextContents()).map((label) =>
    label.trim(),
  );
  expect(labels).toEqual(expect.arrayContaining(['Line by', 'Colour', 'Axes', 'Scale']));
  await expect(page.getByTestId('parallel-lineBy')).toHaveText('Orders Status');

  // Two measures: said in the wells, with + Measure, and in the chart's
  // place, as the editor says any type's missing fields (AC-033) — and no
  // line drawn.
  await expect(page.getByTestId('parallel-too-few')).toHaveText(
    'Parallel coordinates need at least 3 measures; there are 2. Add a measure, or use Scatter.',
  );
  await expect(page.getByTestId('missing-fields')).toContainText(
    'Parallel coordinates needs 3 measures in Metrics; add 1 more.',
  );
  const result = page.getByTestId('editor-result');
  await expect(result.locator('svg polyline, svg path[stroke-width="1.5"]')).toHaveCount(0);
  const canvas = result.getByTestId('chart-canvas');

  // Count is a plain number and Total amount currency: Shared is refused,
  // with the reason the editor's formats give it.
  const shared = page.getByRole('radio', { name: 'Shared' });
  await expect(page.getByRole('radio', { name: 'Each axis, min to max' })).toBeChecked();
  await expect(shared).toBeDisabled();
  await expect(
    page.getByText(/^Shared needs every measure in one format; these are in /),
  ).toHaveText(
    'Shared needs every measure in one format; these are in plain numbers and currency.',
  );

  // + Measure adds to Metrics, through the editor's own wells.
  await page.getByTestId('add-parallelMeasure').click();
  await page.getByTestId('pick-orders.average_amount').click();
  await expect(page.getByTestId('parallel-axes')).toHaveText(
    'Orders Count → Orders Total Amount → Orders Average Amount',
  );
  await expect(page.getByTestId('parallel-too-few')).toHaveCount(0);
  await expect(page.getByTestId('missing-fields')).toHaveCount(0);

  // One 1.5 px line per status across three axes, and the scale warning as text.
  // In the page, zrender draws each line as a path of 1.5 px through the
  // three axes (the SSR string draws it as a polyline).
  const lines = canvas.locator('svg path[stroke-width="1.5"][fill="none"]');
  await expect.poll(() => lines.count()).toBeGreaterThanOrEqual(3);
  for (const d of await lines.evaluateAll((all) => all.map((one) => one.getAttribute('d') ?? '')))
    expect(d.match(/L/g), d).toHaveLength(2);
  // Each axis titled by its short title, as the chart is one cube's (AC-220),
  // and every title, maximum and minimum drawn inside the chart (the
  // coordinator's fix: the first title was cut at the tile's left edge).
  const texts = canvas.locator('svg text');
  const titles = await texts.allTextContents();
  expect(titles).toEqual(expect.arrayContaining(['Count', 'Total Amount', 'Average Amount']));
  const outside = await canvas
    .locator('svg')
    .first()
    .evaluate((svg) => {
      const box = svg.getBoundingClientRect();
      return [...svg.querySelectorAll('text')]
        .filter((text) => (text.textContent ?? '') !== '')
        .filter((text) => {
          const own = text.getBoundingClientRect();
          return own.left < box.left - 0.5 || own.right > box.right + 0.5;
        })
        .map((text) => text.textContent);
    });
  expect(outside).toEqual([]);

  // Three lines, so each is named at its right end, beside the last axis
  // (the user, 2026-10-18, "Label line ends"; AC-598): inside the chart, as
  // just checked, and each right of every line.
  expect(titles).toEqual(expect.arrayContaining(['completed', 'processing', 'shipped']));
  const named = await canvas
    .locator('svg')
    .first()
    .evaluate((svg) => {
      const lineRight = Math.max(
        ...[...svg.querySelectorAll('path[stroke-width="1.5"][fill="none"]')].map(
          (line) => line.getBoundingClientRect().right,
        ),
      );
      return [...svg.querySelectorAll('text')]
        .filter((text) => ['completed', 'processing', 'shipped'].includes(text.textContent ?? ''))
        .map((text) => text.getBoundingClientRect().left > lineRight);
    });
  expect(named).toEqual([true, true, true]);
  await expect(page.getByTestId('parallel-scale-warning')).toHaveText(
    "Each axis runs from its own minimum to its maximum. Don't compare a line's height on one axis with its height on another.",
  );
  await expect(shared).toBeDisabled();

  // Every metric has an axis of its own, so none is called undrawn, though
  // their formats differ (the coordinator's fix: three of four axes were
  // "not drawn", with Remove).
  await expect(page.getByTestId('undrawn-metrics')).toHaveCount(0);
  await expect(page.locator('.wells .pill__off')).toHaveCount(0);
});

/**
 * T986 / AC-610, AC-037: WHEN a Sankey is edited, THE SYSTEM SHALL take
 * Steps, 2–4 dimensions in order, one summed measure, and Customize › Colour
 * links by, Source or Target; query every step's dimension in one grouped
 * Cube request …; and with one step SHALL say "A Sankey shows flows between
 * steps. Add a second dimension to Steps." with + Step.
 * `Fails when: a fifth step or an unsummed measure is accepted; more than one
 * Cube request is made; …; or one step draws without the sentence.`
 * AC-037: the spec saved and reopened is the same. (A fifth step is refused
 * in the wells' own test: Orders has two plain dimensions.)
 */
test('a Sankey takes its steps in order, one summed measure and Colour links by, in one grouped query', async ({
  page,
  request,
}) => {
  await newInMyWorkspace(page, 'Chart', 'seed-folder-0');
  await expect(page).toHaveURL(/\/explore\/charts\/[^/]+\/edit\?new=true$/);
  const id = /\/explore\/charts\/([^/]+)\/edit/.exec(page.url())?.[1] ?? '';
  await cubePicker(page).selectOption({ label: 'Orders' });
  await expect(page.getByTestId('member-orders.count')).toBeVisible();
  await wellPicker(page, 'measures').selectOption('orders.average_amount');
  await wellPicker(page, 'dimensions').selectOption('orders.status');
  await chooseChartType(page, 'sankey');
  await expectChartType(page, 'sankey');

  // One step: the sentence, with + Step; an average measure is refused first.
  const refusal = page.getByTestId('sankey-refusal');
  await expect(refusal).toHaveText(
    'A Sankey’s flows add up, so its measure must be a sum or a count; Orders Average Amount is an average.',
  );
  await page.getByRole('button', { name: 'Remove Average Amount from Metrics' }).click();
  await wellPicker(page, 'measures').selectOption('orders.total_amount');
  await expect(refusal).toHaveText(
    'A Sankey shows flows between steps. Add a second dimension to Steps.',
  );

  // + Step adds the next step to Dimensions: one grouped query of both.
  const asked: Record<string, unknown>[] = [];
  page.on('request', (sent) => {
    if (sent.url().endsWith('/api/load') && sent.method() === 'POST')
      asked.push((sent.postDataJSON() as { query: Record<string, unknown> }).query);
  });
  await page.getByTestId('add-sankeyStep').click();
  await page.getByTestId('pick-orders.id').click();
  await expect(page.getByTestId('sankey-steps')).toHaveText('Orders Status → Orders ID');
  await expect(refusal).toHaveCount(0);
  await expect.poll(() => asked.length).toBeGreaterThan(0);
  await expect(page.getByTestId('result-row-count')).toBeVisible();
  expect(asked).toHaveLength(1);
  expect(asked[0]).toMatchObject({
    measures: ['orders.total_amount'],
    dimensions: ['orders.id', 'orders.status'],
  });

  // Customize › Colour links by: Source by default, or Target.
  await page.getByRole('tab', { name: 'Customize' }).click();
  const colour = page.getByRole('radiogroup', { name: 'Colour links by' });
  await expect(colour.getByRole('radio')).toHaveCount(2);
  await expect(colour.getByRole('radio', { name: 'Source' })).toBeChecked();
  await colour.getByRole('radio', { name: 'Target' }).check();

  // Saved and reopened, the same (AC-037).
  await page.getByTestId('editor-bar').getByRole('button', { name: 'Save chart' }).click();
  await expect(page).toHaveURL(new RegExp(`/explore/charts/${id}$`));
  const stored = (await (
    await request.get(`http://localhost:4100/api/documents/chart/${id}`)
  ).json()) as {
    body: {
      chart: {
        chartType?: string;
        wells: { dimensions: string[]; measures: string[] };
        options?: Record<string, unknown>;
      };
    };
  };
  expect(stored.body.chart.chartType).toBe('sankey');
  expect(stored.body.chart.wells.dimensions).toEqual(['orders.status', 'orders.id']);
  expect(stored.body.chart.options?.['sankey']).toEqual({ colourLinksBy: 'target' });
  await page.goto(`/explore/charts/${id}/edit`);
  await expectChartType(page, 'sankey');
  await expect(page.getByTestId('sankey-steps')).toHaveText('Orders Status → Orders ID');
  await page.getByRole('tab', { name: 'Customize' }).click();
  await expect(
    page
      .getByRole('radiogroup', { name: 'Colour links by' })
      .getByRole('radio', { name: 'Target' }),
  ).toBeChecked();
});

/** A saved Sankey of order amounts through these steps, in My workspace. */
async function sankeyChart(request: APIRequestContext, steps: readonly string[]): Promise<string> {
  const created = await request.post(`${API}/api/documents`, {
    data: { kind: 'chart', title: `Sankey ${String(Date.now())}`, ...IN_MY_WORKSPACE },
  });
  expect(created.status()).toBe(201);
  const { id } = (await created.json()) as { id: string };
  const stored = (await (await request.get(`${API}/api/documents/chart/${id}`)).json()) as {
    version: number;
    body: Record<string, unknown>;
  };
  const saved = await request.put(`${API}/api/documents/chart/${id}`, {
    data: {
      version: stored.version,
      body: {
        ...stored.body,
        chart: {
          source: { cube: 'orders' },
          wells: { measures: ['orders.total_amount'], dimensions: steps, timeDimensions: [] },
          chartType: 'sankey',
        },
      },
    },
  });
  expect(saved.ok(), await saved.text()).toBe(true);
  return id;
}

/**
 * T987 / AC-611: THE SYSTEM SHALL draw a Sankey's nodes 12 px wide, the
 * colouring step's nodes in their members' colours and the other steps' in
 * `text-secondary`; links in that colour at 0.4 …; labels outside the nodes
 * with their totals; … and past 50 flows, each step keeping the members that
 * carry its top 50 flows and folding the rest into "Other", saying "‹n›
 * flows: …". `Fails when: a size, colour or opacity differs; … or more than
 * 50 flows draw, or the fold isn't said.`
 *
 * The real surface: the chart's page, against the seeded Cube.
 */
test('a Sankey draws its steps’ nodes 12 px wide and its flows at 0.4, folding past 50 flows and saying so', async ({
  page,
  request,
}) => {
  const id = await sankeyChart(request, ['orders.status', 'products.category']);
  await page.goto(`/explore/charts/${id}`);
  const chart = page.locator('svg').filter({ has: page.locator('path[fill-opacity="0.4"]') });
  await expect(chart).toHaveCount(1);
  // Flows: filled bands at 0.4, one for each status and category the rows join.
  const links = chart.locator('path[fill-opacity="0.4"]');
  const flows = await links.count();
  expect(flows).toBeGreaterThan(3);
  expect(flows).toBeLessThanOrEqual(50);
  // Nodes: 12 px wide, the statuses in their colours, the categories grey.
  const nodes = await chart.locator('path:not([fill-opacity])').evaluateAll((all) =>
    all
      .filter((path) => /^M[\d.]+ [\d.]+l[\d.]+ 0/.test(path.getAttribute('d') ?? ''))
      .map((path) => ({
        width: Math.round(path.getBoundingClientRect().width),
        x: Math.round(path.getBoundingClientRect().x),
        fill: path.getAttribute('fill') ?? '',
      })),
  );
  expect(nodes.length).toBeGreaterThan(4);
  for (const node of nodes) expect(node.width).toBe(12);
  const left = Math.min(...nodes.map((node) => node.x));
  const statuses = nodes.filter((node) => node.x === left);
  const categories = nodes.filter((node) => node.x !== left);
  expect(new Set(statuses.map((node) => node.fill)).size).toBe(statuses.length);
  for (const node of categories) expect(node.fill).toBe('#5c5b57');
  // Labels outside the nodes, each with its total.
  await expect(chart).toContainText('completed');
  await expect(chart.locator('text', { hasText: /^\$[\d,.]+$/ }).first()).toBeVisible();
  await expect(page.getByTestId('sankey-notes')).toHaveCount(0);

  // Each order its own step: 240 flows fold into at most 50, and it says so.
  const many = await sankeyChart(request, ['orders.status', 'orders.id']);
  await page.goto(`/explore/charts/${many}`);
  await expect(page.getByTestId('sankey-notes')).toHaveText(
    /^\d+ flows: each step keeps the members carrying its top 50 flows and folds the rest into "Other"\.$/,
  );
  const folded = page.locator('svg').filter({ has: page.locator('path[fill-opacity="0.4"]') });
  await expect(folded).toContainText('Other');
  expect(await folded.locator('path[fill-opacity="0.4"]').count()).toBeLessThanOrEqual(50);
});

/**
 * T989 / AC-613: THE SYSTEM SHALL give a Sankey a text alternative naming the
 * steps, the number of flows, the total and the three largest flows …, and a
 * table view of each flow as "‹source› → ‹target›" with its value and its
 * share of its source. `Fails when: a part of the text alternative is
 * missing; or a flow is missing from the table, or its share differs.`
 */
test('a Sankey says its steps, flows, total and largest flows, and its table lists every flow with its share', async ({
  page,
  request,
}) => {
  const id = await sankeyChart(request, ['orders.status', 'orders.id']);
  await page.goto(`/explore/charts/${id}`);
  const main = page.getByRole('main');
  await expect(main.getByTestId('chart-text-alternative')).toHaveText(
    /^Sankey of .+ from .+ to .+, 240 flows, \$[\d.]+K?\. Largest: \S+ → \S+ \$[\d.]+K?; \S+ → \S+ \$[\d.]+K?; \S+ → \S+ \$[\d.]+K?\.$/,
  );

  await main.getByTestId('toggle-table-view').click();
  const table = main.getByTestId('data-table');
  await expect(table.getByRole('columnheader')).toHaveText(['Flow', /Amount/, 'Share of source']);
  // Every flow, past the 50 drawn; each order is all of its status's share of it.
  await expect(table.locator('table')).toBeVisible();
  const first = table.getByTestId('table-row').first();
  await expect(first.getByRole('cell').first()).toHaveText(/^\S+ → \S+$/);
  await expect(first.getByRole('cell').nth(2)).toHaveText(/^\d+\.\d%$/);
  const rows = await table.evaluate((scroller) => {
    scroller.scrollTop = scroller.scrollHeight;
    return scroller.querySelectorAll('tbody tr[data-testid="table-row"]').length;
  });
  expect(rows).toBe(240);
});
