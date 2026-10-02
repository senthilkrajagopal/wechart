import { expect, test, type APIRequestContext } from '@playwright/test';

import { chooseChartType } from './chartType';
import { psql } from './store';
import { IN_MY_WORKSPACE } from './workspace';

const API = 'http://localhost:4100/api';

/**
 * T463 (UX-040, critical; phase-1 design 06, item 1): a dashboard-local
 * chart's page never leads to an editor that can't save.
 *
 * AC-126: a chart created on a dashboard is local to it. Its page says where
 * it lives, and its primary action is "Edit on ‹dashboard›", which opens that
 * dashboard in edit mode with this tile's editor open, where the dashboard's
 * Save saves the change. Beside it is "Save to folders…" (AC-127), which
 * makes it a library chart. The editor, reached any other way, offers the
 * same two actions in place of a sentence and no Save.
 */

interface Made {
  readonly unique: string;
  readonly dashboardId: string;
  readonly dashboardTitle: string;
  readonly chartId: string;
}

/**
 * A dashboard with one tile, `tile`, showing a chart local to it — or, with
 * `onTile: false`, a chart local to a dashboard none of whose tiles shows it.
 */
async function localChart(
  request: APIRequestContext,
  { onTile = true }: { onTile?: boolean } = {},
): Promise<Made> {
  const unique = `${String(Date.now())}-${String(Math.round(Math.random() * 1e6))}`;
  const created = async (kind: string, title: string) =>
    (
      (await (
        await request.post(`${API}/documents`, { data: { kind, title, ...IN_MY_WORKSPACE } })
      ).json()) as { id: string }
    ).id;
  const dashboardTitle = `Home ${unique}`;
  const dashboardId = await created('dashboard', dashboardTitle);
  const chartId = await created('chart', `Orders ${unique}`);
  const chart = await request.put(`${API}/documents/chart/${chartId}`, {
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
  expect(chart.status()).toBe(200);
  const dashboard = await request.put(`${API}/documents/dashboard/${dashboardId}`, {
    data: {
      version: 1,
      body: {
        schemaVersion: 1,
        title: dashboardTitle,
        ...IN_MY_WORKSPACE,
        owner: 'admin',
        settings: { width: 'fixed' },
        pages: [
          {
            id: 'only',
            title: 'Only',
            items: onTile ? [{ id: 'tile', kind: 'chart', w: 6, h: 40, chartId }] : [],
          },
        ],
      },
    },
  });
  expect(dashboard.status()).toBe(200);
  return { unique, dashboardId, dashboardTitle, chartId };
}

const storedChart = async (request: APIRequestContext, chartId: string) =>
  (
    (await (await request.get(`${API}/documents/chart/${chartId}`)).json()) as {
      body: {
        localToDashboardId?: string;
        folderId?: string;
        chart: { chartType?: string };
      };
    }
  ).body;

test('a local chart page says where it lives, and Edit on its dashboard opens its tile there, where Save saves it', async ({
  page,
  request,
}) => {
  const made = await localChart(request);
  await page.goto(`/explore/charts/${made.chartId}`);

  const head = page.locator('.chart-page__head');
  await expect(head.getByTestId('chart-home')).toHaveText(
    `Lives on ${made.dashboardTitle} · only there`,
  );
  // Never the editor that can't save.
  await expect(head.getByRole('link', { name: /Edit chart/ })).toHaveCount(0);
  const editOn = head.getByRole('link', { name: `Edit on ${made.dashboardTitle}` });
  await expect(editOn).toHaveClass(/btn-primary/);
  // "Save to folders…" beside it (AC-127).
  await expect(head.getByRole('link', { name: 'Save to folders…' })).toBeVisible();
  // The pane says where it lives, and offers no way onto a second dashboard.
  const details = page.getByRole('complementary', { name: 'Chart details' });
  await expect(details.getByRole('heading', { name: 'Lives on' })).toBeVisible();
  await expect(details.getByRole('link', { name: made.dashboardTitle })).toHaveAttribute(
    'href',
    `/explore/dashboards/${made.dashboardId}`,
  );
  await expect(details.getByRole('heading', { name: 'Used in' })).toHaveCount(0);
  await expect(details.getByRole('button', { name: 'Add to dashboard' })).toHaveCount(0);

  await editOn.click();
  await expect(page).toHaveURL(new RegExp(`/explore/dashboards/${made.dashboardId}\\?`));
  // The tile's own editor, on the dashboard, in edit mode.
  const overlay = page.getByTestId('chart-editor-overlay');
  await expect(overlay.getByTestId('chart-type-change')).toBeVisible();
  await chooseChartType(overlay, 'table');
  await page.getByTestId('editor-back').click();
  await expect(overlay).toHaveCount(0);
  await page
    .getByRole('toolbar', { name: 'Dashboard editing' })
    .getByRole('button', { name: 'Save', exact: true })
    .click();

  // Saved with the dashboard, and still its own.
  await expect
    .poll(async () => (await storedChart(request, made.chartId)).chart.chartType)
    .toBe('table');
  expect((await storedChart(request, made.chartId)).localToDashboardId).toBe(made.dashboardId);
});

test('Save to folders on a local chart page opens its dashboard ready to choose the folder, and makes it a library chart', async ({
  page,
  request,
}) => {
  const made = await localChart(request);
  const folderTitle = `Shared charts ${made.unique}`;
  const folderId = (
    (await (
      await request.post(`${API}/documents`, {
        // In My workspace, where its dashboard is: a workspace's save puts no
        // chart in a shared folder (T502; T359).
        data: { kind: 'folder', title: folderTitle, folderId: 'mine' },
      })
    ).json()) as { id: string }
  ).id;

  await page.goto(`/explore/charts/${made.chartId}`);
  await page.locator('.chart-page__head').getByRole('link', { name: 'Save to folders…' }).click();

  // The dashboard in edit mode, with this tile's Properties asking for a folder.
  const sidebar = page.getByRole('complementary', { name: 'Edit sidebar' });
  const folder = sidebar.getByRole('combobox', { name: 'Folder' });
  await expect(folder).toBeVisible();
  // Asked once: the address no longer asks, so a reload opens it to be read.
  await expect(page).not.toHaveURL(/publish=/);
  await expect(page).not.toHaveURL(/editing=/);
  await folder.selectOption(folderId);
  await sidebar.getByRole('button', { name: 'Save to this folder' }).click();
  await page
    .getByRole('toolbar', { name: 'Dashboard editing' })
    .getByRole('button', { name: 'Save', exact: true })
    .click();
  await expect(page.getByTestId('saved-to-folder')).toContainText(folderTitle);

  const stored = await storedChart(request, made.chartId);
  expect(stored.localToDashboardId).toBeUndefined();
  expect(stored.folderId).toBe(folderId);

  // Now a library chart, its page offers Edit chart again, and no home. In
  // My workspace, its way back, the proposal, is the primary and Edit is
  // beside it (design 04, state F; T359, AC-254).
  await page.goto(`/explore/charts/${made.chartId}`);
  const head = page.locator('.chart-page__head');
  await expect(head.getByRole('link', { name: /Edit chart/ })).toHaveClass('btn btn-sm');
  await expect(head.getByRole('button', { name: /^Propose to / })).toHaveClass('btn-primary');
  await expect(head.getByTestId('chart-home')).toHaveCount(0);
});

test('the editor reached directly for a local chart offers Edit on its dashboard and Save to folders, not a dead end', async ({
  page,
  request,
}) => {
  const made = await localChart(request);
  await page.goto(`/explore/charts/${made.chartId}/edit`);

  await expect(page.getByTestId('chart-type-change')).toBeVisible();
  await expect(page.getByText('edit and save it there')).toHaveCount(0);
  const editOn = page.getByRole('link', { name: `Edit on ${made.dashboardTitle}` });
  await expect(editOn).toHaveClass(/btn-primary/);
  await expect(page.getByRole('link', { name: 'Save to folders…' })).toBeVisible();

  await editOn.click();
  await expect(
    page.getByTestId('chart-editor-overlay').getByTestId('chart-type-change'),
  ).toBeVisible();
});

test('a local chart no tile shows any more offers only the way to its dashboard (T463 review)', async ({
  page,
  request,
}) => {
  const made = await localChart(request, { onTile: false });
  await page.goto(`/explore/charts/${made.chartId}`);

  const head = page.locator('.chart-page__head');
  await expect(head.getByTestId('chart-home')).toHaveText(
    `Lives on ${made.dashboardTitle} · on none of its tiles`,
  );
  await expect(head.getByRole('link', { name: `Open ${made.dashboardTitle}` })).toHaveAttribute(
    'href',
    `/explore/dashboards/${made.dashboardId}`,
  );
  // Nothing to edit it in, nor to save it to folders from.
  await expect(head.getByRole('link', { name: /Edit on|Edit chart/ })).toHaveCount(0);
  await expect(head.getByRole('link', { name: 'Save to folders…' })).toHaveCount(0);
});

test('a local chart whose dashboard cannot be opened says so, on its page and in the editor (T463 review)', async ({
  page,
  request,
}) => {
  const made = await localChart(request);
  // Its dashboard can't be opened: one that never existed. A dashboard's
  // delete takes its own charts with it (T518, AC-363), and no save moves a
  // chart off its dashboard's workspace (T359, R52), so no local chart comes
  // to this through the API any more: it is set so in the store.
  expect(
    psql(
      `UPDATE documents SET body = jsonb_set(body, '{localToDashboardId}', to_jsonb('never-${made.unique}'::text)) WHERE kind = 'chart' AND id = '${made.chartId}' RETURNING id;`,
    ).split('\n')[0],
  ).toBe(made.chartId);

  await page.goto(`/explore/charts/${made.chartId}`);
  await expect(page.locator('.chart-page__head')).toContainText(
    "Its dashboard could not be opened, so this chart can't be edited from here.",
  );

  await page.goto(`/explore/charts/${made.chartId}/edit`);
  await expect(page.getByTestId('chart-type-change')).toBeVisible();
  await expect(
    page.getByText("Its dashboard could not be opened, so this chart can't be edited from here."),
  ).toBeVisible();
});
