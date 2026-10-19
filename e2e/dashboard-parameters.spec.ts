import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

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

/** Metric to show: Orders (orders.count) or Revenue (orders.total_amount), Revenue first. */
export const METRIC = {
  id: 'p-metric',
  name: 'Metric to show',
  kind: 'fieldSwitch',
  role: 'measure',
  choices: [
    { member: 'orders.total_amount', label: 'Revenue' },
    { member: 'orders.count', label: 'Orders' },
  ],
  default: 'orders.total_amount',
};

/** A chart local to the dashboard, its Metrics well following Metric to show, by status. */
export async function boundChart(request: APIRequestContext, dashboardId: string) {
  const chart = (await (
    await request.post(`${API}/documents`, {
      data: { kind: 'chart', title: 'Metric by status', ...IN_MY_WORKSPACE },
    })
  ).json()) as { id: string };
  const wrote = await request.put(`${API}/documents/chart/${chart.id}`, {
    data: {
      version: 1,
      body: {
        schemaVersion: 2,
        title: 'Metric by status',
        owner: 'admin',
        localToDashboardId: dashboardId,
        chart: {
          source: { cube: 'orders' },
          wells: {
            measures: ['parameter:p-metric'],
            dimensions: ['orders.status'],
            timeDimensions: [],
          },
          chartType: 'bar',
        },
      },
    },
  });
  expect(wrote.ok(), await wrote.text()).toBe(true);
  return chart.id;
}

/** The measures each /api/load asked, in order. */
export function measuresAsked(page: Page): string[][] {
  const asked: string[][] = [];
  page.on('request', (request) => {
    if (!request.url().endsWith('/api/load') || request.method() !== 'POST') return;
    const body = JSON.parse(request.postData() ?? '{}') as { query?: { measures?: string[] } };
    asked.push(body.query?.measures ?? []);
  });
  return asked;
}

/**
 * T898 / AC-533: a dashboard-local chart whose Metrics well follows Metric to
 * show is asked with its default, Revenue, and says "· set by Metric to show"
 * in view mode; in its editor the pill reads "Metric to show · now Revenue",
 * and "+ metric" lists "Parameters of this dashboard" first.
 */
test('a local chart bound to a parameter asks its default, says “set by”, and its editor shows the pill and the group', async ({
  page,
  request,
}) => {
  const asked = measuresAsked(page);
  const { id, title } = await dashboardOf(request, {
    parameters: [METRIC],
    pages: [{ id: 'only', title: 'Only', items: [] }],
  });
  const chartId = await boundChart(request, id);
  // Its tile placed once the chart, local to it, exists.
  const placed = await request.get(`${API}/documents/dashboard/${id}`);
  const stored = (await placed.json()) as { version: number; body: Record<string, unknown> };
  const put = await request.put(`${API}/documents/dashboard/${id}`, {
    data: {
      version: stored.version,
      body: {
        ...stored.body,
        pages: [
          {
            id: 'only',
            title: 'Only',
            items: [{ id: 'tile-chart', kind: 'chart', w: 6, h: 40, chartId }],
          },
        ],
      },
    },
  });
  expect(put.ok(), await put.text()).toBe(true);

  await page.goto(`/explore/dashboards/${id}`);
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  const tile = page.locator('[data-tile="tile-chart"]');
  await expect(tile.locator('.tile-head__set-by')).toHaveText(' · set by Metric to show');
  await expect(tile.locator('canvas, svg').first()).toBeVisible();
  // Asked of Cube as its default member, never as the parameter.
  expect(asked.flat()).toContain('orders.total_amount');
  expect(asked.flat().some((measure) => measure.startsWith('parameter:'))).toBe(false);

  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByTestId('edit-chart-tile-chart').click();
  const overlay = page.getByTestId('chart-editor-overlay');
  const pill = overlay.getByTestId('in-measures-parameter:p-metric');
  await expect(pill.locator('.pill__title')).toHaveText('Metric to show · now Revenue');
  await expect(pill).toHaveAttribute(
    'title',
    'Follows the dashboard parameter Metric to show: Revenue or Orders',
  );
  await overlay.getByRole('button', { name: 'Add to Metrics' }).click();
  const groups = page.getByRole('listbox', { name: 'Fields' }).getByRole('group');
  await expect(groups.first()).toHaveAttribute('aria-label', 'Parameters of this dashboard');
});

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
