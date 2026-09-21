import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

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
      data: { kind: 'dashboard', title, folderId: 'root' },
    })
  ).json()) as { id: string };
  await request.put(`${API}/documents/dashboard/${dashboard.id}`, {
    data: {
      version: 1,
      body: {
        schemaVersion: 1,
        title,
        folderId: 'root',
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
        data: { kind: 'chart', title: chartTitle, folderId: 'root' },
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
        folderId: 'root',
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

const filterBar = (page: Page) => page.getByRole('region', { name: 'Filters' });

/** The seeded model's title for `orders.ordered_at`. */
const ORDERED_AT = 'Orders Ordered at';

async function addFilter(page: Page, widget: string, member: string) {
  await page.getByTestId('add-filter').click();
  await page.getByTestId(`add-filter-${widget}`).click();
  const added = filterBar(page).locator(`[data-widget="${widget}"]`).last();
  await added.getByLabel('Filter on').selectOption(member);
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
  await expect(filterBar(page).getByLabel(ORDERED_AT, { exact: true })).toBeVisible();
  await expect(filterBar(page).getByRole('searchbox', { name: /^Search / })).toBeVisible();
  await expect(filterBar(page).getByLabel(/ from$/)).toBeVisible();
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

  const appliesTo = filterBar(page).getByLabel('Applies to');
  await appliesTo.selectOption({ label: 'Chosen tiles' });
  await filterBar(page)
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

  await filterBar(page).getByRole('checkbox', { name: 'processing' }).check();
  await expect(sales.getByTestId('table-row')).toHaveCount(1);

  await filterBar(page).getByRole('button', { name: 'Clear Orders Status' }).click();

  await expect(sales.getByTestId('table-row')).toHaveCount(3);
  await expect(filterBar(page).getByRole('checkbox', { name: 'processing' })).not.toBeChecked();
  // The other tab's tile, in scope too, is unfiltered as well.
  await page.getByRole('tab', { name: 'Operations' }).click();
  const operations = page.locator('[data-tile="tile-operations"]');
  await operations.getByTestId('toggle-table-view').click();
  await expect(operations.getByTestId('table-row')).toHaveCount(3);
});
