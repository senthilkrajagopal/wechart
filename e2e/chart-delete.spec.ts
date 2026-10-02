import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

import { IN_MY_WORKSPACE, landedAs, shared } from './workspace';

/**
 * AC-362 (T517; design 14, state A), which retires AC-023's
 * confirm-then-delete: WHEN a user deletes a library chart that a dashboard in
 * a shared folder uses, THE SYSTEM SHALL refuse the delete, naming the
 * dashboards that use it that the user may see and counting the rest, and
 * SHALL delete a chart no such dashboard uses. A draft in a workspace doesn't
 * hold it back: its tile shows the chart gone.
 *
 * With sign-in off every folder is the one user's to see, and My workspace
 * (`mine`) is where drafts are.
 */
const API = 'http://localhost:4100';

async function create(
  request: APIRequestContext,
  kind: 'dashboard' | 'chart',
  title: string,
  folderId = 'root',
) {
  const response = await request.post(`${API}/api/documents`, {
    // Made in My workspace, it names the shared folder it is to go to (T345).
    data: { kind, title, ...(folderId === 'mine' ? IN_MY_WORKSPACE : { folderId }) },
  });
  expect(response.status()).toBe(201);
  return (await response.json()) as { id: string };
}

/**
 * A dashboard in the shared root showing a chart, as the single user makes
 * one (T359, AC-254): drafted in My workspace, then proposed and approved.
 */
async function sharedShowing(request: APIRequestContext, title: string, chartId: string) {
  const draft = await create(request, 'dashboard', title, 'mine');
  await showOn(request, draft.id, chartId);
  return { id: landedAs(await shared(request, 'dashboard', draft.id), 'dashboard') };
}

async function showOn(request: APIRequestContext, dashboardId: string, chartId: string) {
  const added = await request.post(`${API}/api/dashboards/${dashboardId}/charts`, {
    data: { chartId },
  });
  expect(added.status(), await added.text()).toBe(204);
}

/** Delete chart…, from the chart page's header ⋯ (design 14, screen 2, pin 1). */
async function askToDelete(page: Page, title: string) {
  await page.getByRole('button', { name: `More actions for ${title}` }).click();
  await page.getByRole('menuitem', { name: 'Delete chart…' }).click();
}

test('refuses a chart shared dashboards use, naming them, with Close alone, and keeps it', async ({
  page,
  request,
}) => {
  const unique = `del-${String(Date.now())}`;
  const chart = await create(request, 'chart', `Chart ${unique}`);
  const first = await sharedShowing(request, `First ${unique}`, chart.id);
  const second = await sharedShowing(request, `Second ${unique}`, chart.id);

  await page.goto(`/explore/charts/${chart.id}`);
  // The details pane's Delete section is gone (design 14, pin 1).
  await expect(page.getByRole('heading', { name: 'Delete', exact: true })).toHaveCount(0);
  await askToDelete(page, `Chart ${unique}`);

  const dialog = page.getByRole('alertdialog', { name: `Can’t delete “Chart ${unique}”` });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(
    '2 dashboards use it. Remove it from each of them, then delete it.',
  );
  // Named, each a link to its dashboard with its folder, never counted.
  const list = dialog.getByRole('list', { name: 'Dashboards that use it, 2' });
  for (const [dashboard, title] of [
    [first, `First ${unique}`],
    [second, `Second ${unique}`],
  ] as const) {
    const link = list.getByRole('link', { name: new RegExp(title) });
    await expect(link).toHaveAttribute('href', `/explore/dashboards/${dashboard.id}`);
    await expect(link).toHaveAttribute('target', '_blank');
  }
  await expect(list.getByText('Shared', { exact: true })).toHaveCount(2);
  await expect(dialog).not.toContainText('more in folders you can’t see');
  await expect(dialog.getByRole('button')).toHaveText(['Close']);
  await expect(dialog.getByRole('button', { name: 'Close' })).toBeFocused();
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(dialog).toHaveCount(0);

  // Still there.
  expect((await request.get(`${API}/api/documents/chart/${chart.id}`)).status()).toBe(200);
});

test('deletes a chart no dashboard uses once confirmed, back in its folder', async ({
  page,
  request,
}) => {
  const title = `Unused ${String(Date.now())}`;
  const chart = await create(request, 'chart', title);

  await page.goto(`/explore/charts/${chart.id}`);
  await askToDelete(page, title);
  const dialog = page.getByRole('alertdialog', { name: `Delete “${title}”?` });
  await expect(dialog).toContainText('No dashboard uses it. You can’t undo this.');
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await dialog.getByRole('button', { name: 'Delete chart' }).click();

  // Its folder, saying so, with focus on its heading (A5; design 14, keyboard).
  await expect(page).toHaveURL(/\/explore$/);
  await expect(page.getByRole('status').filter({ hasText: `Deleted “${title}”.` })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: 'Shared' })).toBeFocused();
  expect((await request.get(`${API}/api/documents/chart/${chart.id}`)).status()).toBe(404);
});

/**
 * With sign-in off since R52 (T359, AC-254), as with it on (T502): a shared
 * dashboard's own chart goes only as its dashboard changes, by a proposal.
 * Its page offers no Delete, and the service refuses one. Until then it was
 * refused only while its dashboard showed it, as AC-023 kept it.
 */
test('refuses a shared dashboard’s own chart, which goes only with its dashboard', async ({
  page,
  request,
}) => {
  const unique = `own-${String(Date.now())}`;
  const dashboard = await create(request, 'dashboard', `Home ${unique}`, 'mine');
  const chart = await create(request, 'chart', `Own ${unique}`, 'mine');
  const owned = await request.put(`${API}/api/documents/chart/${chart.id}`, {
    data: {
      version: 1,
      body: {
        schemaVersion: 1,
        title: `Own ${unique}`,
        owner: 'admin',
        localToDashboardId: dashboard.id,
        chart: { source: { cube: 'orders' }, wells: { measures: ['orders.count'] } },
      },
    },
  });
  expect(owned.status(), await owned.text()).toBe(200);
  const shown = await request.put(`${API}/api/documents/dashboard/${dashboard.id}`, {
    data: {
      version: 1,
      body: {
        schemaVersion: 1,
        title: `Home ${unique}`,
        ...IN_MY_WORKSPACE,
        owner: 'admin',
        pages: [
          {
            id: 'p1',
            title: 'Page 1',
            items: [{ id: 't1', kind: 'chart', w: 6, h: 40, chartId: chart.id }],
          },
        ],
      },
    },
  });
  expect(shown.status(), await shown.text()).toBe(200);
  // Shared: proposed and approved, its own chart with it.
  const own = landedAs(await shared(request, 'dashboard', dashboard.id), 'chart');

  await page.goto(`/explore/charts/${own}`);
  await expect(page.getByRole('heading', { name: `Own ${unique}` })).toBeVisible();
  await expect(page.getByRole('button', { name: `More actions for Own ${unique}` })).toHaveCount(0);
  const refused = await request.delete(`${API}/api/documents/chart/${own}`);
  expect(refused.status(), await refused.text()).toBe(409);
  expect((await request.get(`${API}/api/documents/chart/${own}`)).status()).toBe(200);
});

test('is held back by no draft in My workspace, whose tile then finds the chart gone', async ({
  page,
  request,
}) => {
  const unique = `draft-${String(Date.now())}`;
  const chart = await create(request, 'chart', `Chart ${unique}`);
  const draft = await create(request, 'dashboard', `Draft ${unique}`, 'mine');
  // A tile showing it, as a draft built in the editor would.
  const read = await request.get(`${API}/api/documents/dashboard/${draft.id}`);
  const stored = (await read.json()) as { body: Record<string, unknown>; version: number };
  const saved = await request.put(`${API}/api/documents/dashboard/${draft.id}`, {
    data: {
      version: stored.version,
      body: {
        ...stored.body,
        pages: [
          {
            id: 'p1',
            title: 'Page 1',
            items: [{ id: 't1', kind: 'chart', w: 6, h: 40, chartId: chart.id }],
          },
        ],
      },
    },
  });
  expect(saved.status(), await saved.text()).toBe(200);

  await page.goto(`/explore/charts/${chart.id}`);
  await askToDelete(page, `Chart ${unique}`);
  const dialog = page.getByRole('alertdialog', { name: `Delete “Chart ${unique}”?` });
  await dialog.getByRole('button', { name: 'Delete chart' }).click();
  await expect(page).toHaveURL(/\/explore$/);

  await page.goto(`/explore/dashboards/${draft.id}`);
  await expect(page.getByTestId('tile-missing-chart')).toHaveText(
    'This chart is no longer available.',
  );
});

test('the service refuses the delete without the dialog, and "confirm" no longer passes it', async ({
  request,
}) => {
  const unique = `del3-${String(Date.now())}`;
  const chart = await create(request, 'chart', `Chart ${unique}`);
  await sharedShowing(request, `Uses ${unique}`, chart.id);

  for (const query of ['', '?confirm=true']) {
    const response = await request.delete(`${API}/api/documents/chart/${chart.id}${query}`);
    expect(response.status()).toBe(409);
    const body = (await response.json()) as { dashboards: { title: string }[]; hidden: number };
    expect(body.dashboards.map((d) => d.title)).toEqual([`Uses ${unique}`]);
    expect(body.hidden).toBe(0);
  }
  expect((await request.get(`${API}/api/documents/chart/${chart.id}`)).status()).toBe(200);
});

test('deletes from its row in Explore, the list staying open', async ({ page, request }) => {
  const title = `Row ${String(Date.now())}`;
  const chart = await create(request, 'chart', title);

  await page.goto('/explore');
  const row = page.getByTestId(`item-${chart.id}`);
  await row.getByRole('button', { name: `Actions for ${title}` }).click();
  await page.getByRole('menuitem', { name: 'Delete…' }).click();
  const dialog = page.getByRole('alertdialog', { name: `Delete “${title}”?` });
  await dialog.getByRole('button', { name: 'Delete chart' }).click();

  await expect(row).toHaveCount(0);
  await expect(page).toHaveURL(/\/explore$/);
  await expect(page.getByRole('status').filter({ hasText: `Deleted “${title}”.` })).toBeVisible();
});
