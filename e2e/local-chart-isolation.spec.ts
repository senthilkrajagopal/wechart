import { expect, test, type APIRequestContext } from '@playwright/test';

import { chooseChartType } from './chartType';
import { IN_MY_WORKSPACE } from './workspace';

const API = 'http://localhost:4100/api';

/**
 * T136 / AC-130: WHEN a local chart is edited, THE SYSTEM SHALL change no
 * other dashboard (direction.md rule 41).
 * Fails when: editing a local chart changes another dashboard's rendering.
 *
 * On the real dashboards: three with the same chart definition — one through
 * a chart local to it, one through a library chart, one through a local chart
 * of its own. The first's chart is edited to a line and saved; the other two
 * still draw bars, and the library chart is stored as it was.
 */
const DEFINITION = {
  source: { cube: 'orders' },
  wells: { measures: ['orders.count'], dimensions: ['orders.status'], timeDimensions: [] },
  chartType: 'bar',
};

async function created(request: APIRequestContext, kind: 'chart' | 'dashboard', title: string) {
  return (
    (await (
      await request.post(`${API}/documents`, { data: { kind, title, ...IN_MY_WORKSPACE } })
    ).json()) as { id: string }
  ).id;
}

async function dashboardShowing(
  request: APIRequestContext,
  title: string,
  chart: (dashboardId: string) => Promise<string>,
) {
  const id = await created(request, 'dashboard', title);
  const chartId = await chart(id);
  await request.put(`${API}/documents/dashboard/${id}`, {
    data: {
      version: 1,
      body: {
        schemaVersion: 1,
        title,
        ...IN_MY_WORKSPACE,
        owner: 'admin',
        settings: { width: 'fixed' },
        pages: [
          {
            id: 'only',
            title: 'Only',
            items: [{ id: 'tile', kind: 'chart', w: 6, h: 40, chartId }],
          },
        ],
      },
    },
  });
  return id;
}

/** A chart of the definition, local to the dashboard given, or in the library. */
async function chartOf(request: APIRequestContext, title: string, localTo?: string) {
  const id = await created(request, 'chart', title);
  await request.put(`${API}/documents/chart/${id}`, {
    data: {
      version: 1,
      body: {
        schemaVersion: 1,
        title,
        owner: 'admin',
        // A library one stays in My workspace, where it was made (T359, AC-254).
        ...(localTo === undefined ? IN_MY_WORKSPACE : { localToDashboardId: localTo }),
        chart: DEFINITION,
      },
    },
  });
  return id;
}

test('editing a local chart changes no other dashboard', async ({ page, request }) => {
  const unique = `${String(Date.now())}-${String(Math.round(Math.random() * 1e6))}`;
  const edited = await dashboardShowing(request, `Edited ${unique}`, (id) =>
    chartOf(request, `Local ${unique}`, id),
  );
  let libraryId = '';
  const shared = await dashboardShowing(request, `Shared ${unique}`, async () => {
    libraryId = await chartOf(request, `Library ${unique}`);
    return libraryId;
  });
  const own = await dashboardShowing(request, `Own ${unique}`, (id) =>
    chartOf(request, `Own local ${unique}`, id),
  );

  const canvas = page.locator('[data-tile="tile"]').getByTestId('chart-canvas');
  await page.goto(`/explore/dashboards/${edited}`);
  await expect(canvas).toHaveAttribute('data-chart-type', 'bar');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page
    .locator('[data-tile="tile"]')
    .getByRole('button', { name: /^Edit / })
    .click();
  await chooseChartType(page, 'line');
  await page.getByTestId('editor-back').click();
  await page
    .getByRole('toolbar', { name: 'Dashboard editing' })
    .getByRole('button', { name: 'Save', exact: true })
    .click();
  await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeVisible();
  await expect(canvas).toHaveAttribute('data-chart-type', 'line');

  // The other dashboards draw what they drew.
  for (const other of [shared, own]) {
    await page.goto(`/explore/dashboards/${other}`);
    await expect(canvas).toHaveAttribute('data-chart-type', 'bar');
  }
  const library = (await (await request.get(`${API}/documents/chart/${libraryId}`)).json()) as {
    body: { chart: { chartType?: string } };
  };
  expect(library.body.chart.chartType).toBe('bar');
  // And the edit itself stored, not only drawn from before the save (T136's review).
  const stored = (await (await request.get(`${API}/documents/dashboard/${edited}`)).json()) as {
    body: { pages: { items: { chartId?: string }[] }[] };
  };
  const localId = stored.body.pages[0]?.items[0]?.chartId ?? '';
  const local = (await (await request.get(`${API}/documents/chart/${localId}`)).json()) as {
    body: { chart: { chartType?: string } };
  };
  expect(local.body.chart.chartType).toBe('line');
});
