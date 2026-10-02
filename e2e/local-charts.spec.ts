import { expect, test } from '@playwright/test';

import { IN_MY_WORKSPACE } from './workspace';

const API = 'http://localhost:4100/api';

/**
 * T132 / AC-126: WHEN a chart is created on a dashboard, THE SYSTEM SHALL
 * make it local to that dashboard and keep it out of Explore folders and
 * search.
 * Fails when: a dashboard-local chart appears in a folder listing or in
 * search results.
 *
 * On the real dashboard: a chart added from the palette gets a chart of its
 * own at once — a draft in the edit session — which the save creates with
 * the dashboard, local to it; and the chart editor opens on it, so its fields
 * can be added.
 */
test('a chart added to a dashboard is its own, local, and in no folder or search', async ({
  page,
  request,
}) => {
  const unique = `${String(Date.now())}-${String(Math.round(Math.random() * 1e6))}`;
  const dashboard = (await (
    await request.post(`${API}/documents`, {
      data: { kind: 'dashboard', title: `Local ${unique}`, ...IN_MY_WORKSPACE },
    })
  ).json()) as { id: string };
  await request.put(`${API}/documents/dashboard/${dashboard.id}`, {
    data: {
      version: 1,
      body: {
        schemaVersion: 1,
        title: `Local ${unique}`,
        ...IN_MY_WORKSPACE,
        owner: 'admin',
        settings: { width: 'fixed' },
        pages: [{ id: 'only', title: 'Only', items: [] }],
      },
    },
  });

  await page.goto(`/explore/dashboards/${dashboard.id}`);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  const sidebar = page.getByRole('complementary', { name: 'Edit sidebar' });
  await sidebar.getByRole('tab', { name: 'Add' }).click();
  await page.getByTestId('add-chart').click();

  // Its own chart, empty: what it needs, and the way in.
  const empty = page.getByTestId('tile-empty-chart');
  await expect(empty).toContainText('This chart has no fields yet.');
  await expect(empty).toContainText('Add its fields in the chart editor');

  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeVisible();

  // Stored with the dashboard, local to it.
  const stored = (await (
    await request.get(`${API}/documents/dashboard/${dashboard.id}`)
  ).json()) as {
    body: { pages: { items: { kind: string; chartId?: string }[] }[] };
  };
  const chartId = stored.body.pages
    .flatMap((each) => each.items)
    .find((item) => item.kind === 'chart')?.chartId;
  expect(chartId).toBeDefined();
  const chart = (await (await request.get(`${API}/documents/chart/${chartId ?? ''}`)).json()) as {
    body: { localToDashboardId?: string; title: string };
  };
  expect(chart.body.localToDashboardId).toBe(dashboard.id);

  // And out of Explore: no folder lists it, and no search finds it.
  const listed = (await (await request.get(`${API}/folders/root/contents`)).json()) as {
    id: string;
  }[];
  expect(listed.map((item) => item.id)).not.toContain(chartId);
  const found = (await (
    await request.get(`${API}/search?q=${encodeURIComponent(chart.body.title)}`)
  ).json()) as { id: string }[];
  expect(found.map((item) => item.id)).not.toContain(chartId);

  // Its fields can be added: the pencil opens the chart editor on it.
  // The pencil, named for its tile — "Edit Chart: …" (AC-209).
  await page
    .getByRole('button', { name: /^Edit Chart\b/ })
    .first()
    .click();
  await expect(page.getByLabel('Cube or view')).toBeVisible();
});
