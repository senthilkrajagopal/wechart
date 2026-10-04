import { expect, test, type APIRequestContext } from '@playwright/test';

import { cubePicker } from './cubePicker';
import { IN_MY_WORKSPACE } from './workspace';

/**
 * AC-022: WHEN the user opens a library chart's page, THE SYSTEM SHALL list
 * every dashboard that uses it and offer to add it to another dashboard.
 * Fails when: a dashboard that contains the chart is missing from the list.
 *
 * "Every" is the word under test, so the fixture has three dashboards using the
 * chart and one that does not — a page that listed only the first would pass a
 * laxer assertion.
 */
const API = 'http://localhost:4100';

/**
 * In My workspace, going to the shared root: where the single user makes a
 * chart and its dashboards, and changes them in place (T359, AC-254).
 */
async function create(request: APIRequestContext, kind: 'dashboard' | 'chart', title: string) {
  const response = await request.post(`${API}/api/documents`, {
    data: { kind, title, ...IN_MY_WORKSPACE },
  });
  expect(response.status()).toBe(201);
  return (await response.json()) as { id: string };
}

test('lists every dashboard that uses the chart, and none that do not', async ({
  page,
  request,
}) => {
  const unique = `uses-${String(Date.now())}`;
  const chart = await create(request, 'chart', `Chart ${unique}`);

  const users = [];
  for (let n = 1; n <= 3; n += 1) {
    const dashboard = await create(request, 'dashboard', `Uses ${unique} ${String(n)}`);
    await request.post(`${API}/api/dashboards/${dashboard.id}/charts`, {
      data: { chartId: chart.id },
    });
    users.push(dashboard);
  }
  const bystander = await create(request, 'dashboard', `Ignores ${unique}`);

  await page.goto(`/explore/charts/${chart.id}`);

  const list = page.getByRole('list', { name: /dashboards using this chart/i });
  await expect(list).toBeVisible();
  for (const dashboard of users) {
    await expect(page.getByTestId(`using-${dashboard.id}`)).toBeVisible();
  }
  await expect(page.getByTestId(`using-${bystander.id}`)).toBeHidden();
});

test('says so when no dashboard uses the chart', async ({ page, request }) => {
  const chart = await create(request, 'chart', `Unused ${String(Date.now())}`);

  await page.goto(`/explore/charts/${chart.id}`);

  await expect(page.getByTestId('used-by-none')).toBeVisible();
});

test('offers to add the chart to another dashboard, and the list then includes it', async ({
  page,
  request,
}) => {
  const unique = `add-${String(Date.now())}`;
  const chart = await create(request, 'chart', `Chart ${unique}`);
  const dashboard = await create(request, 'dashboard', `Target ${unique}`);

  await page.goto(`/explore/charts/${chart.id}`);
  await expect(page.getByTestId('used-by-none')).toBeVisible();

  await page.getByLabel('Dashboard', { exact: true }).selectOption({ label: `Target ${unique}` });
  await page.getByRole('button', { name: 'Add to dashboard' }).click();

  await expect(page.getByTestId(`using-${dashboard.id}`)).toBeVisible();
});

/**
 * T226 / AC-212: WHEN the user opens a library chart from Explore, THE SYSTEM
 * SHALL show its title as the page heading, its chart type, the chart drawn,
 * the cube or view it is built on, its measures and dimensions, the dashboards
 * it is used on, and an Edit chart action that opens the chart editor on it.
 * `Fails when: the chart is not drawn, its title is not the heading, or there
 * is no way to open it in the chart editor.`
 *
 * The prototype's `chartPage()` (docs/design/prototype/explore.js).
 */
async function drawnChart(request: APIRequestContext) {
  const unique = String(Date.now());
  const title = `Orders by status ${unique}`;
  const chart = await create(request, 'chart', title);
  const stored = (await (await request.get(`${API}/api/documents/chart/${chart.id}`)).json()) as {
    version: number;
    body: Record<string, unknown>;
  };
  await request.put(`${API}/api/documents/chart/${chart.id}`, {
    data: {
      version: stored.version,
      body: {
        ...stored.body,
        chart: {
          source: { cube: 'orders' },
          wells: { measures: ['orders.count'], dimensions: ['orders.status'], timeDimensions: [] },
          chartType: 'bar',
        },
      },
    },
  });
  // A dashboard it is on, by a tile.
  const board = `Uses it ${unique}`;
  const dashboard = await create(request, 'dashboard', board);
  const boardStored = (await (
    await request.get(`${API}/api/documents/dashboard/${dashboard.id}`)
  ).json()) as { version: number; body: Record<string, unknown> };
  await request.put(`${API}/api/documents/dashboard/${dashboard.id}`, {
    data: {
      version: boardStored.version,
      body: {
        ...boardStored.body,
        pages: [
          {
            id: 'p',
            title: 'Page 1',
            items: [{ id: 't', kind: 'chart', w: 6, h: 40, chartId: chart.id }],
          },
        ],
      },
    },
  });
  return { id: chart.id, title, board };
}

test('a library chart’s page: its title, type, the chart drawn, what it is built on, where it is used', async ({
  page,
  request,
}) => {
  const chart = await drawnChart(request);
  await page.goto(`/explore/charts/${chart.id}`);
  const main = page.getByRole('main');

  await expect(main.getByRole('heading', { level: 1 })).toHaveText(chart.title);
  await expect(main.getByTestId('chart-type')).toHaveText('Bar');
  // Drawn, not described.
  await expect(main.getByTestId('chart-canvas')).toBeVisible();
  // Its table names its members by their titles (T232, AC-220).
  await main.getByTestId('toggle-table-view').click();
  await expect(main.getByTestId('data-table').getByRole('columnheader')).toHaveText([
    'Orders Status',
    'Orders Count',
  ]);
  await main.getByTestId('toggle-table-view').click();

  const details = main.getByRole('complementary', { name: 'Chart details' });
  await expect(details.getByRole('region', { name: 'Built on' })).toContainText('cube: orders');
  await expect(details.getByRole('region', { name: 'Metrics' })).toContainText('Orders Count');
  await expect(details.getByRole('region', { name: 'Dimensions' })).toContainText('Orders Status');
  // In its list of dashboards — not the add-to picker's options beside it.
  await expect(
    details
      .getByRole('list', { name: 'Dashboards using this chart' })
      .getByRole('link', { name: chart.board }),
  ).toBeVisible();
});

test('Edit chart opens the chart editor on it', async ({ page, request }) => {
  const chart = await drawnChart(request);
  await page.goto(`/explore/charts/${chart.id}`);
  await page.getByRole('main').getByRole('link', { name: 'Edit chart' }).click();
  await expect(page).toHaveURL(new RegExp(`/explore/charts/${chart.id}/edit$`));
  await expect(page.getByRole('heading', { name: 'Chart editor' })).toBeVisible();
  // On this chart: loaded, with its cube chosen.
  await expect(page.getByTestId('editor-load-error')).toHaveCount(0);
  await expect(cubePicker(page).button).toHaveAttribute('data-value', 'orders');
  await expect(cubePicker(page).button).toContainText('Orders');
});

test('a chart with no fields yet says what to do, not that something failed', async ({
  page,
  request,
}) => {
  const chart = await create(request, 'chart', `Empty ${String(Date.now())}`);
  await page.goto(`/explore/charts/${chart.id}`);
  const main = page.getByRole('main');
  await expect(main.getByTestId('chart-page-empty')).toContainText('Use Edit chart to finish it');
  await expect(main.getByTestId('chart-type')).toHaveText('Incomplete');
  await expect(main.getByRole('alert')).toHaveCount(0);
});

test('a chart whose type the recommender picks says so', async ({ page, request }) => {
  const chart = await drawnChart(request);
  // Its saved type taken away: the recommender's pick.
  const stored = (await (await request.get(`${API}/api/documents/chart/${chart.id}`)).json()) as {
    version: number;
    body: { chart: Record<string, unknown> };
  };
  const { chartType: _type, ...untyped } = stored.body.chart;
  expect(_type).toBe('bar');
  await request.put(`${API}/api/documents/chart/${chart.id}`, {
    data: { version: stored.version, body: { ...stored.body, chart: untyped } },
  });
  await page.goto(`/explore/charts/${chart.id}`);
  await expect(page.getByRole('main').getByTestId('chart-type')).toHaveText(/ · auto$/);
});
