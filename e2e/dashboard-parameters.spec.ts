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
export async function boundChart(
  request: APIRequestContext,
  dashboardId: string,
  chartType = 'bar',
) {
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
          chartType,
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

/** Places these tiles on the dashboard's one page, once what they name exists. */
async function placeTiles(request: APIRequestContext, id: string, items: unknown[]) {
  const read = await request.get(`${API}/documents/dashboard/${id}`);
  const stored = (await read.json()) as { version: number; body: Record<string, unknown> };
  const put = await request.put(`${API}/documents/dashboard/${id}`, {
    data: {
      version: stored.version,
      body: { ...stored.body, pages: [{ id: 'only', title: 'Only', items }] },
    },
  });
  expect(put.ok(), await put.text()).toBe(true);
}

/**
 * T899 / AC-534, AC-533: a dashboard opened plainly starts Metric to show at
 * its default; its Parameter control, a radio group of two segments, applies
 * Orders at once to the bound chart — asked again with Orders, its column
 * now Orders' title, its pinned type kept — and to a Value of the parameter,
 * and says "Metric to show: Orders" once.
 */
test('a Parameter control applies its choice at once to the bound chart and Value, and says it once', async ({
  page,
  request,
}) => {
  const asked = measuresAsked(page);
  const { id, title } = await dashboardOf(request, {
    parameters: [METRIC],
    pages: [{ id: 'only', title: 'Only', items: [] }],
  });
  const chartId = await boundChart(request, id, 'table');
  await placeTiles(request, id, [
    {
      id: 'tile-text',
      kind: 'text',
      w: 6,
      h: 12,
      document: {
        version: 1,
        doc: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [
                { type: 'text', text: 'Show ' },
                { type: 'parameterControl', attrs: { parameter: 'p-metric' } },
                { type: 'text', text: ' · now ' },
                { type: 'value', attrs: { parameter: 'p-metric' } },
              ],
            },
          ],
        },
      },
    },
    { id: 'tile-chart', kind: 'chart', w: 6, h: 40, chartId },
  ]);

  await page.goto(`/explore/dashboards/${id}`);
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  const text = page.locator('[data-tile="tile-text"] .text-tile');
  const control = text.getByRole('radiogroup', { name: 'Metric to show' });
  // Opened plainly: at its default.
  await expect(control.getByRole('radio', { name: 'Revenue' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  expect((await control.getByRole('radio', { name: 'Revenue' }).boundingBox())?.height).toBe(32);
  const value = text.locator('.text-value');
  await expect(value).toHaveText(/^\$[\d,.]+$/);
  const chart = page.locator('[data-tile="tile-chart"]');
  await expect(chart.getByRole('columnheader').nth(1)).toHaveText(/Total Amount/);
  const announcer = page.getByTestId('parameter-announcer');
  await expect(announcer).toHaveText('');

  await control.getByRole('radio', { name: 'Orders' }).click();
  await expect(control.getByRole('radio', { name: 'Orders' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(value).toHaveText('240');
  await expect(chart.getByRole('columnheader').nth(1)).toHaveText(/Count/);
  await expect(chart.locator('table')).toHaveCount(1);
  expect(asked.flat()).toContain('orders.count');
  await expect(announcer).toHaveText('Metric to show: Orders');
  await expect(chart.locator('.tile-head__set-by')).toHaveText(' · set by Metric to show');
});

/** A Text tile of a Parameter control of Metric to show and a Value of it. */
const controlsTile = {
  id: 'tile-text',
  kind: 'text',
  w: 6,
  h: 12,
  document: {
    version: 1,
    doc: {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Show ' },
            { type: 'parameterControl', attrs: { parameter: 'p-metric' } },
            { type: 'text', text: ' · now ' },
            { type: 'value', attrs: { parameter: 'p-metric' } },
          ],
        },
      ],
    },
  },
};

/**
 * T900 / AC-121, AC-123: a bookmark saved with Metric to show at Orders
 * sets it back from Revenue when applied; a link carrying Orders opens there.
 */
test('a bookmark and a link carry a parameter’s value, and applying or opening one sets it', async ({
  page,
  request,
}) => {
  const { id, title } = await dashboardOf(request, {
    parameters: [METRIC],
    pages: [{ id: 'only', title: 'Only', items: [controlsTile] }],
  });
  await page.goto(`/explore/dashboards/${id}`);
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  const text = page.locator('[data-tile="tile-text"] .text-tile');
  const control = text.getByRole('radiogroup', { name: 'Metric to show' });
  const value = text.locator('.text-value');
  await control.getByRole('radio', { name: 'Orders' }).click();
  await expect(value).toHaveText('240');

  // Saved at Orders.
  await page.getByRole('button', { name: 'Bookmarks' }).click();
  await page
    .getByRole('dialog', { name: 'Bookmarks' })
    .getByRole('button', { name: 'Bookmark this view…' })
    .click();
  const naming = page.getByRole('dialog', { name: 'Save a bookmark' });
  await naming.getByRole('textbox', { name: 'Name' }).fill('By orders');
  await naming.getByRole('button', { name: 'Save' }).click();
  await expect(naming).toHaveCount(0);

  // Back to Revenue, then the bookmark applied: Orders again.
  await control.getByRole('radio', { name: 'Revenue' }).click();
  await expect(value).toHaveText(/^\$[\d,.]+$/);
  await page.getByRole('button', { name: 'Bookmarks' }).click();
  await page
    .getByRole('dialog', { name: 'Bookmarks' })
    .getByRole('list', { name: 'Mine' })
    .getByRole('button', { name: 'By orders', exact: true })
    .click();
  await expect(control.getByRole('radio', { name: 'Orders' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(value).toHaveText('240');

  // A link carrying Orders, as Copy link with marks writes one, opens at Orders.
  const view = {
    page: 'only',
    marks: {},
    markFilters: [],
    from: {},
    parameters: { 'p-metric': 'orders.count' },
  };
  await page.goto(`/explore/dashboards/${id}?view=${encodeURIComponent(JSON.stringify(view))}`);
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  await expect(control.getByRole('radio', { name: 'Orders' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(value).toHaveText('240');
  // Opened plainly, at its default.
  await page.goto(`/explore/dashboards/${id}`);
  await expect(control.getByRole('radio', { name: 'Revenue' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
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

/**
 * T897 / AC-532: Metric to show's uses — the chart's Metrics well, a
 * parameter control and a Value — are listed as links, one opening its tile
 * selected in edit mode; a choice from `monthly_orders`, which `orders`
 * doesn't join, holds Save settings naming the chart and the choice;
 * deleting the parameter lists its uses and asks, and then each keeps
 * Revenue as a fixed field, its tile saying so, and the dashboard saved
 * writes the chart with Revenue in its well.
 */
test('Settings › Parameters: uses as links, Save held for a choice a chart can’t query, and deleting a used parameter', async ({
  page,
  request,
}) => {
  const { id, title } = await dashboardOf(request, {
    parameters: [METRIC],
    pages: [{ id: 'only', title: 'Only', items: [] }],
  });
  const chartId = await boundChart(request, id, 'table');
  await placeTiles(request, id, [
    controlsTile,
    { id: 'tile-chart', kind: 'chart', w: 6, h: 40, chartId },
  ]);
  await page.goto(`/explore/dashboards/${id}`);
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  const chart = page.locator('[data-tile="tile-chart"]');
  await expect(chart.getByRole('columnheader').nth(1)).toHaveText(/Total Amount/);

  const settings = page.getByTestId('dashboard-settings');
  const openParameters = async () => {
    await page.getByRole('button', { name: 'Dashboard settings' }).click();
    await settings.locator('[data-section="Parameters"]').click();
  };
  await openParameters();
  const used = settings.getByRole('list', { name: 'Used by' });
  // In the dashboard's order: the Text tile, by its words, then the chart.
  await expect(used.getByRole('listitem')).toHaveText([
    'Show · now · Text · a parameter control',
    'Show · now · Text · the Value “Metric to show”',
    'Metric by status · chart · its Metrics well',
  ]);
  await expect(settings.getByTestId('parameter-checked')).toHaveText(
    'Every choice works in every chart that uses this parameter.',
  );

  // A choice from a cube the chart doesn't join: named, and Save held.
  const form = settings.getByRole('group', { name: 'Parameter' });
  await form.getByRole('button', { name: 'Add a measure choice' }).click();
  await page
    .getByRole('listbox', { name: 'Fields' })
    .locator('[data-member="monthly_orders.count"]')
    .click();
  const unqueryable = settings.getByTestId('parameter-unqueryable');
  await expect(unqueryable).toHaveText(/^Metric by status can’t query .+ › Count$/);
  const named = (await unqueryable.textContent()) ?? '';
  await settings.getByRole('button', { name: 'Save settings' }).click();
  await expect(settings.getByTestId('settings-save-failed')).toHaveText(named);
  await expect(settings).toBeVisible();
  await settings.getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('button', { name: 'Discard changes' }).click();
  await expect(settings).toBeHidden();

  // A use's link: its tile, selected in edit mode.
  await openParameters();
  await used.getByRole('listitem').nth(2).getByRole('button').click();
  await expect(settings).toBeHidden();
  await expect(toolbarOf(page)).toBeVisible();
  await expect(chart).toHaveAttribute('data-selected', 'true');
  // From edit mode too: the Value's link selects the Text tile.
  await openParameters();
  await used.getByRole('listitem').nth(1).getByRole('button').click();
  await expect(settings).toBeHidden();
  await expect(page.locator('[data-tile="tile-text"]')).toHaveAttribute('data-selected', 'true');
  await expect(chart).not.toHaveAttribute('data-selected', 'true');

  // Deleted: asked first, its uses listed; then each keeps Revenue and says so.
  await openParameters();
  await settings.getByRole('button', { name: 'Delete parameter…' }).click();
  const asked = page.getByRole('alertdialog', { name: 'Delete “Metric to show”?' });
  await expect(asked.getByTestId('delete-parameter-said')).toHaveText(
    'It has 3 uses. Each keeps Revenue, its value now, as a fixed field, and its tile says so.',
  );
  await expect(asked.getByRole('listitem')).toHaveCount(3);
  await asked.getByRole('button', { name: 'Delete parameter', exact: true }).click();
  await expect(settings.getByText('This dashboard has no parameters yet.')).toBeVisible();
  await settings.getByRole('button', { name: 'Save settings' }).click();
  await expect(settings).toBeHidden();
  const said = 'Fixed at Revenue: the parameter Metric to show was deleted.';
  await expect(chart.getByTestId('parameter-fixed')).toContainText(said);
  const text = page.locator('[data-tile="tile-text"]');
  await expect(text.getByTestId('parameter-fixed')).toContainText(said);
  await expect(text.locator('.text-tile')).toContainText('Show Revenue · now');
  await expect(text.locator('.text-value')).toHaveText(/^\$[\d,.]+$/);
  await expect(chart.getByRole('columnheader').nth(1)).toHaveText(/Total Amount/);

  await toolbarOf(page).getByRole('button', { name: 'Save', exact: true }).click();
  await expect(toolbarOf(page)).toBeHidden();
  const storedChart = (await (await request.get(`${API}/documents/chart/${chartId}`)).json()) as {
    body: { chart: { wells: { measures: string[] } } };
  };
  expect(storedChart.body.chart.wells.measures).toEqual(['orders.total_amount']);
  const storedDashboard = (await (
    await request.get(`${API}/documents/dashboard/${id}`)
  ).json()) as {
    body: { parameters?: unknown[] };
  };
  expect(storedDashboard.body.parameters ?? []).toEqual([]);
  // Read: the note is the author's, and the chart follows nothing.
  await expect(chart.getByTestId('parameter-fixed')).toHaveCount(0);
  await expect(chart.locator('.tile-head__set-by')).toHaveCount(0);
  await expect(chart.getByRole('columnheader').nth(1)).toHaveText(/Total Amount/);
});

const toolbarOf = (page: Page) => page.getByRole('toolbar', { name: 'Dashboard editing' });
