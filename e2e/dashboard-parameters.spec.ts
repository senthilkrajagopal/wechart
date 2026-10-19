import { expect, test, type APIRequestContext } from '@playwright/test';

import { IN_MY_WORKSPACE } from './workspace';

/**
 * Dashboard parameters (F46, design 21 screen 3): defined in Dashboard
 * settings › Parameters, set by a Text tile's Parameter control, followed by
 * local charts and Values, carried by bookmarks and links.
 *
 * On the seeded model: 240 orders.
 */
const API = 'http://localhost:4100/api';

/** A dashboard of its own, holding these pages and parameters, in My workspace. */
export async function dashboardOf(
  request: APIRequestContext,
  body: { pages: unknown[]; parameters?: unknown[]; filters?: unknown[] },
) {
  const title = `Parameters ${String(Date.now())}-${String(Math.round(Math.random() * 1e6))}`;
  const dashboard = (await (
    await request.post(`${API}/documents`, {
      data: { kind: 'dashboard', title, ...IN_MY_WORKSPACE },
    })
  ).json()) as { id: string };
  const placed = await request.put(`${API}/documents/dashboard/${dashboard.id}`, {
    data: {
      version: 1,
      body: {
        schemaVersion: 1,
        title,
        ...IN_MY_WORKSPACE,
        owner: 'admin',
        settings: { width: 'fixed', interactions: { mode: 'markings' } },
        markings: [{ id: 'm1', name: 'Picks', slot: 'mk1', isDefault: true }],
        ...body,
      },
    },
  });
  expect(placed.ok(), await placed.text()).toBe(true);
  return { id: dashboard.id, title };
}

/**
 * T896 / AC-531: Dashboard settings › Parameters, after Cross-filtering and
 * before Layout with its count; New parameter takes a name, a Measure,
 * choices picked with the field picker, each labelled, and a default; the
 * list shows it in a 34 px row; saved, it is kept.
 */
test('Settings › Parameters: a new Measure parameter, its choices picked, listed in a 34 px row and saved', async ({
  page,
  request,
}) => {
  const { id, title } = await dashboardOf(request, {
    pages: [{ id: 'only', title: 'Only', items: [] }],
  });
  await page.goto(`/explore/dashboards/${id}`);
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  await page.getByRole('button', { name: 'Dashboard settings' }).click();
  const settings = page.getByTestId('dashboard-settings');
  const nav = settings.getByRole('navigation', { name: 'Settings sections' });
  await expect(nav.locator('button[data-section]')).toHaveText([
    'General',
    'Interactions',
    /^Markings/,
    /^Cross-filtering/,
    'Parameters',
    'Layout',
  ]);
  await nav.locator('[data-section="Parameters"]').click();
  await settings.getByRole('button', { name: 'New parameter' }).click();
  const form = settings.getByRole('group', { name: 'Parameter' });
  await form.getByRole('textbox', { name: 'Name' }).fill('Metric to show');

  const pick = async (member: string) => {
    await form.getByRole('button', { name: 'Add a measure choice' }).click();
    await page
      .getByRole('listbox', { name: 'Fields' })
      .locator(`[data-member="${member}"]`)
      .click();
  };
  await pick('orders.total_amount');
  await pick('orders.count');
  await form.getByRole('textbox', { name: /^Label for .*Count$/ }).fill('Orders');
  await form.getByRole('combobox', { name: 'Default' }).selectOption({ label: 'Orders' });

  const row = settings.getByRole('table', { name: 'Parameters' }).getByRole('row').nth(1);
  await expect(row.getByRole('cell')).toHaveText([
    'Metric to show',
    'Field switch',
    'Measure',
    '2',
    'Orders',
    'Not used yet',
  ]);
  expect((await row.boundingBox())?.height).toBe(34);
  await expect(nav.locator('[data-section="Parameters"]')).toHaveText('Parameters1');

  await settings.getByRole('button', { name: 'Save settings' }).click();
  await expect(settings).toBeHidden();
  await page.reload();
  await page.getByRole('button', { name: 'Dashboard settings' }).click();
  await nav.locator('[data-section="Parameters"]').click();
  await expect(
    settings.getByRole('table', { name: 'Parameters' }).getByRole('row').nth(1).getByRole('cell'),
  ).toHaveText(['Metric to show', 'Field switch', 'Measure', '2', 'Orders', 'Not used yet']);
});
