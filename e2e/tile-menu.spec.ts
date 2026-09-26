import { expect, test, type APIRequestContext } from '@playwright/test';

const API = 'http://localhost:4100/api';

/**
 * T404, AC-246: WHEN the user right-clicks a chart tile's plot, or presses
 * Shift+F10 or the Menu key on a focused chart tile, THE SYSTEM SHALL open
 * the tile's menu at the pointer or at the tile, and the browser's own menu
 * SHALL not open there. `Fails when: … the keys do nothing on any chart tile
 * (one with no fields yet included) …`
 *
 * The re-critique found Shift+F10 doing nothing on a chart tile whose chart
 * has no fields yet. Here, a dashboard of one such tile, in view mode.
 */
async function emptyChartDashboard(request: APIRequestContext) {
  const title = `No fields yet ${String(Date.now())}`;
  const dashboard = (await (
    await request.post(`${API}/documents`, { data: { kind: 'dashboard', title, folderId: 'root' } })
  ).json()) as { id: string };
  const chartTitle = 'Not yet built';
  const chart = (await (
    await request.post(`${API}/documents`, {
      data: { kind: 'chart', title: chartTitle, folderId: 'root' },
    })
  ).json()) as { id: string };
  await request.put(`${API}/documents/chart/${chart.id}`, {
    data: {
      version: 1,
      body: {
        schemaVersion: 1,
        title: chartTitle,
        owner: 'admin',
        localToDashboardId: dashboard.id,
        chart: {
          source: { cube: 'orders' },
          wells: { measures: [], dimensions: [], timeDimensions: [] },
          chartType: 'bar',
          options: {},
        },
      },
    },
  });
  await request.put(`${API}/documents/dashboard/${dashboard.id}`, {
    data: {
      version: 1,
      body: {
        schemaVersion: 1,
        title,
        folderId: 'root',
        owner: 'admin',
        settings: { width: 'fixed' },
        pages: [
          {
            id: 'only',
            title: 'Only',
            items: [{ id: 'tile-empty', kind: 'chart', w: 6, h: 40, chartId: chart.id }],
          },
        ],
      },
    },
  });
  return { id: dashboard.id, chartTitle };
}

test('Shift+F10 and the Menu key open the menu of a chart tile with no fields yet', async ({
  page,
  request,
}) => {
  const { id, chartTitle } = await emptyChartDashboard(request);
  await page.goto(`/explore/dashboards/${id}`);
  const tile = page.locator('[data-tile="tile-empty"]');
  // Its chart read: what it needs said, and its menu there to open.
  await expect(tile.getByTestId('tile-empty-chart')).toBeVisible();
  await expect(page.getByTestId('tile-view-menu-tile-empty')).toBeVisible({ timeout: 15_000 });
  await page.evaluate(() => {
    const keys: boolean[] = [];
    Object.assign(window, { __keys: keys });
    document.addEventListener('keydown', (event) => {
      if ((event.key === 'F10' && event.shiftKey) || event.key === 'ContextMenu')
        keys.push(event.defaultPrevented);
    });
  });

  const menu = page.getByRole('menu', { name: `Actions for ${chartTitle}` });
  for (const key of ['Shift+F10', 'ContextMenu']) {
    await tile.focus();
    await expect(tile).toBeFocused();
    await page.keyboard.press(key);
    await expect(menu).toBeVisible();
    await expect(menu.getByRole('menuitem').first()).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(tile).toBeFocused();
  }
  // Each key's default prevented: no browser makes it a menu of its own.
  expect(await page.evaluate(() => (window as unknown as { __keys: boolean[] }).__keys)).toEqual([
    true,
    true,
  ]);

  // What it offers with nothing drawn: its editor, and nothing to export or
  // query, saying why.
  await tile.focus();
  await page.keyboard.press('Shift+F10');
  await expect(menu.getByRole('menuitem', { name: 'Edit chart' })).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: 'View query' })).toHaveCount(0);
  await tile.getByRole('menuitem', { name: /^Export/ }).click();
  const csv = tile.getByRole('menuitem', { name: 'CSV', exact: true });
  await expect(csv).toHaveAttribute('aria-disabled', 'true');
  await expect(csv).toHaveAccessibleDescription(
    'This chart has no fields yet, so nothing is drawn to copy or export.',
  );
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);

  // A tab stop, as every chart tile is: reached by Tab from the page.
  await page.locator('body').focus();
  let reached = false;
  for (let press = 0; press < 40 && !reached; press += 1) {
    await page.keyboard.press('Tab');
    reached = await tile.evaluate((node) => node === document.activeElement);
  }
  expect(reached).toBe(true);
});

/** A chart of the dashboard's own, from its wells and, if chosen, its type. */
async function localChart(
  request: APIRequestContext,
  dashboardId: string,
  title: string,
  wells: { measures: string[]; dimensions: string[]; timeDimensions: string[] },
  chartType?: string,
) {
  const created = (await (
    await request.post(`${API}/documents`, { data: { kind: 'chart', title, folderId: 'root' } })
  ).json()) as { id: string };
  await request.put(`${API}/documents/chart/${created.id}`, {
    data: {
      version: 1,
      body: {
        schemaVersion: 1,
        title,
        owner: 'admin',
        localToDashboardId: dashboardId,
        chart: {
          source: { cube: 'orders' },
          wells,
          ...(chartType === undefined ? {} : { chartType }),
          options: {},
        },
      },
    },
  });
  return created.id;
}

/**
 * T404's review, and the user's ruling on it: every chart tile's menu opens
 * from the keys, whatever state its chart is in, offering what it has and
 * refusing the rest with its reason — a chart with no type yet (its query
 * kept), one still waiting for its first answer, one whose document couldn't
 * be read, and one that is gone.
 */
test('Shift+F10 opens every other chart tile’s menu too, each saying why nothing is drawn', async ({
  page,
  request,
}) => {
  const title = `Every state ${String(Date.now())}`;
  const { id } = (await (
    await request.post(`${API}/documents`, { data: { kind: 'dashboard', title, folderId: 'root' } })
  ).json()) as { id: string };
  // A time alone: no type the recommender can place.
  const untyped = await localChart(request, id, 'No type yet', {
    measures: [],
    dimensions: [],
    timeDimensions: ['orders.ordered_at'],
  });
  const unread = await localChart(
    request,
    id,
    'Could not read',
    { measures: ['orders.count'], dimensions: [], timeDimensions: [] },
    'kpi',
  );
  await request.put(`${API}/documents/dashboard/${id}`, {
    data: {
      version: 1,
      body: {
        schemaVersion: 1,
        title,
        folderId: 'root',
        owner: 'admin',
        settings: { width: 'fixed' },
        pages: [
          {
            id: 'only',
            title: 'Only',
            items: [
              { id: 'tile-untyped', kind: 'chart', w: 3, h: 30, chartId: untyped },
              { id: 'tile-unread', kind: 'chart', w: 3, h: 30, chartId: unread },
              { id: 'tile-gone', kind: 'chart', w: 3, h: 30, chartId: 'no-such-chart' },
            ],
          },
        ],
      },
    },
  });
  // The unread chart's document never arrives.
  await page.route(`**/api/documents/chart/${unread}`, (route) => route.abort('failed'));
  await page.goto(`/explore/dashboards/${id}`);

  const says = async (
    tileId: string,
    reason: string,
    offers: { edit: boolean; query: boolean },
  ) => {
    const tile = page.locator(`[data-tile="${tileId}"]`);
    await expect(page.getByTestId(`tile-view-menu-${tileId}`)).toBeVisible({ timeout: 15_000 });
    await tile.focus();
    await page.keyboard.press('Shift+F10');
    const menu = tile.getByRole('menu', { name: /^Actions for / });
    await expect(menu, tileId).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: 'Edit chart' }), tileId).toHaveCount(
      offers.edit ? 1 : 0,
    );
    await expect(menu.getByRole('menuitem', { name: 'View query' }), tileId).toHaveCount(
      offers.query ? 1 : 0,
    );
    await tile.getByRole('menuitem', { name: /^Export/ }).click();
    const csv = tile.getByRole('menuitem', { name: 'CSV', exact: true });
    await expect(csv, tileId).toHaveAttribute('aria-disabled', 'true');
    await expect(csv, tileId).toHaveAccessibleDescription(reason);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
  };

  await says(
    'tile-untyped',
    'This chart has no chart type yet, so nothing is drawn to copy or export.',
    { edit: true, query: true },
  );
  await says(
    'tile-unread',
    'The chart could not be loaded, so nothing is drawn to copy or export.',
    { edit: true, query: false },
  );
  await says(
    'tile-gone',
    'This chart is no longer available, so nothing is drawn to copy or export.',
    { edit: false, query: false },
  );

  /**
   * One still waiting for its first answer, on a dashboard of its own: a
   * dashboard's charts are read together, so every tile beside it would wait
   * with it. Its answer never comes here.
   */
  const waitingTitle = `Still asking ${String(Date.now())}`;
  const waiting = (await (
    await request.post(`${API}/documents`, {
      data: { kind: 'dashboard', title: waitingTitle, folderId: 'root' },
    })
  ).json()) as { id: string };
  const slow = await localChart(
    request,
    waiting.id,
    'Still asking',
    { measures: ['orders.total_amount'], dimensions: ['orders.status'], timeDimensions: [] },
    'bar',
  );
  await request.put(`${API}/documents/dashboard/${waiting.id}`, {
    data: {
      version: 1,
      body: {
        schemaVersion: 1,
        title: waitingTitle,
        folderId: 'root',
        owner: 'admin',
        settings: { width: 'fixed' },
        pages: [
          {
            id: 'only',
            title: 'Only',
            items: [{ id: 'tile-slow', kind: 'chart', w: 6, h: 30, chartId: slow }],
          },
        ],
      },
    },
  });
  await page.route('**/api/load', () => undefined);
  await page.goto(`/explore/dashboards/${waiting.id}`);
  await says(
    'tile-slow',
    'Its first answer is still on its way, so nothing is drawn to copy or export yet.',
    { edit: true, query: false },
  );
});
