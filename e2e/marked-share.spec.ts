import { expect, test, type APIRequestContext, type Page, type Request } from '@playwright/test';

import { ownCubeFile, PUBLISHED } from './model-files';
import { IN_MY_WORKSPACE } from './workspace';

/**
 * T388 / AC-104: WHEN a tile needs the marked share and the marking's members
 * are not among its own groupings, THE SYSTEM SHALL obtain it with one
 * additional query per tile and keep the unmarked result cached across
 * marking changes.
 * `Fails when: more than one extra query per tile is issued for a marking
 * change, or the base result is re-fetched when only the marking changed.`
 *
 * On the seeded model: a bar of orders by status, which marks, and a bar of
 * orders by product category, which marks with the same marking but doesn't
 * group by status — so each of its bars is partly marked, and its marked
 * share is a second answer from Cube (research/cube/markings-query-support.md,
 * Q3, option B).
 */
const API = 'http://localhost:4100/api';

async function shareDashboard(request: APIRequestContext, { average = false } = {}) {
  const title = `Marked share ${String(Date.now())}-${String(Math.round(Math.random() * 1e6))}`;
  const dashboard = (await (
    await request.post(`${API}/documents`, {
      data: { kind: 'dashboard', title, ...IN_MY_WORKSPACE },
    })
  ).json()) as { id: string };
  const chartOn = async (chartTitle: string, dimension: string, measure = 'orders.count') => {
    const chart = (await (
      await request.post(`${API}/documents`, {
        data: { kind: 'chart', title: chartTitle, ...IN_MY_WORKSPACE },
      })
    ).json()) as { id: string };
    await request.put(`${API}/documents/chart/${chart.id}`, {
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
            chartType: 'bar',
          },
        },
      },
    });
    return chart.id;
  };
  const status = await chartOn('By status', 'orders.status');
  const category = await chartOn('By category', 'products.category');
  // An average per category: not additive, so partly marked is hatched (T387).
  const averaged = average
    ? await chartOn('Average by category', 'products.category', 'orders.average_amount')
    : undefined;
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
              { id: 'tile-status', kind: 'chart', w: 6, h: 40, chartId: status },
              { id: 'tile-category', kind: 'chart', w: 6, h: 40, chartId: category },
              ...(averaged === undefined
                ? []
                : [{ id: 'tile-average', kind: 'chart', w: 12, h: 40, chartId: averaged }]),
            ],
          },
        ],
      },
    },
  });
  expect(placed.ok(), await placed.text()).toBe(true);
  return { id: dashboard.id, title };
}

/** Clicks the bar over a status's axis label. */
async function clickBar(page: Page, status: string) {
  const label = page.locator('[data-tile="tile-status"] svg text', { hasText: status }).first();
  await expect(label).toBeVisible();
  let last = '';
  let box = { x: 0, y: 0, width: 0 };
  await expect
    .poll(async () => {
      box = await label.evaluate((text) => {
        const rect = text.getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width };
      });
      const now = JSON.stringify(box);
      const settled = box.width > 0 && now === last;
      last = now;
      return settled;
    })
    .toBe(true);
  await page.mouse.click(box.x + box.width / 2, box.y - 10);
}

type Query = { dimensions?: string[]; filters?: unknown[] };
const queryOf = (request: Request): Query | undefined => {
  if (!request.url().endsWith('/api/load') || request.method() !== 'POST') return undefined;
  return (request.postDataJSON() as { query?: Query } | null)?.query;
};

test('a marking change asks a tile that doesn’t group by the marked member once more, and never its own query again', async ({
  page,
  request,
}) => {
  const { id, title } = await shareDashboard(request);
  /**
   * Each tile's queries, once each: Cube's "Continue wait" asks a query
   * again under the same request id, which is one question, not two.
   */
  const asked: { tile: 'category' | 'status'; marked: string | undefined }[] = [];
  const seen = new Set<string>();
  page.on('request', (sent) => {
    const query = queryOf(sent);
    const tile = query?.dimensions?.includes('products.category')
      ? 'category'
      : query?.dimensions?.includes('orders.status')
        ? 'status'
        : undefined;
    if (tile === undefined) return;
    const requestId = sent.headers()['x-request-id'] ?? `${String(asked.length)}`;
    if (seen.has(requestId)) return;
    seen.add(requestId);
    const text = JSON.stringify(query?.filters ?? []);
    const marked = /orders\.status/.test(text)
      ? (/"values":\["([^"]+)"\]/.exec(text)?.[1] ?? '?')
      : undefined;
    asked.push({ tile, marked });
  });
  const categoryAsked = () => asked.filter((each) => each.tile === 'category');
  /** The share's answer for a status, in: the next click can't cancel it. */
  const shareAnswered = (status: string) =>
    page.waitForResponse((response) => {
      const query = queryOf(response.request());
      return (
        query?.dimensions?.includes('products.category') === true &&
        JSON.stringify(query.filters ?? []).includes(`"${status}"`)
      );
    });

  await page.goto(`/explore/dashboards/${id}`);
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  await expect(page.locator('[data-tile="tile-category"] svg').first()).toBeVisible();
  // Its own answer, asked once.
  await expect.poll(() => categoryAsked().length).toBe(1);
  expect(categoryAsked()).toEqual([{ tile: 'category', marked: undefined }]);

  // Marked: one more question, the marked share, and not its own again.
  let answered = shareAnswered('shipped');
  await clickBar(page, 'shipped');
  await answered;
  // Another marking: one more.
  answered = shareAnswered('completed');
  await clickBar(page, 'completed');
  await answered;
  await expect(page.getByTestId('mark-chip')).toContainText('completed');
  // The first marking again, as the marking now holds it: answered from the
  // cache, no question at all.
  await clickBar(page, 'shipped');
  await expect(page.getByTestId('mark-chip')).toContainText('shipped');
  await page.waitForTimeout(1_000);
  expect(categoryAsked()).toEqual([
    { tile: 'category', marked: undefined },
    { tile: 'category', marked: 'shipped' },
    { tile: 'category', marked: 'completed' },
  ]);
  // The tile that groups by status reads its marks from its own rows: asked
  // once, and no share.
  expect(asked.filter((each) => each.tile === 'status')).toEqual([
    { tile: 'status', marked: undefined },
  ]);
});

/**
 * T387 / AC-097: WHEN an item is partly marked and its measure is additive,
 * THE SYSTEM SHALL draw the marked share from the baseline at full strength
 * and fade the remainder; WHEN the measure is not additive, THE SYSTEM SHALL
 * draw the whole item with a pattern and show the marked and total values in
 * its tooltip.
 * `Fails when: a partial average or distinct count is drawn as a sub-length,
 * or a partly marked sum shows no marked share.`
 *
 * The seeded model's orders by category: a count (additive) and an average
 * amount (not), each partly marked by the shipped orders.
 */
test('a partly marked count shows its marked share, and a partly marked average is hatched, never shorter', async ({
  page,
  request,
}) => {
  const { id, title } = await shareDashboard(request, { average: true });
  await page.goto(`/explore/dashboards/${id}`);
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  const count = page.locator('[data-tile="tile-category"] svg').first();
  const average = page.locator('[data-tile="tile-average"] svg').first();
  await expect(count).toBeVisible();
  await expect(average).toBeVisible();
  const bars = (svg: typeof count) =>
    svg.locator('path[fill]').evaluateAll((paths) =>
      paths
        .map((path) => {
          const box = (path as SVGGraphicsElement).getBBox();
          return {
            // By its centre: an outlined part is inset by half its outline.
            left: Math.round(box.x + box.width / 2),
            top: box.y,
            bottom: box.y + box.height,
            width: box.width,
            height: box.height,
            opacity: Number(path.getAttribute('fill-opacity') ?? 1),
            stroke: path.getAttribute('stroke'),
            patterned: (path.getAttribute('fill') ?? '').startsWith('url('),
          };
        })
        .filter((bar) => bar.width > 2 && bar.height > 2 && bar.width < 400),
    );

  await clickBar(page, 'shipped');

  // The count: each category's bar a full-strength marked part, outlined in
  // the marking's colour, under its faded remainder.
  await expect
    .poll(async () =>
      (await bars(count)).some((bar) => bar.opacity === 1 && bar.stroke === '#151107'),
    )
    .toBe(true);
  const drawn = await bars(count);
  expect(
    drawn.filter((bar) => bar.opacity === 1 && bar.stroke === '#151107').length,
  ).toBeGreaterThan(0);
  expect(drawn.filter((bar) => bar.opacity < 0.5).length).toBeGreaterThan(0);
  // One bar in two parts: the marked one on the baseline, the faded rest on it.
  const split = drawn
    .filter((bar) => bar.opacity === 1 && bar.stroke === '#151107')
    .map((foot) => ({
      foot,
      rest: drawn.find((bar) => bar.left === foot.left && bar.opacity < 0.5),
    }))
    .find((pair) => pair.rest !== undefined);
  expect(split?.rest).toBeDefined();
  expect(Math.abs(split!.foot.top - split!.rest!.bottom)).toBeLessThan(2);
  expect(split!.foot.bottom).toBeGreaterThan(split!.rest!.bottom);

  // The average: no shorter bar — each partly marked one is whole and hatched.
  // A hatched bar is drawn as its colour and its hatch over it, so a column
  // may hold two paths, but they span one height: never a part beside a
  // remainder.
  await expect.poll(async () => (await bars(average)).some((bar) => bar.patterned)).toBe(true);
  const averaged = await bars(average);
  const spans = new Map<number, Set<string>>();
  for (const bar of averaged) {
    const span = `${String(Math.round(bar.top))}-${String(Math.round(bar.bottom))}`;
    spans.set(bar.left, (spans.get(bar.left) ?? new Set()).add(span));
  }
  expect([...spans.values()].map((each) => each.size)).toEqual([...spans.keys()].map(() => 1));
  // And its tooltip says both values.
  const hatched = average.locator('path[fill^="url("]').first();
  await hatched.hover();
  await expect(page.locator('[data-tile="tile-average"]')).toContainText(/· Marked: \$/);
});

/**
 * T453 / AC-097, on the chart types T387 left fading every item (direction.md
 * §7a; the user's answers of 2026-09-28, R43). On the seeded model, each tile
 * groups by category (and country) but not by status, so marking the shipped
 * orders — a third of each group's — leaves every item partly marked.
 */
const MARKING = '#151107';

type Tile = {
  readonly id: string;
  readonly title: string;
  readonly chartType: string;
  readonly measures: readonly string[];
  readonly dimensions: readonly string[];
  readonly cube?: string;
  readonly eachPointIs?: string;
};

/** A Markings-mode dashboard of these tiles, each a chart of its own, two to a row. */
async function dashboardOf(request: APIRequestContext, tiles: readonly Tile[]) {
  const title = `Marked share ${String(Date.now())}-${String(Math.round(Math.random() * 1e6))}`;
  const dashboard = (await (
    await request.post(`${API}/documents`, {
      data: { kind: 'dashboard', title, ...IN_MY_WORKSPACE },
    })
  ).json()) as { id: string };
  const items = [];
  for (const tile of tiles) {
    const chart = (await (
      await request.post(`${API}/documents`, {
        data: { kind: 'chart', title: tile.title, ...IN_MY_WORKSPACE },
      })
    ).json()) as { id: string };
    const saved = await request.put(`${API}/documents/chart/${chart.id}`, {
      data: {
        version: 1,
        body: {
          schemaVersion: 1,
          title: tile.title,
          owner: 'admin',
          localToDashboardId: dashboard.id,
          chart: {
            source: { cube: tile.cube ?? 'orders' },
            wells: {
              measures: tile.measures,
              dimensions: tile.dimensions,
              timeDimensions: [],
              ...(tile.eachPointIs === undefined ? {} : { eachPointIs: tile.eachPointIs }),
            },
            chartType: tile.chartType,
          },
        },
      },
    });
    expect(saved.ok(), await saved.text()).toBe(true);
    items.push({ id: tile.id, kind: 'chart', w: 6, h: 40, chartId: chart.id });
  }
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
        pages: [{ id: 'only', title: 'Only', items }],
      },
    },
  });
  expect(placed.ok(), await placed.text()).toBe(true);
  return { id: dashboard.id, title };
}

/** Clicks the bar over a category's axis label on a tile. */
async function clickBarOn(page: Page, tile: string, label: string) {
  const text = page.locator(`[data-tile="${tile}"] svg text`, { hasText: label }).first();
  await expect(text).toBeVisible();
  let last = '';
  let box = { x: 0, y: 0, width: 0 };
  await expect
    .poll(async () => {
      box = await text.evaluate((node) => {
        const rect = node.getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width };
      });
      const now = JSON.stringify(box);
      const settled = box.width > 0 && now === last;
      last = now;
      return settled;
    })
    .toBe(true);
  await page.mouse.click(box.x + box.width / 2, box.y - 10);
}

/** A tile's filled marks, by their centres, with their fill, opacity and outline. */
const marksIn = (page: Page, tile: string) =>
  page
    .locator(`[data-tile="${tile}"] svg`)
    .first()
    .locator('path')
    .evaluateAll((paths) =>
      paths.map((path) => {
        const box = (path as SVGGraphicsElement).getBBox();
        const onScreen = path.getBoundingClientRect();
        return {
          left: Math.round(box.x + box.width / 2),
          top: box.y,
          bottom: box.y + box.height,
          width: box.width,
          height: box.height,
          // Its centre on the page, where its own box ignores a transform.
          centre: onScreen.x + onScreen.width / 2,
          fill: path.getAttribute('fill') ?? '',
          opacity: Number(path.getAttribute('fill-opacity') ?? 1),
          strokeOpacity: Number(path.getAttribute('stroke-opacity') ?? 1),
          stroke: path.getAttribute('stroke'),
          dashed: (path.getAttribute('stroke-dasharray') ?? 'none') !== 'none',
          subpaths: (path.getAttribute('d') ?? '').match(/M/gi)?.length ?? 0,
          // Filled with a hatch: a `<pattern>`, not a gradient, which a
          // map's colour scale also fills with (T453's review).
          hatched:
            document
              .getElementById(
                /url\(['"]?#([^'")]+)['"]?\)/.exec(path.getAttribute('fill') ?? '')?.[1] ?? '',
              )
              ?.tagName.toLowerCase() === 'pattern',
        };
      }),
    );

/** A bar in two parts: a full-strength part outlined in the marking's colour, on the baseline, under its faded rest. */
async function hasSplitBar(page: Page, tile: string): Promise<boolean> {
  const bars = (await marksIn(page, tile)).filter(
    (bar) => bar.fill !== 'none' && bar.width > 2 && bar.height > 2 && bar.width < 400,
  );
  return bars.some(
    (foot) =>
      foot.opacity === 1 &&
      foot.stroke === MARKING &&
      bars.some(
        (rest) =>
          rest.left === foot.left &&
          rest.opacity < 0.5 &&
          Math.abs(foot.top - rest.bottom) < 2 &&
          foot.bottom > rest.bottom,
      ),
  );
}

/** A line faded under a full-strength line of its own colour: its marked share. */
async function hasMarkedLine(page: Page, tile: string): Promise<boolean> {
  const lines = (await marksIn(page, tile)).filter(
    (mark) => mark.fill === 'none' && mark.stroke !== null && mark.stroke !== MARKING,
  );
  const faded = lines.find((line) => line.strokeOpacity < 0.5);
  return (
    faded !== undefined &&
    lines.some((line) => line.stroke === faded.stroke && line.strokeOpacity === 1)
  );
}

/**
 * Some item outlined in the marking's colour, and some hatched. A treemap
 * draws a leaf's border as a rectangle behind it, filled in the border's
 * colour (research/echarts-symbol-hatch.md), where the others stroke it.
 */
async function hasHatchedItem(page: Page, tile: string): Promise<boolean> {
  const marks = await marksIn(page, tile);
  return (
    marks.some((mark) => mark.stroke === MARKING || mark.fill === MARKING) &&
    marks.some((mark) => mark.hatched)
  );
}

/**
 * T387's types on the real surface too, where its own test drew a bar: a
 * stacked bar's segments each split in their place (the stacked bar the
 * 2026-09-27 review saw fading, UX-025), a line under its marked line, and a
 * pie's slice and a treemap's leaf outlined and hatched.
 */
test('a stacked bar, a line, a pie and a treemap draw their marked share', async ({
  page,
  request,
}) => {
  const { id, title } = await dashboardOf(request, [
    {
      id: 'tile-status',
      title: 'By status',
      chartType: 'bar',
      measures: ['orders.count'],
      dimensions: ['orders.status'],
    },
    {
      id: 'tile-stacked',
      title: 'Stacked',
      chartType: 'stackedBar',
      measures: ['orders.count'],
      dimensions: ['products.category', 'customers.country'],
    },
    {
      id: 'tile-line',
      title: 'Line',
      chartType: 'line',
      measures: ['orders.count'],
      dimensions: ['products.category'],
    },
    {
      id: 'tile-pie',
      title: 'Pie',
      chartType: 'pie',
      measures: ['orders.count'],
      dimensions: ['products.category'],
    },
    {
      id: 'tile-treemap',
      title: 'Treemap',
      chartType: 'treemap',
      measures: ['orders.count'],
      dimensions: ['products.category'],
    },
  ]);
  await page.goto(`/explore/dashboards/${id}`);
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  for (const tile of ['tile-stacked', 'tile-line', 'tile-pie', 'tile-treemap'])
    await expect(page.locator(`[data-tile="${tile}"] svg`).first()).toBeVisible();

  await clickBarOn(page, 'tile-status', 'shipped');
  await expect(page.getByTestId('mark-chip')).toContainText('shipped');

  await expect.poll(() => hasSplitBar(page, 'tile-stacked')).toBe(true);
  await expect.poll(() => hasMarkedLine(page, 'tile-line')).toBe(true);
  await expect.poll(() => hasHatchedItem(page, 'tile-pie')).toBe(true);
  await expect.poll(() => hasHatchedItem(page, 'tile-treemap')).toBe(true);
});

test('a partly marked heatmap cell is outlined dashed, and a combo, a trellis, a scatter and a box plot draw their marked share', async ({
  page,
  request,
}) => {
  const { id, title } = await dashboardOf(request, [
    {
      id: 'tile-status',
      title: 'By status',
      chartType: 'bar',
      measures: ['orders.count'],
      dimensions: ['orders.status'],
    },
    {
      id: 'tile-heatmap',
      title: 'Heatmap',
      chartType: 'heatmap',
      measures: ['orders.count'],
      dimensions: ['products.category', 'customers.country'],
    },
    {
      id: 'tile-combo',
      title: 'Combo',
      chartType: 'combo',
      measures: ['orders.total_amount', 'orders.count'],
      dimensions: ['products.category'],
    },
    {
      id: 'tile-trellis',
      title: 'Trellis',
      chartType: 'trellis',
      measures: ['orders.count'],
      dimensions: ['products.category', 'customers.country'],
    },
    {
      id: 'tile-scatter',
      title: 'Scatter',
      chartType: 'scatter',
      measures: ['orders.count', 'orders.total_amount'],
      dimensions: ['products.category'],
    },
    {
      id: 'tile-boxplot',
      title: 'Box plot',
      chartType: 'boxplot',
      measures: ['orders.total_amount'],
      dimensions: ['products.category'],
      eachPointIs: 'customers.name',
    },
    // Each point a row of the data: no "Each point is" (T453's review).
    {
      id: 'tile-boxplot-rows',
      title: 'Box plot of orders',
      chartType: 'boxplot',
      measures: ['orders.total_amount'],
      dimensions: ['products.category'],
    },
  ]);
  await page.goto(`/explore/dashboards/${id}`);
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  for (const tile of [
    'tile-heatmap',
    'tile-combo',
    'tile-trellis',
    'tile-scatter',
    'tile-boxplot',
    'tile-boxplot-rows',
  ])
    await expect(page.locator(`[data-tile="${tile}"] svg`).first()).toBeVisible();

  await clickBarOn(page, 'tile-status', 'shipped');
  await expect(page.getByTestId('mark-chip')).toContainText('shipped');

  // The heatmap: each cell is a third shipped, so outlined dashed in the
  // marking's colour, never faded; and its tooltip says its marked value.
  await expect
    .poll(async () =>
      (await marksIn(page, 'tile-heatmap')).some((cell) => cell.stroke === MARKING && cell.dashed),
    )
    .toBe(true);
  const cells = (await marksIn(page, 'tile-heatmap')).filter(
    (cell) => cell.fill.startsWith('rgb') && cell.width > 2,
  );
  expect(cells.length).toBeGreaterThan(0);
  expect(cells.filter((cell) => cell.opacity < 0.5)).toEqual([]);
  const dashedCell = page
    .locator('[data-tile="tile-heatmap"] svg')
    .first()
    .locator(`path[stroke="${MARKING}"][stroke-dasharray]`)
    .first();
  await dashedCell.hover();
  await expect(page.locator('[data-tile="tile-heatmap"]')).toContainText(/· Marked: \d/);

  // The combo: its bars split as a bar chart's, and its line faded under a
  // full-strength line of its marked share.
  await expect.poll(() => hasSplitBar(page, 'tile-combo')).toBe(true);
  await expect.poll(() => hasMarkedLine(page, 'tile-combo')).toBe(true);

  // A trellis panel's bars split in each panel.
  await expect.poll(() => hasSplitBar(page, 'tile-trellis')).toBe(true);

  // A scatter's points: outlined in the marking's colour and crossed by its
  // hatch, never faded.
  await expect
    .poll(async () =>
      (await marksIn(page, 'tile-scatter')).some(
        (point) => point.stroke === MARKING && point.subpaths === 3,
      ),
    )
    .toBe(true);

  // A box plot's boxes: some of each box's customers' orders are shipped, so
  // each is outlined and hatched.
  await expect.poll(() => hasHatchedItem(page, 'tile-boxplot')).toBe(true);

  // Each point an order: a third of each category's 120 are shipped, so its
  // box is hatched, and its tooltip counts the 40 marked, not every one.
  await expect.poll(() => hasHatchedItem(page, 'tile-boxplot-rows')).toBe(true);
  await page
    .locator('[data-tile="tile-boxplot-rows"] svg')
    .first()
    .locator('path[fill^="url("]')
    .first()
    .hover();
  await expect(page.locator('[data-tile="tile-boxplot-rows"]')).toContainText(
    'n: 120 · Marked: 40',
  );
});

test('a KPI, a table and a pivot under a marking say its marked share', async ({
  page,
  request,
}) => {
  const { id, title } = await dashboardOf(request, [
    {
      id: 'tile-status',
      title: 'By status',
      chartType: 'bar',
      measures: ['orders.count'],
      dimensions: ['orders.status'],
    },
    {
      id: 'tile-kpi',
      title: 'Orders',
      chartType: 'kpi',
      measures: ['orders.count'],
      dimensions: [],
    },
    {
      id: 'tile-kpi-average',
      title: 'Average',
      chartType: 'kpi',
      measures: ['orders.average_amount'],
      dimensions: [],
    },
    {
      id: 'tile-table',
      title: 'Table',
      chartType: 'table',
      measures: ['orders.count'],
      dimensions: ['products.category'],
    },
    {
      id: 'tile-pivot',
      title: 'Pivot',
      chartType: 'pivot',
      measures: ['orders.count'],
      dimensions: ['products.category', 'customers.country'],
    },
  ]);
  await page.goto(`/explore/dashboards/${id}`);
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  await expect(
    page.locator('[data-tile="tile-table"]').getByTestId('table-row').first(),
  ).toBeVisible();

  await clickBarOn(page, 'tile-status', 'shipped');

  // The KPIs: 80 of the 240 orders are shipped; an average has no part of a whole.
  await expect(page.locator('[data-tile="tile-kpi"]').getByTestId('kpi-marked')).toHaveText(
    'Marked 80 · 33%',
  );
  await expect(page.locator('[data-tile="tile-kpi-average"]').getByTestId('kpi-marked')).toHaveText(
    /^Marked \$[\d,]+(\.\d+)?$/,
  );

  // The table: each category's row a third shipped, its marked count beside
  // its count, and the rule down its left.
  const row = page.locator('[data-tile="tile-table"]').getByTestId('table-row').first();
  await expect(row).toContainText(/120 · Marked: 40/);
  await expect(row).toHaveAttribute('data-marked', 'partly');
  expect(
    await row
      .locator('td')
      .first()
      .evaluate((cell) => getComputedStyle(cell).boxShadow),
  ).toMatch(/inset/);

  // The pivot: each cell of a category and a country, the same.
  const cell = page.locator('[data-tile="tile-pivot"] td[data-marked="partly"]').first();
  await expect(cell).toContainText(/60 · Marked: 20/);
  expect(await cell.evaluate((each) => getComputedStyle(each).boxShadow)).toMatch(/inset/);
  await expect(
    page.locator('[data-tile="tile-pivot"]').getByTestId('pivot-grand-total'),
  ).not.toContainText('Marked');
});

test('a partly marked country is outlined and hatched, and its tooltip says its marked value', async ({
  page,
  request,
}, testInfo) => {
  // Sales by country and channel, of this browser's own: the sample model's
  // countries are names, and a map needs ISO-3 codes (`countries.ts`).
  const cube = `channel_sales_${testInfo.project.name}`;
  await ownCubeFile(
    request,
    cube,
    [
      'cubes:',
      `  - name: ${cube}`,
      '    sql: >',
      '      SELECT * FROM (VALUES',
      "        ('FRA', 'web', 100), ('FRA', 'store', 20), ('NOR', 'web', 80), ('USA', 'store', 300)",
      '      ) AS t(iso3, channel, amount)',
      '    dimensions:',
      '      - name: iso3',
      '        sql: iso3',
      '        type: string',
      '      - name: channel',
      '        sql: channel',
      '        type: string',
      '    measures:',
      '      - name: total',
      '        sql: amount',
      '        type: sum',
      '',
    ].join('\n'),
  );
  await expect
    .poll(
      async () =>
        (
          (await (await request.get('/api/meta')).json()) as { cubes: { name: string }[] }
        ).cubes.map((each) => each.name),
      PUBLISHED,
    )
    .toContain(cube);
  const { id, title } = await dashboardOf(request, [
    {
      id: 'tile-channel',
      title: 'By channel',
      chartType: 'bar',
      measures: [`${cube}.total`],
      dimensions: [`${cube}.channel`],
      cube,
    },
    {
      id: 'tile-map',
      title: 'By country',
      chartType: 'map',
      measures: [`${cube}.total`],
      dimensions: [`${cube}.iso3`],
      cube,
    },
  ]);
  await page.goto(`/explore/dashboards/${id}`);
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  await expect(page.locator('[data-tile="tile-map"] svg').first()).toBeVisible();

  // Web: France in part, Norway in full, the USA not at all.
  await clickBarOn(page, 'tile-channel', 'web');
  await expect.poll(() => hasHatchedItem(page, 'tile-map')).toBe(true);
  // Its tooltip, shown for the item the keyboard is on (T306): France's,
  // whatever place Cube's order gives it. A country's shape is too scattered
  // to hover at its box's centre.
  const map = page.locator('[data-tile="tile-map"]');
  await map.focus();
  await expect(map).toBeFocused();
  for (let moves = 0; moves < 3 && !((await map.textContent()) ?? '').includes('France'); moves++) {
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(200);
  }
  await expect(map).toContainText('France');
  await expect(map).toContainText(/120 · Marked: 100/);
});

/**
 * T507 / AC-096: WHEN a tile shows a marking, THE SYSTEM SHALL draw marked
 * items in their own colour with an outline in the marking's colour and fade
 * unmarked items (direction.md rule 49).
 * `Fails when: unmarked items render at full strength, or marked items carry
 * no outline.`
 *
 * Each tile here groups by status, so marking the shipped orders marks whole
 * items, each read from its own rows: a heatmap's cells by column and row, a
 * scatter's points by their rows, a trellis's bars in every panel, a pie's
 * slices on a third grouping, a box by its points, a line's segments.
 */
const outlined = (mark: { stroke: string | null; opacity: number }) =>
  mark.stroke === MARKING && mark.opacity === 1;
/** Drawn, and faded: not an invisible hit area ECharts lays over a chart. */
const faded = (mark: { opacity: number; strokeOpacity: number }) =>
  (mark.opacity > 0 && mark.opacity < 0.5) || mark.strokeOpacity < 0.5;

test('each chart type marks its items by their own rows, and fades the rest', async ({
  page,
  request,
}) => {
  const byStatus = (id: string, chartType: string, extra: Partial<Tile> = {}): Tile => ({
    id,
    title: id,
    chartType,
    measures: ['orders.count'],
    dimensions: ['orders.status', 'products.category'],
    ...extra,
  });
  const { id, title } = await dashboardOf(request, [
    {
      id: 'tile-status',
      title: 'By status',
      chartType: 'bar',
      measures: ['orders.count'],
      dimensions: ['orders.status'],
    },
    // Status across, category down.
    byStatus('tile-heatmap', 'heatmap'),
    // A point per status and category, a series per status.
    byStatus('tile-scatter', 'scatter', { measures: ['orders.count', 'orders.total_amount'] }),
    // Status along each panel, a panel per category.
    byStatus('tile-trellis', 'trellis'),
    // A slice per category and country, and status a third grouping.
    byStatus('tile-pie', 'pie', {
      dimensions: ['products.category', 'customers.country', 'orders.status'],
    }),
    // A line per status across the categories.
    byStatus('tile-line', 'line', { dimensions: ['products.category', 'orders.status'] }),
    // A box per status: the shipped one all marked.
    byStatus('tile-box-whole', 'boxplot', {
      measures: ['orders.total_amount'],
      dimensions: ['orders.status'],
      eachPointIs: 'customers.name',
    }),
    // A box per category, a point per status: each box a third marked.
    byStatus('tile-box-part', 'boxplot', {
      measures: ['orders.total_amount'],
      dimensions: ['products.category'],
      eachPointIs: 'orders.status',
    }),
  ]);
  await page.goto(`/explore/dashboards/${id}`);
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  const tiles = [
    'tile-heatmap',
    'tile-scatter',
    'tile-trellis',
    'tile-pie',
    'tile-line',
    'tile-box-whole',
    'tile-box-part',
  ];
  for (const tile of tiles)
    await expect(page.locator(`[data-tile="${tile}"] svg`).first()).toBeVisible();

  await clickBarOn(page, 'tile-status', 'shipped');
  await expect(page.getByTestId('mark-chip')).toContainText('shipped');

  // The heatmap: the two cells of the shipped column outlined, the four
  // others faded — and the outlined ones under the "shipped" label.
  await expect
    .poll(async () => (await marksIn(page, 'tile-heatmap')).filter(outlined).length)
    .toBe(2);
  const cells = (await marksIn(page, 'tile-heatmap')).filter(
    (cell) => cell.fill.startsWith('rgb') && cell.width > 2,
  );
  expect(cells.filter((cell) => faded(cell))).toHaveLength(4);
  const shippedAt = await page
    .locator('[data-tile="tile-heatmap"] svg text', { hasText: 'shipped' })
    .first()
    .evaluate((text) => {
      const box = text.getBoundingClientRect();
      return box.x + box.width / 2;
    });
  for (const cell of cells.filter(outlined))
    expect(Math.abs(cell.centre - shippedAt)).toBeLessThan(cell.width / 2);

  // The scatter: the shipped series' two points outlined, the four others faded.
  await expect
    .poll(async () => (await marksIn(page, 'tile-scatter')).filter(outlined).length)
    .toBe(2);
  expect((await marksIn(page, 'tile-scatter')).filter(faded)).toHaveLength(4);

  // The trellis: the shipped bar outlined in each of its two panels, the four others faded.
  await expect
    .poll(async () => (await marksIn(page, 'tile-trellis')).filter(outlined).length)
    .toBe(2);
  expect(
    (await marksIn(page, 'tile-trellis')).filter((bar) => bar.width > 2 && faded(bar)),
  ).toHaveLength(4);

  // The pie: the four shipped slices outlined, the eight others faded.
  // Its slices, not their legend's icons, which wear their slices' style.
  const slices = async () => (await marksIn(page, 'tile-pie')).filter((slice) => slice.height > 16);
  await expect.poll(async () => (await slices()).filter(outlined).length).toBe(4);
  expect((await slices()).filter(faded)).toHaveLength(8);

  // The line: every line faded, and the shipped one's segment drawn at full
  // strength over it.
  await expect.poll(() => hasMarkedLine(page, 'tile-line')).toBe(true);
  expect(
    (await marksIn(page, 'tile-line')).filter(
      (line) => line.fill === 'none' && line.strokeOpacity < 0.5,
    ).length,
  ).toBeGreaterThanOrEqual(3);

  // The box plot by status: the shipped box outlined, whole, never hatched,
  // under the "shipped" label; the two others faded.
  await expect
    .poll(async () => (await marksIn(page, 'tile-box-whole')).filter(outlined).length)
    .toBe(1);
  const boxes = await marksIn(page, 'tile-box-whole');
  expect(boxes.some((box) => box.hatched)).toBe(false);
  expect(boxes.filter((box) => box.strokeOpacity < 0.5)).toHaveLength(2);
  const shippedBox = await page
    .locator('[data-tile="tile-box-whole"] svg text', { hasText: 'shipped' })
    .first()
    .evaluate((text) => {
      const box = text.getBoundingClientRect();
      return box.x + box.width / 2;
    });
  const [outlinedBox] = boxes.filter(outlined);
  expect(Math.abs((outlinedBox?.centre ?? 0) - shippedBox)).toBeLessThan(
    (outlinedBox?.width ?? 0) / 2,
  );

  // The box plot by category: a third of each box's points shipped, so each
  // is outlined and hatched — never read by its first point alone.
  await expect.poll(() => hasHatchedItem(page, 'tile-box-part')).toBe(true);
});

test('a table and a pivot draw their marked rows marked, and dim the others', async ({
  page,
  request,
}) => {
  const { id, title } = await dashboardOf(request, [
    {
      id: 'tile-status',
      title: 'By status',
      chartType: 'bar',
      measures: ['orders.count'],
      dimensions: ['orders.status'],
    },
    {
      id: 'tile-table',
      title: 'Table',
      chartType: 'table',
      measures: ['orders.count'],
      dimensions: ['orders.status'],
    },
    {
      id: 'tile-pivot',
      title: 'Pivot',
      chartType: 'pivot',
      measures: ['orders.count'],
      dimensions: ['orders.status', 'products.category'],
    },
  ]);
  await page.goto(`/explore/dashboards/${id}`);
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  const table = page.locator('[data-tile="tile-table"]');
  await expect(table.getByTestId('table-row').first()).toBeVisible();

  await clickBarOn(page, 'tile-status', 'shipped');

  // The table: the shipped row bold, with a rule in the marking's colour;
  // the others dimmed.
  const shipped = table.getByTestId('table-row').filter({ hasText: 'shipped' });
  await expect(shipped).toHaveAttribute('data-marked', 'whole');
  const drawn = await shipped
    .locator('td')
    .first()
    .evaluate((cell) => {
      const style = getComputedStyle(cell);
      return { weight: style.fontWeight, rule: style.boxShadow };
    });
  expect(drawn.weight).toBe('600');
  expect(drawn.rule).toMatch(/rgb\(21, 17, 7\).*inset|inset.*rgb\(21, 17, 7\)/);
  const others = table.getByTestId('table-row').filter({ hasNotText: 'shipped' });
  await expect(others).toHaveCount(2);
  for (const row of await others.all()) {
    await expect(row).toHaveAttribute('data-marked', 'none');
    expect(
      Number(
        await row
          .locator('td')
          .first()
          .evaluate((cell) => getComputedStyle(cell).opacity),
      ),
    ).toBeLessThan(1);
  }

  // The pivot: the shipped row's cells ruled, the others dimmed, its totals as they were.
  const pivot = page.locator('[data-tile="tile-pivot"]');
  const pivotShipped = pivot.getByTestId('pivot-row').filter({ hasText: 'shipped' });
  await expect(pivotShipped.locator('td[data-marked="whole"]')).toHaveCount(2);
  expect(
    await pivotShipped
      .locator('td[data-marked="whole"]')
      .first()
      .evaluate((cell) => getComputedStyle(cell).boxShadow),
  ).toMatch(/rgb\(21, 17, 7\).*inset|inset.*rgb\(21, 17, 7\)/);
  await expect(pivot.locator('td[data-marked="none"]')).toHaveCount(4);
  await expect(pivot.getByTestId('pivot-grand-total')).not.toHaveAttribute('data-marked', /.*/);
});
