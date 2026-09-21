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
async function makeTwoTabDashboard(request: APIRequestContext) {
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
