import { expect, test, type APIRequestContext, type Route } from '@playwright/test';

import { chartGone } from './store';
import { IN_MY_WORKSPACE } from './workspace';

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
    await request.post(`${API}/documents`, {
      data: { kind: 'dashboard', title, ...IN_MY_WORKSPACE },
    })
  ).json()) as { id: string };
  const chartTitle = 'Not yet built';
  const chart = (await (
    await request.post(`${API}/documents`, {
      data: { kind: 'chart', title: chartTitle, ...IN_MY_WORKSPACE },
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
        ...IN_MY_WORKSPACE,
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

/**
 * T741: a menu opened before its tile's answer is in grows as the answer
 * comes (Data as of, Copy, Export…), and is placed again as it grows,
 * turned back from the window's foot. It was placed once, for its first
 * three rows, and ran 100 px past a 720 px window, its last rows out of
 * any pointer's reach (`acceleration.spec.ts:252`'s second visit).
 */
test('a tile menu opened before the answer stays in the window as it grows', async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  const title = `Grows ${String(Date.now())}`;
  const dashboard = (await (
    await request.post(`${API}/documents`, {
      data: { kind: 'dashboard', title, ...IN_MY_WORKSPACE },
    })
  ).json()) as { id: string };
  const wells = { measures: ['orders.count'], dimensions: ['orders.status'], timeDimensions: [] };
  const first = await localChart(request, dashboard.id, 'Orders by status', wells, 'bar');
  const second = await localChart(request, dashboard.id, 'Orders again', wells, 'bar');
  await request.put(`${API}/documents/dashboard/${dashboard.id}`, {
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
            items: [
              { id: 'tile-first', kind: 'chart', w: 6, h: 40, chartId: first },
              { id: 'tile-second', kind: 'chart', w: 6, h: 40, chartId: second },
            ],
          },
        ],
      },
    },
  });

  // The answers held until the menu is open.
  let release = () => {};
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/load', async (route: Route) => {
    await released;
    await route.continue();
  });
  await page.goto(`/explore/dashboards/${dashboard.id}`);
  const tile = page.locator('[data-tile="tile-first"]');
  await tile.getByRole('button', { name: /^Actions for / }).click();
  const menu = page.locator('.tile-view-menu').first();
  await expect(menu).toBeVisible();
  await expect(tile.getByRole('menuitem', { name: /^Data as of \d/ })).toHaveCount(0);

  release();
  const asOf = tile.getByRole('menuitem', { name: /^Data as of \d/ });
  await expect(asOf).toHaveCount(1);

  // Within the window, its foot as reachable as its head.
  await expect
    .poll(async () => {
      const box = await menu.boundingBox();
      return box !== null && box.y >= 8 && box.y + box.height <= 720 - 8;
    })
    .toBe(true);
  await asOf.click();
  await expect(tile.getByRole('menu', { name: /^Data as of \d/ })).toBeVisible();
});

/**
 * T682 (AC-352; design 08; R76 dashboard-Q6): the menu is 284 px wide and as
 * tall as the window allows less 8 px at each side. Its heading and its Data
 * as of stay in view while its actions scroll between them, Data as of in the
 * same menu, so the arrows still reach it last.
 */
test('the menu is 284 px wide, its heading and Data as of in view while its actions scroll', async ({
  page,
}) => {
  // Short enough that the actions can't all show.
  await page.setViewportSize({ width: 1280, height: 420 });
  await page.goto('/explore/dashboards/seed-root-dashboard-1');
  const tile = page.locator('[data-tile="tile-status"]');
  await expect(tile.getByTestId('chart-canvas')).toBeVisible();
  await tile.getByRole('button', { name: /^Actions for / }).click();
  const menu = page.locator('.tile-view-menu').first();
  await expect(menu).toBeVisible();
  const asOf = tile.getByRole('menuitem', { name: /^Data as of \d/ });
  await expect(asOf).toHaveCount(1);
  const box = (await menu.boundingBox())!;
  expect(Math.round(box.width)).toBe(284);
  expect(box.y).toBeGreaterThanOrEqual(8);
  expect(box.y + box.height).toBeLessThanOrEqual(420 - 8);
  // Its actions scroll; its heading and Data as of don't leave it.
  const list = menu.locator(':scope > [role="menu"]');
  expect(await list.evaluate((node) => node.scrollHeight > node.clientHeight)).toBe(true);
  await list.evaluate((node) => {
    node.scrollTop = node.scrollHeight;
  });
  for (const part of [menu.locator('.tile-menu__heading'), asOf]) {
    const own = (await part.boundingBox())!;
    expect(own.y).toBeGreaterThanOrEqual(box.y);
    expect(own.y + own.height).toBeLessThanOrEqual(box.y + box.height + 0.5);
  }
  await list.evaluate((node) => {
    node.scrollTop = 0;
  });
  const foot = (await asOf.boundingBox())!;
  expect(foot.y + foot.height).toBeLessThanOrEqual(box.y + box.height + 0.5);
  // Each row the arrows reach is in view, clear of the pinned footer (T682's
  // review: WCAG 2.4.11), and its icon in the row's middle.
  const first = menu.locator('[role="menuitem"], [role="menuitemcheckbox"]').first();
  await first.focus();
  const rows = await menu
    .locator(':scope > [role="menu"] [role^="menuitem"]:not([data-key="as-of"])')
    .count();
  for (let step = 1; step < rows; step += 1) {
    await page.keyboard.press('ArrowDown');
    const focused = page.locator(':focus');
    if ((await focused.getAttribute('data-key')) === 'as-of') break;
    const [row, footer] = [(await focused.boundingBox())!, (await asOf.boundingBox())!];
    expect(row.y + row.height, `row ${String(step)}`).toBeLessThanOrEqual(footer.y + 0.5);
    expect(row.y, `row ${String(step)}`).toBeGreaterThanOrEqual(box.y);
  }
  const icon = (await menu.locator('[data-key="query"] .menu__icon').boundingBox())!;
  const query = (await menu.locator('[data-key="query"]').boundingBox())!;
  expect(
    Math.abs(icon.y + icon.height / 2 - (query.y + query.height / 2)),
  ).toBeLessThanOrEqual(1);
  // Last by the arrows, as before: End reaches it.
  await page.keyboard.press('End');
  await expect(asOf).toBeFocused();
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
    await request.post(`${API}/documents`, { data: { kind: 'chart', title, ...IN_MY_WORKSPACE } })
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
    await request.post(`${API}/documents`, {
      data: { kind: 'dashboard', title, ...IN_MY_WORKSPACE },
    })
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
  // There when the dashboard is saved, then gone: a save adds only a chart
  // that is there (T359, AC-254).
  const goes = await localChart(request, id, 'Soon gone', {
    measures: ['orders.count'],
    dimensions: [],
    timeDimensions: [],
  });
  const saved = await request.put(`${API}/documents/dashboard/${id}`, {
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
            items: [
              { id: 'tile-untyped', kind: 'chart', w: 3, h: 30, chartId: untyped },
              { id: 'tile-unread', kind: 'chart', w: 3, h: 30, chartId: unread },
              { id: 'tile-gone', kind: 'chart', w: 3, h: 30, chartId: goes },
            ],
          },
        ],
      },
    },
  });
  expect(saved.status(), await saved.text()).toBe(200);
  chartGone(goes);
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
      data: { kind: 'dashboard', title: waitingTitle, ...IN_MY_WORKSPACE },
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
        ...IN_MY_WORKSPACE,
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
