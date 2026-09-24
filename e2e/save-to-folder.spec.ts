import { expect, test } from '@playwright/test';

const API = 'http://localhost:4100/api';

/**
 * T133 / AC-127: WHEN the user saves a local chart to a folder, THE SYSTEM
 * SHALL make it a library chart reusable by other dashboards, and say where it
 * was saved.
 * Fails when: the chart stays local, or the confirmation does not name the
 * folder.
 *
 * On the real dashboard: a chart local to it, saved to a folder of its own
 * from the tile's Properties; with the dashboard's Save (the user's decision,
 * 2026-09-22) it is stored as a library chart in that folder — listed there,
 * for other dashboards to reuse — and the page says where it went.
 */
test('a local chart saved to a folder becomes a library chart there, and the page says where', async ({
  page,
  request,
}) => {
  const unique = `${String(Date.now())}-${String(Math.round(Math.random() * 1e6))}`;
  const created = async (kind: string, title: string) =>
    (
      (await (
        await request.post(`${API}/documents`, { data: { kind, title, folderId: 'root' } })
      ).json()) as { id: string }
    ).id;
  const folderTitle = `Shared charts ${unique}`;
  const folderId = await created('folder', folderTitle);
  const dashboardId = await created('dashboard', `Publish ${unique}`);
  const chartId = await created('chart', `Orders ${unique}`);
  await request.put(`${API}/documents/chart/${chartId}`, {
    data: {
      version: 1,
      body: {
        schemaVersion: 1,
        title: `Orders ${unique}`,
        owner: 'admin',
        localToDashboardId: dashboardId,
        chart: {
          source: { cube: 'orders' },
          wells: { measures: ['orders.count'], dimensions: ['orders.status'], timeDimensions: [] },
          chartType: 'bar',
        },
      },
    },
  });
  await request.put(`${API}/documents/dashboard/${dashboardId}`, {
    data: {
      version: 1,
      body: {
        schemaVersion: 1,
        title: `Publish ${unique}`,
        folderId: 'root',
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

  await page.goto(`/explore/dashboards/${dashboardId}`);
  const tile = page.locator('[data-tile="tile"]');
  await expect(tile.getByTestId('chart-canvas')).toHaveAttribute('data-chart-type', 'bar');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await tile.click();
  const sidebar = page.getByRole('complementary', { name: 'Edit sidebar' });
  await sidebar.getByRole('tab', { name: 'Properties' }).click();
  await expect(sidebar.getByText(/Only on this dashboard/)).toBeVisible();
  // A local chart's editor says nothing of sharing (T134's review).
  await tile.getByRole('button', { name: /^Edit / }).click();
  await expect(
    page.getByTestId('chart-editor-overlay').getByTestId('chart-type-change'),
  ).toBeVisible();
  await expect(page.locator('.shared-chart-notice')).toHaveCount(0);
  await page.getByTestId('editor-back').click();
  await tile.click();
  await sidebar.getByRole('tab', { name: 'Properties' }).click();

  await sidebar.getByRole('button', { name: 'Save to folders…' }).click();
  await sidebar.getByRole('combobox', { name: 'Folder' }).selectOption(folderId);
  await sidebar.getByRole('button', { name: 'Save to this folder' }).click();
  await expect(sidebar.getByRole('status').filter({ hasText: folderTitle })).toContainText(
    'when the dashboard is saved',
  );
  /**
   * Its editor says nothing of sharing (T134's review): a chart this dashboard
   * is saving to a folder is its own until the save — as a local chart's is.
   */
  await tile.getByRole('button', { name: /^Edit / }).click();
  const overlay = page.getByTestId('chart-editor-overlay');
  await expect(overlay.getByTestId('chart-type-change')).toBeVisible();
  await expect(overlay.locator('.shared-chart-notice')).toHaveCount(0);
  await page.getByTestId('editor-back').click();
  await expect(overlay).toHaveCount(0);

  await page
    .getByRole('toolbar', { name: 'Dashboard editing' })
    .getByRole('button', { name: 'Save', exact: true })
    .click();

  // Said where it went, by the folder's name.
  await expect(page.getByTestId('saved-to-folder')).toContainText(folderTitle);
  await expect(page.getByTestId('saved-to-folder')).toContainText(`Orders ${unique}`);
  // Stored as a library chart, in that folder, and listed there for reuse.
  const stored = (await (await request.get(`${API}/documents/chart/${chartId}`)).json()) as {
    body: { localToDashboardId?: string; folderId?: string };
  };
  expect(stored.body.localToDashboardId).toBeUndefined();
  expect(stored.body.folderId).toBe(folderId);
  const listed = (await (
    await request.get(`${API}/folders/${encodeURIComponent(folderId)}/contents`)
  ).json()) as { id: string }[];
  expect(listed.map((item) => item.id)).toContain(chartId);
  // The dashboard still shows it.
  await expect(tile.getByTestId('chart-canvas')).toHaveAttribute('data-chart-type', 'bar');
});
