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
