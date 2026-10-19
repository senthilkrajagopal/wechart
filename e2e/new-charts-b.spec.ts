import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

import { chooseChartType, expectChartType } from './chartType';
import { publishCountryCube } from './countries';
import { cubePicker } from './cubePicker';
import { viewAs } from './tileMenu';
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

/** A dashboard of a Sankey (status → category) and a bar of orders by country, in this mode. */
async function sankeyDashboard(request: APIRequestContext, mode: 'markings' | 'crossFilter') {
  const title = `Sankey ${mode} ${String(Date.now())}-${String(Math.round(Math.random() * 1e6))}`;
  const dashboard = (await (
    await request.post(`${API}/api/documents`, {
      data: { kind: 'dashboard', title, ...IN_MY_WORKSPACE },
    })
  ).json()) as { id: string };
  const items = [];
  for (const [tile, chartType, measure, dimensions] of [
    ['tile-sankey', 'sankey', 'orders.total_amount', ['orders.status', 'products.category']],
    ['tile-country', 'bar', 'orders.count', ['customers.country']],
  ] as const) {
    const chart = (await (
      await request.post(`${API}/api/documents`, {
        data: { kind: 'chart', title: tile, ...IN_MY_WORKSPACE },
      })
    ).json()) as { id: string };
    const saved = await request.put(`${API}/api/documents/chart/${chart.id}`, {
      data: {
        version: 1,
        body: {
          schemaVersion: 1,
          title: tile,
          owner: 'admin',
          localToDashboardId: dashboard.id,
          chart: {
            source: { cube: 'orders' },
            wells: { measures: [measure], dimensions: [...dimensions], timeDimensions: [] },
            chartType,
          },
        },
      },
    });
    expect(saved.ok(), await saved.text()).toBe(true);
    items.push({ id: tile, kind: 'chart', w: 6, h: 40, chartId: chart.id });
  }
  const placed = await request.put(`${API}/api/documents/dashboard/${dashboard.id}`, {
    data: {
      version: 1,
      body: {
        schemaVersion: 1,
        title,
        ...IN_MY_WORKSPACE,
        owner: 'admin',
        settings: {
          width: 'fixed',
          interactions:
            mode === 'markings'
              ? { mode: 'markings' }
              : { mode: 'crossFilter', crossFilter: { defaultAction: 'filter' } },
        },
        markings: [{ id: 'm1', name: 'Marking', slot: 'mk1', isDefault: true }],
        pages: [{ id: 'only', title: 'Only', items }],
      },
    },
  });
  expect(placed.ok(), await placed.text()).toBe(true);
  return { id: dashboard.id, title };
}

/** A place inside a Sankey's link (its first, or the nth) that no other link covers, on the page. */
async function insideALink(page: Page, tile: string, nth = 0): Promise<{ x: number; y: number }> {
  const links = page.locator(`[data-tile="${tile}"] svg path[fill-opacity]`);
  await links.nth(nth).scrollIntoViewIfNeeded();
  const spot = await links.nth(nth).evaluate((shape) => {
    const path = shape as SVGGeometryElement;
    const box = path.getBBox();
    const matrix = path.getScreenCTM();
    if (matrix === null) return undefined;
    // The middle of the band where it crosses its middle, clear of its edges.
    const inside: { x: number; y: number }[] = [];
    for (let y = box.y; y <= box.y + box.height; y += 0.5) {
      const point = new DOMPoint(box.x + box.width / 2, y);
      if (!path.isPointInFill(point)) continue;
      const at = point.matrixTransform(matrix);
      if (document.elementFromPoint(at.x, at.y) === path) inside.push({ x: at.x, y: at.y });
    }
    return inside[Math.floor(inside.length / 2)];
  });
  if (spot === undefined) throw new Error('no place inside a link');
  return spot;
}

/**
 * T988 / AC-612: THE SYSTEM SHALL mark a Sankey node as its member and a link
 * as its (source, target) tuple (AC-087); WHILE another tile's marking
 * applies, fade unmarked links to 0.28 of their opacity and give a partly
 * marked link's share in its tooltip ("Marked: $96K of $210K"), the tile's ⓘ
 * saying a link's marked share is given in its tooltip, not drawn; and as a
 * cross-filter source a node filters the others to its member and a link to
 * its tuple, with one chip ("Channel: Web · Region: EMEA").
 * `Fails when: a link marks other than its tuple; a partly marked link's
 * tooltip lacks its share; the ⓘ is missing; or the chip reads otherwise.`
 */
test('a Sankey marks a link as its tuple and a node as its member, says a marked share in a link’s tooltip, and cross-filters by a link’s tuple', async ({
  page,
  request,
}) => {
  const { id, title } = await sankeyDashboard(request, 'markings');
  await page.goto(`/explore/dashboards/${id}`);
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  const sankey = page.locator('[data-tile="tile-sankey"]');
  const full = sankey.locator('svg path[fill-opacity="0.4"]');
  const faded = sankey.locator('svg path[fill-opacity="0.112"]');
  await expect(full.first()).toBeVisible();
  const flows = await full.count();
  expect(flows).toBeGreaterThan(3);

  // A link marks its (status, category) tuple: it alone stays at 0.4.
  const link = await insideALink(page, 'tile-sankey');
  await page.mouse.click(link.x, link.y);
  await expect(sankey.getByTestId('mark-badge')).toContainText('1 marked');
  await expect(full).toHaveCount(1);
  await expect(faded).toHaveCount(flows - 1);

  // A node marks its status: every link it holds stays, and only those.
  // Its label: "completed" over its total, to its left.
  const label = sankey.locator('svg text', { hasText: /^completed/ }).first();
  const node = await label.evaluate((text) => {
    const own = text.getBoundingClientRect();
    // Nodes by their rectangles, faded or not; links are curves.
    const svg = (text as unknown as SVGTextElement).ownerSVGElement;
    const nodes = [...(svg?.querySelectorAll('path') ?? [])]
      .filter((path) => /^M[\d.]+ [\d.]+l[\d.]+ 0/.test(path.getAttribute('d') ?? ''))
      .map((path) => path.getBoundingClientRect())
      .filter((box) => box.left >= own.right - 1);
    // The node its label sits beside: nearest to the label's right end.
    const gap = (box: DOMRect) =>
      Math.hypot(box.left - own.right, box.top + box.height / 2 - (own.top + own.height / 2));
    const nearest = nodes.sort((a, b) => gap(a) - gap(b))[0];
    return nearest === undefined
      ? undefined
      : { x: nearest.left + nearest.width / 2, y: nearest.top + nearest.height / 2 };
  });
  if (node === undefined) throw new Error('no node beside "completed"');
  await page.mouse.click(node.x, node.y);
  // Its member alone: its status, not a tuple ("1 item").
  await expect(page.getByTestId('mark-chip')).toContainText(/Status: completedfrom/);
  await expect.poll(() => full.count()).toBeGreaterThan(1);
  expect((await full.count()) + (await faded.count())).toBe(flows);

  // Another tile marks a country, which the Sankey doesn't group by: its
  // links are partly marked, their share in their tooltips, and it says so.
  const country = page.locator('[data-tile="tile-country"] svg text').filter({ hasText: /^\D/ });
  const first = await country.first().boundingBox();
  if (first === null) throw new Error('no country');
  await page.mouse.click(first.x + first.width / 2, first.y - 10);
  await expect(page.locator('[data-tile="tile-country"]').getByTestId('mark-badge')).toContainText(
    '1 marked',
  );
  await expect(sankey.getByTestId('sankey-share-info')).toHaveText(
    'A link’s marked share is given in its tooltip, not drawn.',
  );
  // Some flow is only part the country's: its tooltip says how much.
  let said = false;
  for (let nth = 0; nth < flows && !said; nth += 1) {
    const at = await insideALink(page, 'tile-sankey', nth);
    await page.mouse.move(at.x, at.y);
    said = await expect(sankey)
      .toContainText(/Marked: \$[\d.]+K? of \$[\d.]+K?/, { timeout: 1000 })
      .then(
        () => true,
        () => false,
      );
  }
  expect(said).toBe(true);

  // Cross-filter mode: a link filters the other tile by its tuple, in one chip.
  const crossing = await sankeyDashboard(request, 'crossFilter');
  await page.goto(`/explore/dashboards/${crossing.id}`);
  await expect(page.getByRole('heading', { name: crossing.title })).toBeVisible();
  await expect(sankey.locator('svg path[fill-opacity="0.4"]').first()).toBeVisible();
  // Laid out once its links stand still.
  await expect
    .poll(() => sankey.locator('svg path[fill-opacity="0.4"]').first().boundingBox())
    .not.toBeNull();
  const crossLink = await insideALink(page, 'tile-sankey');
  await page.mouse.click(crossLink.x, crossLink.y);
  const chips = page.getByTestId('cross-filter-chip');
  await expect(chips).toHaveCount(1);
  await expect(chips.locator('.cross-chip__what')).toHaveText(/^.*Status: \S+ · .*Category: .+$/);
});

/** A dashboard of parallel coordinates (customers across three measures) and a bar by country. */
async function parallelDashboard(
  request: APIRequestContext,
  mode: 'markings' | 'crossFilter' | 'highlight' | 'markingsNone',
) {
  const title = `Parallel ${mode} ${String(Date.now())}-${String(Math.round(Math.random() * 1e6))}`;
  const dashboard = (await (
    await request.post(`${API}/api/documents`, {
      data: { kind: 'dashboard', title, ...IN_MY_WORKSPACE },
    })
  ).json()) as { id: string };
  const items = [];
  for (const [tile, chartType, measures, dimensions] of [
    [
      'tile-parallel',
      'parallel',
      ['orders.count', 'orders.total_amount', 'orders.average_amount'],
      // A line an order: 240 of them, enough to brush.
      ['orders.id'],
    ],
    ['tile-country', 'bar', ['orders.count'], ['customers.country']],
  ] as const) {
    const chart = (await (
      await request.post(`${API}/api/documents`, {
        data: { kind: 'chart', title: tile, ...IN_MY_WORKSPACE },
      })
    ).json()) as { id: string };
    const saved = await request.put(`${API}/api/documents/chart/${chart.id}`, {
      data: {
        version: 1,
        body: {
          schemaVersion: 1,
          title: tile,
          owner: 'admin',
          localToDashboardId: dashboard.id,
          chart: {
            source: { cube: 'orders' },
            wells: { measures: [...measures], dimensions: [...dimensions], timeDimensions: [] },
            chartType,
          },
        },
      },
    });
    expect(saved.ok(), await saved.text()).toBe(true);
    items.push({
      id: tile,
      kind: 'chart',
      w: 6,
      h: 40,
      chartId: chart.id,
      // "(None)": a tile that marks with nothing (AC-085).
      ...(mode === 'markingsNone' && tile === 'tile-parallel' ? { marksWith: '' } : {}),
    });
  }
  const placed = await request.put(`${API}/api/documents/dashboard/${dashboard.id}`, {
    data: {
      version: 1,
      body: {
        schemaVersion: 1,
        title,
        ...IN_MY_WORKSPACE,
        owner: 'admin',
        settings: {
          width: 'fixed',
          interactions:
            mode === 'markings' || mode === 'markingsNone'
              ? { mode: 'markings' }
              : {
                  mode: 'crossFilter',
                  crossFilter: { defaultAction: mode === 'highlight' ? 'highlight' : 'filter' },
                },
        },
        markings: [{ id: 'm1', name: 'Marking', slot: 'mk1', isDefault: true }],
        pages: [{ id: 'only', title: 'Only', items }],
      },
    },
  });
  expect(placed.ok(), await placed.text()).toBe(true);
  return { id: dashboard.id, title };
}

/**
 * Each line of a parallel tile as drawn — in the page a 1.5 px path through
 * the axes (T982's e2e) — its points on the page, axis by axis, and its opacity.
 */
const linesOf = (page: Page, tile: string) =>
  page
    .locator(`[data-tile="${tile}"] svg path[stroke-width="1.5"][fill="none"]`)
    .evaluateAll((all) =>
      all.map((line) => {
        const matrix = (line as SVGGraphicsElement).getScreenCTM();
        const numbers = (line.getAttribute('d') ?? '').match(/-?[\d.]+/g)?.map(Number) ?? [];
        const points: { x: number; y: number }[] = [];
        for (let at = 0; at + 1 < numbers.length; at += 2) {
          const point = new DOMPoint(numbers[at], numbers[at + 1]);
          const on = matrix === null ? point : point.matrixTransform(matrix);
          points.push({ x: on.x, y: on.y });
        }
        return { points, opacity: Number(line.getAttribute('stroke-opacity') ?? 1) };
      }),
    );

/** A press, a path and a release, with the keys held throughout. */
/**
 * A dashboard of a Map on the e2e countries cube (`countries.ts`), with or
 * without its Points layer, beside a bar of the same cube's total by
 * country, in Markings or cross-filter mode (T978).
 */
async function mapDashboard(
  request: APIRequestContext,
  project: string,
  mode: 'markings' | 'crossFilter',
  points: boolean,
) {
  const cube = await publishCountryCube(request, project);
  const title = `Map ${mode} ${String(Date.now())}-${String(Math.round(Math.random() * 1e6))}`;
  const dashboard = (await (
    await request.post(`${API}/api/documents`, {
      data: { kind: 'dashboard', title, ...IN_MY_WORKSPACE },
    })
  ).json()) as { id: string };
  const items = [];
  for (const [tile, chartType, options] of [
    [
      'tile-map',
      'map',
      points
        ? { map: { points: { location: `${cube}.location`, size: `${cube}.total` } } }
        : undefined,
    ],
    ['tile-bar', 'bar', undefined],
  ] as const) {
    const chart = (await (
      await request.post(`${API}/api/documents`, {
        data: { kind: 'chart', title: tile, ...IN_MY_WORKSPACE },
      })
    ).json()) as { id: string };
    const saved = await request.put(`${API}/api/documents/chart/${chart.id}`, {
      data: {
        version: 1,
        body: {
          schemaVersion: 1,
          title: tile,
          owner: 'admin',
          localToDashboardId: dashboard.id,
          chart: {
            source: { cube },
            wells: { measures: [`${cube}.total`], dimensions: [`${cube}.iso3`], timeDimensions: [] },
            chartType,
            ...(options === undefined ? {} : { options }),
          },
        },
      },
    });
    expect(saved.ok(), await saved.text()).toBe(true);
    items.push({ id: tile, kind: 'chart', w: 6, h: 40, chartId: chart.id });
  }
  const placed = await request.put(`${API}/api/documents/dashboard/${dashboard.id}`, {
    data: {
      version: 1,
      body: {
        schemaVersion: 1,
        title,
        ...IN_MY_WORKSPACE,
        owner: 'admin',
        settings: {
          width: 'fixed',
          interactions:
            mode === 'markings'
              ? { mode: 'markings' }
              : { mode: 'crossFilter', crossFilter: { defaultAction: 'filter' } },
        },
        markings: [{ id: 'm1', name: 'Marking', slot: 'mk1', isDefault: true }],
        pages: [{ id: 'only', title: 'Only', items }],
      },
    },
  });
  expect(placed.ok(), await placed.text()).toBe(true);
  return { id: dashboard.id, title, cube };
}

/** A map tile's points as drawn: slot 2's circles, by size, with their centres. */
const pointsOn = async (page: Page) =>
  (
    await page
      .locator('[data-tile="tile-map"] svg path[fill="#eb6834"]')
      .evaluateAll((paths) =>
        paths.map((path) => {
          const box = path.getBoundingClientRect();
          return { size: box.width, x: box.x + box.width / 2, y: box.y + box.height / 2 };
        }),
      )
  ).sort((one, other) => one.size - other.size);

/**
 * T978 / AC-627: THE SYSTEM SHALL mark a region as its member and a point as
 * its member; a rectangle or lasso marking the points inside it, or, with no
 * Points layer, the regions it touches; marking drawn with outline and fade,
 * never by fill; and as a cross-filter source a region or point filters the
 * others to its member.
 * `Fails when: a lasso marks points outside it, or regions while a Points
 * layer shows; a marked region changes fill; or a region or point doesn't
 * filter.`
 */
test('a map marks the points a rectangle takes in, else the regions it touches, and cross-filters by a region or a point', async ({
  page,
  request,
}, testInfo) => {
  const withPoints = await mapDashboard(request, testInfo.project.name, 'markings', true);
  await page.goto(`/explore/dashboards/${withPoints.id}`);
  await expect(page.getByRole('heading', { name: withPoints.title })).toBeVisible();
  const tile = page.locator('[data-tile="tile-map"]');
  const badge = tile.getByTestId('mark-badge');
  await expect.poll(async () => (await pointsOn(page)).length).toBe(5);
  // By size: GUF 10, SGP 40, NOR 80, FRA 120, USA 300. Round Oslo and Paris.
  const [, , oslo, paris] = await pointsOn(page);
  const box = {
    x0: Math.min(oslo!.x, paris!.x) - 14,
    y0: Math.min(oslo!.y, paris!.y) - 14,
    x1: Math.max(oslo!.x, paris!.x) + 14,
    y1: Math.max(oslo!.y, paris!.y) + 14,
  };
  await dragAlong(page, { x: box.x0, y: box.y0 }, { x: box.x1, y: box.y1 });
  await expect(badge).toContainText('2 marked');
  // The two marked, outlined; the rest faded; no region marked (their fills kept).
  await expect(page.getByTestId('mark-chip')).toContainText(/Location/);

  // With no Points layer, the same rectangle marks the regions it touches.
  const regionsOnly = await mapDashboard(request, testInfo.project.name, 'markings', false);
  await page.goto(`/explore/dashboards/${regionsOnly.id}`);
  await expect(page.getByRole('heading', { name: regionsOnly.title })).toBeVisible();
  await expect(tile.locator('svg path[fill^="rgb"]').first()).toBeAttached();
  await dragAlong(page, { x: box.x0, y: box.y0 }, { x: box.x1, y: box.y1 });
  await expect(badge).toContainText('2 marked');
  await expect(page.getByTestId('mark-chip')).toContainText(/Iso3/);

  // Cross-filtering, a point filters the bar to its place's country.
  const crossing = await mapDashboard(request, testInfo.project.name, 'crossFilter', true);
  await page.goto(`/explore/dashboards/${crossing.id}`);
  await expect(page.getByRole('heading', { name: crossing.title })).toBeVisible();
  await expect.poll(async () => (await pointsOn(page)).length).toBe(5);
  const bars = page.locator('[data-tile="tile-bar"] svg');
  await expect(bars).toContainText('USA');
  const [, , , france] = await pointsOn(page);
  await page.mouse.click(france!.x, france!.y);
  const chips = page.getByTestId('cross-filter-chip');
  await expect(chips).toHaveCount(1);
  await expect(chips.locator('.cross-chip__what')).toContainText('48.8566,2.3522');
  await expect(bars).not.toContainText('USA');
  await expect(bars).toContainText('FRA');
});

async function dragAlong(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
  keys: 'ControlOrMeta'[] = [],
) {
  for (const key of keys) await page.keyboard.down(key);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await page.mouse.up();
  for (const key of keys) await page.keyboard.up(key);
}

/**
 * T983 / AC-599: THE SYSTEM SHALL mark a parallel-coordinate line as its
 * member on a click; and WHEN the author drags along an axis, brush that
 * range, marking the members whose lines pass through every brushed range,
 * Ctrl/⌘ adding a brush, stored as a member list of at most 1,000 (AC-102),
 * not a measure range; and as a cross-filter source filter the others to the
 * brushed members with one chip ("Product: 6 brushed in Margin %").
 * `Fails when: a member whose line misses a brushed range is marked; the
 * marking stores a measure range; a second brush replaces the first while
 * Ctrl/⌘ is held; or the chip reads otherwise.`
 */
test('parallel coordinates mark a line by a click, brush along axes with Ctrl adding a brush, and cross-filter by the brushed members', async ({
  page,
  request,
}) => {
  const { id, title } = await parallelDashboard(request, 'markings');
  await page.goto(`/explore/dashboards/${id}`);
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  const tile = page.locator('[data-tile="tile-parallel"]');
  const badge = tile.getByTestId('mark-badge');
  const drawnLines = tile.locator('svg path[stroke-width="1.5"][fill="none"]');
  await expect(drawnLines.first()).toBeVisible();
  const lines = await linesOf(page, 'tile-parallel');
  expect(lines.length).toBeGreaterThan(5);
  const base = lines[0]!.opacity;

  // Where each axis stands, and its ends: the highest and lowest of its lines.
  const axis = (at: number) => {
    const ys = lines.map((line) => line.points[at]!.y);
    return { x: lines[0]!.points[at]!.x, top: Math.min(...ys), bottom: Math.max(...ys) };
  };
  /** The lines whose point on this axis is between these heights, inclusive. */
  const within = (at: number, top: number, bottom: number, slack: number) =>
    lines
      .map((line, index) => ({ index, y: line.points[at]!.y }))
      .filter(({ y }) => y >= top - slack && y <= bottom + slack)
      .map(({ index }) => index);

  // A click on a line marks its member.
  const lonely = lines[0]!.points[0]!;
  await page.mouse.click(lonely.x, lonely.y);
  await expect(badge).toContainText('1 marked');

  // A drag along Total Amount brushes it: the lines through it, and only them.
  const total = axis(1);
  const [top, bottom] = [
    total.top + (total.bottom - total.top) * 0.2,
    total.top + (total.bottom - total.top) * 0.8,
  ];
  await dragAlong(page, { x: total.x, y: top }, { x: total.x, y: bottom });
  const inside = within(1, top, bottom, -1);
  const loose = within(1, top, bottom, 1);
  expect(inside.length).toBeGreaterThan(1);
  const count = async () =>
    Number(/(\d+) marked/.exec((await badge.textContent()) ?? '')?.[1] ?? -1);
  await expect.poll(count).toBeGreaterThanOrEqual(inside.length);
  const marked = await count();
  expect(marked).toBeGreaterThan(1);
  expect(marked).toBeLessThanOrEqual(loose.length);
  // Drawn: its band on the axis, the marked lines as they were, the rest faded.
  await expect(tile.locator('svg path[fill-opacity="0.3"]')).toHaveCount(1);
  const drawn = await linesOf(page, 'tile-parallel');
  expect(drawn.filter((line) => line.opacity < base).length).toBe(lines.length - marked);

  // With Ctrl, a brush on Average Amount is added, not in place of the first:
  // the lines through both.
  const average = axis(2);
  const [low, high] = [
    average.top + (average.bottom - average.top) * 0.4,
    average.top + (average.bottom - average.top) * 1,
  ];
  await dragAlong(page, { x: average.x, y: low }, { x: average.x, y: high + 2 }, ['ControlOrMeta']);
  await expect(tile.locator('svg path[fill-opacity="0.3"]')).toHaveCount(2);
  const both = inside.filter((index) => within(2, low, high, -1).includes(index));
  const bothLoose = loose.filter((index) => within(2, low, high, 1).includes(index));
  await expect.poll(count).toBeLessThanOrEqual(Math.min(bothLoose.length, marked));
  expect(await count()).toBeGreaterThanOrEqual(both.length);
  // The marking is the members, said by name, not a range of an amount.
  await expect(page.getByTestId('mark-chip')).toContainText(/ID: /);
  await expect(page.getByTestId('mark-chip')).not.toContainText(/ to /);

  /**
   * T984 / AC-600: WHILE a dashboard is in Markings mode, THE SYSTEM SHALL
   * give each parallel-coordinate axis a From and a To slider under the chart
   * (`input type="range"`), named "‹measure› from" and "‹measure› to",
   * setting that axis's brush as a drag does, reached with Tab and moved with
   * ← and →. `Fails when: an axis lacks either slider, or its name; moving a
   * slider marks other members than the same drag would; or a slider can't
   * be reached or moved from the keyboard.`
   */
  const sliders = tile.getByTestId('parallel-sliders');
  await expect(sliders.locator('input[type="range"]')).toHaveCount(6);
  for (const measure of ['Count', 'Total Amount', 'Average Amount'])
    for (const end of ['from', 'to'])
      await expect(
        sliders.getByRole('slider', { name: new RegExp(`${measure} ${end}$`) }),
      ).toHaveCount(1);
  // Reached with Tab: from Total Amount's From to its To.
  const totalFrom = sliders.getByRole('slider', { name: /Total Amount from$/ });
  await totalFrom.focus();
  await page.keyboard.press('Tab');
  await expect(sliders.getByRole('slider', { name: /Total Amount to$/ })).toBeFocused();
  // Moved with →: Total Amount from a fifth of the way up to where its drag
  // ended, its other brush (Average Amount) kept, as a Ctrl-drag would.
  await totalFrom.focus();
  await page.keyboard.press('Home');
  for (let step = 0; step < 20; step += 1) await page.keyboard.press('ArrowRight');
  const fifth = total.bottom - (total.bottom - total.top) * 0.2;
  const keyed = within(1, top, fifth, 1).filter((index) => within(2, low, high, 1).includes(index));
  const keyedStrict = within(1, top, fifth, -1).filter((index) =>
    within(2, low, high, -1).includes(index),
  );
  await expect.poll(count).toBeLessThanOrEqual(keyed.length);
  expect(await count()).toBeGreaterThanOrEqual(keyedStrict.length);
  await expect(tile.locator('svg path[fill-opacity="0.3"]')).toHaveCount(2);

  /**
   * T985 / AC-601: THE SYSTEM SHALL give parallel coordinates a text
   * alternative naming the members, measures, scale and any brush …, and a
   * table view of member and measures with marked rows bold and a left rule.
   * `Fails when: a part of the text alternative is missing, or the table
   * lacks a measure or doesn't show marked rows.`
   */
  const now = await count();
  // Through both brushes, the one the keys last set last.
  await expect(tile.getByTestId('chart-text-alternative')).toHaveText(
    new RegExp(
      `^Parallel coordinates of 240 .+ across 3 measures, each axis min to max\\. ${String(now)} marked through .*Average Amount \\$[\\d,.]+–\\$[\\d,.]+ and .*Total Amount \\$[\\d,.]+–\\$[\\d,.]+\\.$`,
    ),
  );
  await viewAs(tile, 'table');
  await expect(tile.getByRole('columnheader')).toHaveText([
    /ID/,
    /Count/,
    /Total Amount/,
    /Average Amount/,
  ]);
  const markedRows = tile.locator('[data-testid="table-row"][data-marked="whole"]');
  const scroller = tile.getByTestId('data-table');
  for (let step = 0; step < 60 && (await markedRows.count()) === 0; step += 1)
    await scroller.evaluate((element) => {
      element.scrollTop += element.clientHeight / 2;
    });
  await expect(markedRows.first()).toBeVisible();
  await viewAs(tile, 'chart');

  // Cross-filtering, a brush filters the other tile to its members, in one chip.
  const crossing = await parallelDashboard(request, 'crossFilter');
  await page.goto(`/explore/dashboards/${crossing.id}`);
  await expect(page.getByRole('heading', { name: crossing.title })).toBeVisible();
  await expect(drawnLines.first()).toBeVisible();
  await dragAlong(page, { x: total.x, y: top }, { x: total.x, y: bottom });
  const chips = page.getByTestId('cross-filter-chip');
  await expect(chips).toHaveCount(1);
  await expect(chips.locator('.cross-chip__what')).toHaveText(
    /^.*ID: \d+ brushed in .*Total Amount$/,
  );
});

/**
 * Checkpoint 3's review (AC-599, AC-117, AC-600): a brush set to Highlight
 * asks the other tile's share by every brushed member, not the first; and a
 * tile that marks with no marking has no sliders, which could only snap back.
 */
test('a brush highlights the other tile by every brushed member, and a tile marking with none has no sliders', async ({
  page,
  request,
}) => {
  const { id, title } = await parallelDashboard(request, 'highlight');
  /** Each `orders.id` filter the page asks Cube for, by how many values it holds. */
  const asked: number[] = [];
  page.on('request', (sent) => {
    if (!sent.url().endsWith('/api/load') || sent.method() !== 'POST') return;
    const body = sent.postDataJSON() as {
      query?: { filters?: { member?: string; values?: unknown[] }[] };
    };
    for (const filter of body.query?.filters ?? [])
      if (filter.member === 'orders.id') asked.push(filter.values?.length ?? 0);
  });
  await page.goto(`/explore/dashboards/${id}`);
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  const tile = page.locator('[data-tile="tile-parallel"]');
  await expect(tile.locator('svg path[stroke-width="1.5"][fill="none"]').first()).toBeVisible();
  const lines = await linesOf(page, 'tile-parallel');
  const ys = lines.map((line) => line.points[1]!.y);
  const [top, bottom] = [Math.min(...ys), Math.max(...ys)];
  const x = lines[0]!.points[1]!.x;
  await dragAlong(
    page,
    { x, y: top + (bottom - top) * 0.2 },
    { x, y: top + (bottom - top) * 0.8 },
  );
  const brushed = lines.filter((line) => {
    const y = line.points[1]!.y;
    return y > top + (bottom - top) * 0.2 + 1 && y < top + (bottom - top) * 0.8 - 1;
  }).length;
  expect(brushed).toBeGreaterThan(1);
  // The bar chart's share: asked by every brushed order, never by one.
  await expect.poll(() => Math.max(0, ...asked)).toBeGreaterThanOrEqual(brushed);
  expect(asked).not.toContain(1);

  const none = await parallelDashboard(request, 'markingsNone');
  await page.goto(`/explore/dashboards/${none.id}`);
  await expect(page.getByRole('heading', { name: none.title })).toBeVisible();
  await expect(tile.locator('svg path[stroke-width="1.5"][fill="none"]').first()).toBeVisible();
  await expect(tile.getByTestId('parallel-sliders')).toHaveCount(0);
});
