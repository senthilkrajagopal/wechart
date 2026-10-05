import { expect, test, type APIRequestContext, type Locator, type Page } from '@playwright/test';

import { fieldPicker } from './cubePicker';
import { IN_MY_WORKSPACE } from './workspace';

/**
 * F9 — dashboard filters.
 *
 * T082 / AC-076: THE SYSTEM SHALL offer filter widgets for a date range with
 * presets, a list with search, a numeric range, and a checkbox list.
 * Fails when: a listed widget type cannot be added to a dashboard.
 *
 * Each test makes a dashboard of its own: saving changes it, and the three
 * browsers share one server.
 */
const API = 'http://localhost:4100/api';

async function makeDashboard(request: APIRequestContext) {
  const unique = `${String(Date.now())}-${String(Math.round(Math.random() * 1e6))}`;
  const title = `Filters ${unique}`;
  const dashboard = (await (
    await request.post(`${API}/documents`, {
      data: { kind: 'dashboard', title, ...IN_MY_WORKSPACE },
    })
  ).json()) as { id: string };
  await request.put(`${API}/documents/dashboard/${dashboard.id}`, {
    data: {
      version: 1,
      body: {
        schemaVersion: 1,
        title,
        ...IN_MY_WORKSPACE,
        owner: 'admin',
        settings: { width: 'fixed' },
        pages: [{ id: 'only', title: 'Only', items: [] }],
      },
    },
  });
  return { id: dashboard.id, title };
}

/**
 * A dashboard of its own with two page tabs, "Sales" and "Operations", each
 * holding one chart local to it — orders counted by status, as a bar — titled
 * "Sales by status" and "Operations by status".
 */
async function makeTwoTabDashboard(
  request: APIRequestContext,
  filters: readonly Record<string, unknown>[] = [],
) {
  const { id, title } = await makeDashboard(request);
  const chartOn = async (chartTitle: string) => {
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
          localToDashboardId: id,
          chart: {
            source: { cube: 'orders' },
            wells: {
              measures: ['orders.count'],
              dimensions: ['orders.status'],
              timeDimensions: [],
            },
            chartType: 'bar',
          },
        },
      },
    });
    return chart.id;
  };
  const sales = await chartOn('Sales by status');
  const operations = await chartOn('Operations by status');
  await request.put(`${API}/documents/dashboard/${id}`, {
    data: {
      version: 2,
      body: {
        schemaVersion: 1,
        title,
        ...IN_MY_WORKSPACE,
        owner: 'admin',
        settings: { width: 'fixed' },
        pages: [
          {
            id: 'sales',
            title: 'Sales',
            items: [{ id: 'tile-sales', kind: 'chart', w: 6, h: 40, chartId: sales }],
          },
          {
            id: 'operations',
            title: 'Operations',
            items: [{ id: 'tile-operations', kind: 'chart', w: 6, h: 40, chartId: operations }],
          },
        ],
        filters,
      },
    },
  });
  return { id, title };
}

/**
 * A dashboard of its own with one page, "Overview", and one bar-chart tile per
 * chart given — each chart local to it, counting `measure` by `dimension` on
 * `source`, a cube or a view.
 */
async function makeChartsDashboard(
  request: APIRequestContext,
  charts: readonly { tile: string; source: string; measure: string; dimension: string }[],
  filters: readonly Record<string, unknown>[],
) {
  const { id, title } = await makeDashboard(request);
  const items = [];
  for (const each of charts) {
    const chart = (await (
      await request.post(`${API}/documents`, {
        data: { kind: 'chart', title: each.tile, ...IN_MY_WORKSPACE },
      })
    ).json()) as { id: string };
    await request.put(`${API}/documents/chart/${chart.id}`, {
      data: {
        version: 1,
        body: {
          schemaVersion: 1,
          title: each.tile,
          owner: 'admin',
          localToDashboardId: id,
          chart: {
            source: { cube: each.source },
            wells: { measures: [each.measure], dimensions: [each.dimension], timeDimensions: [] },
            chartType: 'bar',
          },
        },
      },
    });
    items.push({ id: each.tile, kind: 'chart', w: 6, h: 40, chartId: chart.id });
  }
  await request.put(`${API}/documents/dashboard/${id}`, {
    data: {
      version: 2,
      body: {
        schemaVersion: 1,
        title,
        ...IN_MY_WORKSPACE,
        owner: 'admin',
        settings: { width: 'fixed' },
        pages: [{ id: 'overview', title: 'Overview', items }],
        filters,
      },
    },
  });
  return { id, title };
}

const filterBar = (page: Page) => page.getByRole('region', { name: 'Filters' });

/** The seeded model's title for `orders.ordered_at`. */
const ORDERED_AT = 'Orders Ordered at';

/** The filter pill of a kind: the bar's only one of that kind. */
const pill = (page: Page, widget: string) => filterBar(page).locator(`[data-widget="${widget}"]`);

/**
 * Opens a filter pill's popover, where its control is (AC-187); left open if
 * open. While editing, a filter not yet selected takes two presses: the
 * first selects it (T468).
 */
async function open(filter: Locator) {
  const summary = filter.locator('button[aria-expanded]');
  if ((await summary.getAttribute('aria-expanded')) === 'true') return;
  await summary.click();
  if ((await summary.getAttribute('aria-expanded')) !== 'true') await summary.click();
  await expect(summary).toHaveAttribute('aria-expanded', 'true');
}

/** The edit sidebar's Properties, where a selected filter's field, scope and Remove are (T468). */
const properties = (page: Page) =>
  page.getByRole('complementary', { name: 'Edit sidebar' }).getByRole('tabpanel');

async function addFilter(page: Page, widget: string, member: string) {
  // Adding one leaves the sidebar on its Properties (T468): back to Add for the next.
  await page
    .getByRole('complementary', { name: 'Edit sidebar' })
    .getByRole('tab', { name: 'Add' })
    .click();
  await page.getByTestId('add-filter').click();
  await page.getByTestId(`add-filter-${widget}`).click();
  // Selected, its field picker in Properties (T468, UX-031).
  await fieldPicker(properties(page)).selectOption(member);
}

test('each of the four filter widgets can be added to a dashboard, and is kept', async ({
  page,
  request,
}) => {
  const { id, title } = await makeDashboard(request);
  await page.goto(`/explore/dashboards/${id}`);
  await expect(page.getByRole('heading', { name: title })).toBeVisible();

  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page
    .getByRole('complementary', { name: 'Edit sidebar' })
    .getByRole('tab', { name: 'Add' })
    .click();

  await addFilter(page, 'dateRange', 'orders.ordered_at');
  await addFilter(page, 'list', 'orders.status');
  await addFilter(page, 'range', 'orders.id');
  await addFilter(page, 'checkbox', 'products.category');

  // Each shows its own control, on the model's real fields and values —
  // labelled with the field's full title, since two fields' short titles are
  // both "Name".
  await open(pill(page, 'dateRange'));
  await expect(filterBar(page).getByLabel(ORDERED_AT, { exact: true })).toBeVisible();
  await open(pill(page, 'list'));
  await expect(filterBar(page).getByRole('searchbox', { name: /^Search / })).toBeVisible();
  await open(pill(page, 'range'));
  await expect(filterBar(page).getByLabel(/ from$/)).toBeVisible();
  await open(pill(page, 'checkbox'));
  await expect(filterBar(page).getByRole('checkbox').first()).toBeVisible();

  await page
    .getByRole('toolbar', { name: 'Dashboard editing' })
    .getByRole('button', { name: 'Save', exact: true })
    .click();
  await expect(page.getByRole('toolbar', { name: 'Dashboard editing' })).toBeHidden();

  // Kept with the dashboard: a reload shows all four, each on its field.
  await page.reload();
  await expect(filterBar(page).locator('[data-widget]')).toHaveCount(4);
  expect(
    await filterBar(page)
      .locator('[data-widget]')
      .evaluateAll((filters) => filters.map((filter) => filter.getAttribute('data-widget'))),
  ).toEqual(['dateRange', 'list', 'range', 'checkbox']);
  await open(pill(page, 'dateRange'));
  await expect(filterBar(page).getByLabel(ORDERED_AT, { exact: true })).toBeVisible();

  // A reader can use them: the date range's presets are there to choose.
  await filterBar(page).getByLabel(ORDERED_AT, { exact: true }).selectOption('last 30 days');
  await expect(filterBar(page).getByLabel(ORDERED_AT, { exact: true })).toHaveValue('last 30 days');
});

/**
 * T083 / AC-077: WHEN a filter is added, THE SYSTEM SHALL scope it to the
 * dashboard, a page tab or named tiles, and show its scope on the widget
 * (direction.md rule 14).
 */
test('a filter is scoped to the dashboard, a tab or chosen tiles, and shows it', async ({
  page,
  request,
}) => {
  const { id, title } = await makeTwoTabDashboard(request);
  await page.goto(`/explore/dashboards/${id}`);
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page
    .getByRole('complementary', { name: 'Edit sidebar' })
    .getByRole('tab', { name: 'Add' })
    .click();
  await addFilter(page, 'list', 'orders.status');

  const badge = filterBar(page).getByTestId('scope-badge');
  await expect(badge).toHaveText('Dashboard');

  // Its scope in Properties, the filter selected (T468, UX-031).
  const appliesTo = properties(page).getByLabel('Applies to');
  await appliesTo.selectOption({ label: 'Chosen tiles' });
  await properties(page)
    .getByRole('checkbox', { name: 'Operations by status (Operations)' })
    .check();
  await expect(badge).toHaveText('Tile: Operations by status');

  await appliesTo.selectOption({ label: 'Tab: Sales' });
  await expect(badge).toHaveText('Tab: Sales');

  await page
    .getByRole('toolbar', { name: 'Dashboard editing' })
    .getByRole('button', { name: 'Save', exact: true })
    .click();
  await expect(page.getByRole('toolbar', { name: 'Dashboard editing' })).toBeHidden();

  // Kept, and shown to a reader in view mode.
  await page.reload();
  await expect(filterBar(page).getByTestId('scope-badge')).toHaveText('Tab: Sales');
});

/**
 * T084 / AC-078: WHEN a filter value changes, THE SYSTEM SHALL re-query every
 * tile in its scope and leave tiles outside the scope unchanged.
 * Fails when: a tile outside the scope re-queries, or a tile inside it keeps
 * the previous result.
 *
 * And AC-077's other half: a tab-scoped filter changes no tile on another tab.
 * The two charts are the same query — orders counted by status, 80 of each of
 * three — so every chart query sent once a value is set must carry it, and the
 * other tab's chart must still show all three.
 */
test('a value re-queries the tiles in its scope, and a tab’s filter leaves the other tab alone', async ({
  page,
  request,
}) => {
  const { id, title } = await makeTwoTabDashboard(request, [
    {
      id: 'f-status',
      widget: 'checkbox',
      member: 'orders.status',
      scope: { kind: 'page', pageId: 'sales' },
    },
  ]);
  await page.goto(`/explore/dashboards/${id}`);
  await expect(page.getByRole('heading', { name: title })).toBeVisible();

  const sales = page.locator('[data-tile="tile-sales"]');
  await sales.getByTestId('toggle-table-view').click();
  await expect(sales.getByTestId('table-row')).toHaveCount(3);

  const asked: Record<string, unknown>[] = [];
  page.on('request', (sent) => {
    if (!sent.url().endsWith('/api/load')) return;
    const { query } = sent.postDataJSON() as { query: Record<string, unknown> };
    if (query['measures'] !== undefined) asked.push(query);
  });

  await open(pill(page, 'checkbox'));
  await filterBar(page).getByRole('checkbox', { name: 'completed' }).check();

  // In scope: asked again with the value, and drawn from the answer — the
  // table view kept through it.
  await expect(sales.getByTestId('table-row')).toHaveCount(1);
  await expect(sales.getByTestId('table-row')).toContainText('completed');
  await expect(sales.getByTestId('chart-tile')).not.toHaveAttribute('aria-busy', 'true');
  expect(asked.length).toBeGreaterThan(0);
  for (const query of asked)
    expect(query['filters']).toEqual([
      { member: 'orders.status', operator: 'equals', values: ['completed'] },
    ]);

  // Changed again: asked again, with both.
  await filterBar(page).getByRole('checkbox', { name: 'shipped' }).check();
  await expect(sales.getByTestId('table-row')).toHaveCount(2);
  // Closed, it no longer lies over the page tabs.
  await page.keyboard.press('Escape');

  // Out of scope: the other tab's chart shows all three, and was never asked
  // with the filter — nor asked again at all, since every query sent since the
  // first value carries it.
  await page.getByRole('tab', { name: 'Operations' }).click();
  const operations = page.locator('[data-tile="tile-operations"]');
  await operations.getByTestId('toggle-table-view').click();
  await expect(operations.getByTestId('table-row')).toHaveCount(3);
  for (const query of asked) expect(query['filters']).toBeDefined();
});

/**
 * T089 / AC-083: WHEN a date filter uses a relative preset such as "last 30
 * days", THE SYSTEM SHALL send it to Cube as that relative range rather than
 * as fixed dates.
 * Fails when: the query contains fixed dates for a relative preset.
 */
test('a relative preset is sent to Cube as those words, not as dates', async ({
  page,
  request,
}) => {
  const { id, title } = await makeTwoTabDashboard(request, [
    { id: 'f-ordered', widget: 'dateRange', member: 'orders.ordered_at' },
  ]);
  await page.goto(`/explore/dashboards/${id}`);
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  const sales = page.locator('[data-tile="tile-sales"]');
  await expect(sales.getByTestId('chart-canvas')).toBeVisible();

  const sent = page.waitForRequest((request) => {
    if (!request.url().endsWith('/api/load')) return false;
    const { query } = request.postDataJSON() as { query: Record<string, unknown> };
    return query['timeDimensions'] !== undefined;
  });
  await open(pill(page, 'dateRange'));
  await filterBar(page).getByLabel(ORDERED_AT, { exact: true }).selectOption('last 30 days');

  const { query } = (await sent).postDataJSON() as { query: Record<string, unknown> };
  expect(query['timeDimensions']).toEqual([
    { dimension: 'orders.ordered_at', dateRange: 'last 30 days' },
  ]);
  // Cube answered it: the tile draws its chart, not "Could not load this chart".
  await expect(sales.getByTestId('chart-tile')).not.toHaveAttribute('aria-busy', 'true');
  await expect(sales.getByTestId('chart-tile')).toBeVisible();
  await expect(sales.getByRole('alert')).toHaveCount(0);
});

/**
 * T087 / AC-081: WHEN filters are active, THE SYSTEM SHALL include them in the
 * dashboard's URL so that opening that URL reproduces them.
 * Fails when: opening the URL in a new session produces different filter
 * values.
 */
test('the filters in effect are in the URL, and the URL opens with them', async ({
  page,
  browser,
  request,
}) => {
  const { id, title } = await makeTwoTabDashboard(request, [
    { id: 'f-status', widget: 'checkbox', member: 'orders.status' },
    { id: 'f-ordered', widget: 'dateRange', member: 'orders.ordered_at' },
  ]);
  // Every URL write the app makes, to catch one that repeats on its own.
  await page.addInitScript(() => {
    const counted = window as unknown as { urlWrites: number };
    counted.urlWrites = 0;
    const replace = history.replaceState.bind(history);
    history.replaceState = (...args: Parameters<History['replaceState']>) => {
      counted.urlWrites += 1;
      replace(...args);
    };
  });
  await page.goto(`/explore/dashboards/${id}`);
  await expect(page.getByRole('heading', { name: title })).toBeVisible();

  await open(pill(page, 'checkbox'));
  await filterBar(page).getByRole('checkbox', { name: 'shipped' }).check();
  await open(pill(page, 'dateRange'));
  await filterBar(page).getByLabel(ORDERED_AT, { exact: true }).selectOption('this year');

  const inUrl = () => {
    const raw = new URL(page.url()).searchParams.get('filters');
    return raw === null ? null : (JSON.parse(raw) as unknown);
  };
  await expect.poll(inUrl).toEqual([
    { id: 'f-status', member: 'orders.status', value: { kind: 'values', values: ['shipped'] } },
    {
      id: 'f-ordered',
      member: 'orders.ordered_at',
      value: { kind: 'preset', preset: 'this year' },
    },
  ]);
  // Written as values change, not over and over.
  const writes = await page.evaluate(() => (window as unknown as { urlWrites: number }).urlWrites);
  expect(writes).toBeGreaterThan(0);
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => (window as unknown as { urlWrites: number }).urlWrites)).toBe(
    writes,
  );

  // A new session, opening that URL: the same values, and the tiles filtered.
  const other = await browser.newContext();
  const opened = await other.newPage();
  await opened.goto(page.url());
  await expect(opened.getByRole('heading', { name: title })).toBeVisible();
  await open(pill(opened, 'checkbox'));
  await expect(filterBar(opened).getByRole('checkbox', { name: 'shipped' })).toBeChecked();
  await expect(filterBar(opened).getByRole('checkbox', { name: 'completed' })).not.toBeChecked();
  await open(pill(opened, 'dateRange'));
  await expect(filterBar(opened).getByLabel(ORDERED_AT, { exact: true })).toHaveValue('this year');
  // Closed: under the page tabs (AC-187), an open popover lies over the tiles.
  await opened.keyboard.press('Escape');
  const sales = opened.locator('[data-tile="tile-sales"]');
  await sales.getByTestId('toggle-table-view').click();
  await expect(sales.getByTestId('table-row')).toHaveCount(1);
  await expect(sales.getByTestId('table-row')).toContainText('shipped');
  await other.close();

  // Cleared, they leave the URL.
  await filterBar(page).getByRole('button', { name: 'Clear Orders Status' }).click();
  await filterBar(page)
    .getByRole('button', { name: `Clear ${ORDERED_AT}` })
    .click();
  await expect.poll(inUrl).toBeNull();
});

/**
 * Found by T087's review. The filters are written into the URL with replace,
 * but opening the chart editor pushes an entry (T196, AC-002), and Back leaves
 * it ahead. Change a filter, go Forward onto that older entry, close the
 * editor, and the URL held the older filters while the dashboard showed the
 * newer ones. Opening the chart editor with filters set must keep them in the
 * URL too.
 */
test('the URL keeps the dashboard’s filters through the chart editor, Back and Forward', async ({
  page,
  request,
}) => {
  const { id, title } = await makeTwoTabDashboard(request, [
    { id: 'f-status', widget: 'checkbox', member: 'orders.status' },
  ]);
  await page.goto(`/explore/dashboards/${id}`);
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  const picked = () => {
    const raw = new URL(page.url()).searchParams.get('filters');
    if (raw === null) return null;
    return (JSON.parse(raw) as { value: { values: string[] } }[]).map((each) => each.value.values);
  };

  await open(pill(page, 'checkbox'));
  await filterBar(page).getByRole('checkbox', { name: 'shipped' }).check();
  await expect.poll(picked).toEqual([['shipped']]);

  // Through the editor: open, and close by its own Back.
  await page.getByTestId('edit-chart-tile-sales').click();
  await expect(page.getByTestId('chart-editor-overlay')).toBeVisible();
  await expect.poll(picked).toEqual([['shipped']]);
  await page.getByTestId('editor-back').click();
  await expect(page.getByTestId('chart-editor-overlay')).toBeHidden();
  await expect.poll(picked).toEqual([['shipped']]);

  // A newer value, then Forward onto the editor's entry, which reopens it.
  await open(pill(page, 'checkbox'));
  await filterBar(page).getByRole('checkbox', { name: 'completed' }).check();
  await expect.poll(picked).toEqual([['shipped', 'completed']]);
  await page.goForward();
  await expect(page.getByTestId('chart-editor-overlay')).toBeVisible();
  await page.getByTestId('editor-back').click();
  await expect(page.getByTestId('chart-editor-overlay')).toBeHidden();

  // The URL says what the dashboard shows.
  await open(pill(page, 'checkbox'));
  await expect(filterBar(page).getByRole('checkbox', { name: 'completed' })).toBeChecked();
  await expect.poll(picked).toEqual([['shipped', 'completed']]);
});

/**
 * T085 / AC-079: WHEN a filter's member is not reachable from a tile's cube or
 * view, THE SYSTEM SHALL leave that tile unfiltered and mark it as not covered
 * by the filter.
 * Fails when: the tile shows a query error, or is silently left unfiltered
 * with no indication.
 *
 * On the seed model plus its one view, `order_summary` (orders' count and
 * status only). A filter on products' category reaches the orders cube, which
 * joins products, but not the view, which does not offer it.
 */
test('a tile a filter cannot reach is left unfiltered and marked, with no error', async ({
  page,
  request,
}) => {
  const { id, title } = await makeChartsDashboard(
    request,
    [
      {
        tile: 'tile-orders',
        source: 'orders',
        measure: 'orders.count',
        dimension: 'orders.status',
      },
      {
        tile: 'tile-summary',
        source: 'order_summary',
        measure: 'order_summary.count',
        dimension: 'order_summary.status',
      },
    ],
    [{ id: 'f-category', widget: 'checkbox', member: 'products.category' }],
  );
  await page.goto(`/explore/dashboards/${id}`);
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  const orders = page.locator('[data-tile="tile-orders"]');
  const summary = page.locator('[data-tile="tile-summary"]');
  await expect(summary.getByTestId('chart-canvas')).toBeVisible();

  const asked: Record<string, unknown>[] = [];
  page.on('request', (sent) => {
    if (!sent.url().endsWith('/api/load')) return;
    const { query } = sent.postDataJSON() as { query: Record<string, unknown> };
    if (query['measures'] !== undefined) asked.push(query);
  });
  await open(pill(page, 'checkbox'));
  await filterBar(page).getByRole('checkbox', { name: 'Components' }).check();

  // The view's tile: not asked with the filter, marked, and no error.
  await expect(summary.getByTestId('not-covered')).toHaveText('Not filtered by Products Category');
  await expect(summary.getByRole('alert')).toHaveCount(0);
  await expect(summary.getByTestId('chart-canvas')).toBeVisible();
  // The cube's tile: filtered, and not marked.
  await expect.poll(() => asked.length).toBeGreaterThan(0);
  expect(asked.map((query) => (query['measures'] as string[])[0])).toEqual(
    asked.map(() => 'orders.count'),
  );
  await expect(orders.getByTestId('not-covered')).toHaveCount(0);
  await expect(orders.getByTestId('chart-tile')).not.toHaveAttribute('aria-busy', 'true');
  await expect(orders.getByRole('alert')).toHaveCount(0);
});

/**
 * Found by T085's review: the seed's customers and products share a join
 * component, but both join only *from* orders, so Cube cannot join them. A
 * chart on customers, filtered on products' category, is left unfiltered and
 * marked — and a second filter it can take still applies.
 */
test('a filter Cube cannot join to a tile leaves it unfiltered and marked; the others still apply', async ({
  page,
  request,
}) => {
  const { id, title } = await makeChartsDashboard(
    request,
    [
      {
        tile: 'tile-customers',
        source: 'customers',
        measure: 'customers.count',
        dimension: 'customers.country',
      },
    ],
    [
      { id: 'f-category', widget: 'checkbox', member: 'products.category' },
      { id: 'f-country', widget: 'list', member: 'customers.country' },
    ],
  );
  await page.goto(`/explore/dashboards/${id}`);
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  const customers = page.locator('[data-tile="tile-customers"]');
  await customers.getByTestId('toggle-table-view').click();
  const everyCountry = await customers.getByTestId('table-row').count();
  expect(everyCountry).toBeGreaterThan(1);

  await open(pill(page, 'checkbox'));
  await filterBar(page).getByRole('checkbox', { name: 'Components' }).check();

  await expect(customers.getByTestId('not-covered')).toHaveText(
    'Not filtered by Products Category',
  );
  await expect(customers.getByTestId('chart-tile')).not.toHaveAttribute('aria-busy', 'true');
  await expect(customers.getByRole('alert')).toHaveCount(0);
  await expect(customers.getByTestId('table-row')).toHaveCount(everyCountry);

  // A filter it can take, beside the one it cannot: applied.
  const country =
    (await customers.getByTestId('table-row').first().locator('td').first().textContent()) ?? '';
  await open(pill(page, 'list'));
  await filterBar(page).getByRole('button', { name: country, exact: true }).click();
  await expect(customers.getByTestId('table-row')).toHaveCount(1);
  await expect(customers.getByTestId('table-row')).toContainText(country);
  await expect(customers.getByTestId('not-covered')).toHaveText(
    'Not filtered by Products Category',
  );
  await expect(customers.getByRole('alert')).toHaveCount(0);
});

test('a view takes a filter on a cube field it offers, by its own name for it', async ({
  page,
  request,
}) => {
  const { id, title } = await makeChartsDashboard(
    request,
    [
      {
        tile: 'tile-summary',
        source: 'order_summary',
        measure: 'order_summary.count',
        dimension: 'order_summary.status',
      },
    ],
    [{ id: 'f-status', widget: 'checkbox', member: 'orders.status' }],
  );
  await page.goto(`/explore/dashboards/${id}`);
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  const summary = page.locator('[data-tile="tile-summary"]');
  await summary.getByTestId('toggle-table-view').click();
  await expect(summary.getByTestId('table-row')).toHaveCount(3);

  await open(pill(page, 'checkbox'));
  await filterBar(page).getByRole('checkbox', { name: 'shipped' }).check();

  await expect(summary.getByTestId('table-row')).toHaveCount(1);
  await expect(summary.getByTestId('table-row')).toContainText('shipped');
  await expect(summary.getByTestId('not-covered')).toHaveCount(0);
});

/**
 * T050 / AC-043: WHEN a query returns no rows, THE SYSTEM SHALL show an empty
 * state naming the filters that are in effect.
 * Fails when: the tile renders blank axes with no message, or the message
 * omits an active filter.
 *
 * The seed's orders run to 2026-08-29, so none was placed today; with a
 * status picked as well, both filters are in effect on the empty tile.
 */
test('a filtered tile with no rows says so, naming every filter in effect', async ({
  page,
  request,
}) => {
  const { id, title } = await makeTwoTabDashboard(request, [
    { id: 'f-status', widget: 'checkbox', member: 'orders.status' },
    { id: 'f-ordered', widget: 'dateRange', member: 'orders.ordered_at' },
  ]);
  await page.goto(`/explore/dashboards/${id}`);
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  const sales = page.locator('[data-tile="tile-sales"]');
  await expect(sales.getByTestId('chart-canvas')).toBeVisible();

  await open(pill(page, 'checkbox'));
  await filterBar(page).getByRole('checkbox', { name: 'shipped' }).check();
  await open(pill(page, 'dateRange'));
  await filterBar(page).getByLabel(ORDERED_AT, { exact: true }).selectOption('today');

  const empty = sales.getByTestId('tile-no-rows');
  await expect(empty).toBeVisible();
  await expect(empty.getByRole('listitem')).toHaveText([
    'Orders Status is shipped',
    `${ORDERED_AT}: today`,
  ]);
  // No blank axes behind it.
  await expect(sales.getByTestId('chart-canvas')).toHaveCount(0);
});

/**
 * T086 / AC-080: WHEN the user clears a filter, THE SYSTEM SHALL return every
 * tile in its scope to the unfiltered result.
 * Fails when: any tile still reflects the cleared filter.
 */
test('clearing a filter returns every tile in its scope to the unfiltered result', async ({
  page,
  request,
}) => {
  const { id, title } = await makeTwoTabDashboard(request, [
    { id: 'f-status', widget: 'checkbox', member: 'orders.status' },
  ]);
  await page.goto(`/explore/dashboards/${id}`);
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  const sales = page.locator('[data-tile="tile-sales"]');
  await sales.getByTestId('toggle-table-view').click();
  await expect(sales.getByTestId('table-row')).toHaveCount(3);

  await open(pill(page, 'checkbox'));
  await filterBar(page).getByRole('checkbox', { name: 'processing' }).check();
  await expect(sales.getByTestId('table-row')).toHaveCount(1);

  await filterBar(page).getByRole('button', { name: 'Clear Orders Status' }).click();

  await expect(sales.getByTestId('table-row')).toHaveCount(3);
  await expect(filterBar(page).getByRole('checkbox', { name: 'processing' })).not.toBeChecked();
  // The other tab's tile, in scope too, is unfiltered as well.
  await page.keyboard.press('Escape');
  await page.getByRole('tab', { name: 'Operations' }).click();
  const operations = page.locator('[data-tile="tile-operations"]');
  await operations.getByTestId('toggle-table-view').click();
  await expect(operations.getByTestId('table-row')).toHaveCount(3);
});
