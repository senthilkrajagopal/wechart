import { expect, test, type Page } from '@playwright/test';

import { IN_MY_WORKSPACE, seedDashboardCopy } from './workspace';

/**
 * T184 / AC-179: THE SYSTEM SHALL render dashboards, the chart editor and the
 * model editor without horizontal scrolling at a viewport width of 1,280
 * pixels.
 * Fails when: any of those surfaces scrolls horizontally at that width.
 *
 * What counts, as the user ruled (2026-09-22): the page and each surface's
 * own scroll area never scroll sideways — the document, the app shell's main
 * region, and a dashboard's canvas, which is what scrolls a dashboard. Panes
 * within a surface may scroll within themselves: the chart preview at Actual
 * size, the code editor's long lines, a wide table tile, a tab strip.
 * Measured in each browser, each surface once its content is drawn.
 */
const WIDTH = 1280;

/** How far each of a surface's own scroll areas reaches past its width. */
async function overflowOf(page: Page) {
  return page.evaluate(() => {
    const over = (element: Element | null) =>
      element === null ? 0 : element.scrollWidth - element.clientWidth;
    return {
      page: over(document.scrollingElement),
      main: over(document.querySelector('main')),
      canvas: over(document.querySelector('[data-testid="canvas-scroll"]')),
    };
  });
}

const NONE = { page: 0, main: 0, canvas: 0 };

test.use({ viewport: { width: WIDTH, height: 800 } });

const drawnTile = (page: Page, tile: string) =>
  page.locator(`[data-tile="${tile}"]`).locator('[data-testid="chart-canvas"]');

test('a dashboard does not scroll sideways at 1,280 px, viewed or edited', async ({ page }) => {
  // The seeded company dashboard: charts, notes and a section.
  // The single user's copy, which they edit (T359, AC-254).
  await page.goto(await seedDashboardCopy());
  await expect(drawnTile(page, 'tile-status')).toBeVisible({ timeout: 15_000 });
  expect(await overflowOf(page)).toEqual(NONE);

  // In edit mode, with its sidebar beside the canvas.
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Edit sidebar' })).toBeVisible();
  expect(await overflowOf(page)).toEqual(NONE);
});

test('the SQL runner workspace does not scroll sideways at 1,280 px (T797)', async ({ page }) => {
  await page.goto('/sql');
  await expect(page.getByRole('region', { name: 'SQL runner' })).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'Data source and schema' })).toBeVisible();
  expect(await overflowOf(page)).toEqual(NONE);
});

test('the chart editor does not scroll sideways at 1,280 px', async ({ page }) => {
  // A chart with fields in its wells, its result and preview drawn.
  await page.goto('/explore/charts/seed-chart-status/edit');
  await expect(page.getByTestId('result-row-count')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('chart-canvas')).toBeVisible();
  expect(await overflowOf(page)).toEqual(NONE);
});

test('the chart editor over a dashboard does not scroll the page sideways', async ({ page }) => {
  // The widest tile the seed has, so its preview at Actual size is wide.
  // The single user's copy, which they edit (T359, AC-254).
  await page.goto(await seedDashboardCopy());
  await expect(drawnTile(page, 'tile-region')).toBeVisible({ timeout: 15_000 });
  await page.locator('[data-tile="tile-region"]').hover();
  await page.locator('[data-tile="tile-region"] [data-edit-chart]').click();
  await expect(page.getByTestId('result-row-count')).toBeVisible({ timeout: 15_000 });
  // Its preview pane may scroll within itself; the page may not.
  const { page: pageOver, main } = await overflowOf(page);
  expect({ page: pageOver, main }).toEqual({ page: 0, main: 0 });

  // Nor with the longest thing its one header row says: a refused save's
  // reason, which sits beside Save dashboard (T228's review).
  await page
    .getByTestId('editor-save-blocked')
    .evaluate((node) =>
      node.append(
        'This chart belongs to another dashboard, so a change to it can only be saved with that dashboard. Back keeps the change on this one, unsaved.',
      ),
    );
  const blocked = await overflowOf(page);
  expect({ page: blocked.page, main: blocked.main }).toEqual({ page: 0, main: 0 });
  await expect(page.getByTestId('editor-save-dashboard')).toBeInViewport();
});

test('the model editor does not scroll sideways at 1,280 px', async ({ page }) => {
  await page.goto('/model/files/cubes%2Forders.yml');
  await expect(page.getByRole('textbox', { name: 'cubes/orders.yml, as YAML' })).toContainText(
    'sql_table: public.orders',
  );
  expect(await overflowOf(page)).toEqual(NONE);
});

/**
 * A chart tile's title keeps its room beside the tile's badges (T250): shown
 * whole, or at least 64 px of it — eight characters or so — never squeezed to
 * nothing, which a three-column tile's head did at 1,440 px beside
 * "● Live · as of …" and "Table view" (the Superset parity exercise,
 * 2026-09-25).
 */
async function titleRoom(tile: import('@playwright/test').Locator) {
  return tile.locator('.tile-head__title').evaluate((title) => ({
    width: title.clientWidth,
    whole: title.scrollWidth <= title.clientWidth,
  }));
}

/**
 * T250 (AC-187), direction.md §2: "<1024: view mode only. Dashboards stack
 * to one column." recheck-dashboard N2: at 390 px the tiles stayed side by
 * side at 163 px, a chart's title was gone, and Edit was still offered.
 */
test.describe('T250: below 1,024 px, a dashboard is for reading', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('at 390 × 844 its tiles stack to one column, each keeps its title, and Edit is not offered', async ({
    page,
  }) => {
    // The single user's copy, which they edit (T359, AC-254).
    await page.goto(await seedDashboardCopy());
    await expect(drawnTile(page, 'tile-status')).toBeVisible({ timeout: 15_000 });

    // One column: every element on the page as wide as the grid.
    const grid = page.locator('.grid-canvas').first();
    const gridWidth = await grid.evaluate(
      (element) =>
        element.clientWidth -
        parseFloat(getComputedStyle(element).paddingLeft) -
        parseFloat(getComputedStyle(element).paddingRight),
    );
    for (const id of ['tile-status', 'tile-notes', 'section-detail']) {
      const width = (await page.locator(`[data-tile="${id}"]`).boundingBox())?.width ?? 0;
      expect(Math.abs(width - gridWidth)).toBeLessThanOrEqual(1);
    }
    // Stacked, not side by side: the notes are below the chart.
    const status = (await page.locator('[data-tile="tile-status"]').boundingBox())!;
    const notes = (await page.locator('[data-tile="tile-notes"]').boundingBox())!;
    expect(notes.y).toBeGreaterThanOrEqual(status.y + status.height);

    // Each chart keeps its title.
    for (const id of ['tile-status', 'tile-region']) {
      const room = await titleRoom(page.locator(`[data-tile="${id}"]`));
      expect(room.whole || room.width >= 64).toBe(true);
    }

    // For reading: no Edit, no ✎, no way into edit mode — nor into the
    // settings, whose Save writes the dashboard (T250's review).
    await expect(page.getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0);
    await expect(page.locator('[data-edit-chart]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Dashboard settings' })).toHaveCount(0);
    const statusTile = page.locator('[data-tile="tile-status"]');
    await statusTile.getByTestId('tile-view-menu-tile-status').click();
    const menu = statusTile.getByRole('menu', { name: /^Actions for / });
    await expect(menu.getByRole('menuitem', { name: 'View query' })).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: 'Edit chart' })).toHaveCount(0);
    await page.keyboard.press('Escape');
    // Table view is ⋯'s, so the narrow head holds no button at all (T681's
    // follow-up; R76 dashboard-Q1), and the menu offers it.
    await expect(statusTile.getByRole('button', { name: 'Table view' })).toHaveCount(0);
    await statusTile.getByTestId('tile-view-menu-tile-status').click();
    await expect(
      statusTile
        .getByRole('menu', { name: /^Actions for / })
        .getByRole('menuitem', { name: 'View as table', exact: true }),
    ).toHaveCount(1);
    await page.keyboard.press('Escape');
    // The badge says the whole of itself in its tooltip, however little room it has.
    await expect(statusTile.getByTestId('tile-freshness')).toHaveAttribute(
      'title',
      /^Live query · as of /,
    );
    // The canvas does not scroll sideways.
    expect((await overflowOf(page)).canvas).toBe(0);
  });

  test('widened past 1,024 px, the dashboard is its grid again, and Edit comes back', async ({
    page,
  }) => {
    // The single user's copy, which they edit (T359, AC-254).
    await page.goto(await seedDashboardCopy());
    await expect(drawnTile(page, 'tile-status')).toBeVisible({ timeout: 15_000 });
    await page.setViewportSize({ width: 1280, height: 844 });
    // Side by side again, six columns each: read once the page has come to
    // rest, since the narrow header's page row (T842) goes as it widens.
    await expect
      .poll(async () => {
        const status = (await page.locator('[data-tile="tile-status"]').boundingBox())!;
        const notes = (await page.locator('[data-tile="tile-notes"]').boundingBox())!;
        return notes.y - status.y;
      })
      .toBe(0);
    const status = (await page.locator('[data-tile="tile-status"]').boundingBox())!;
    const notes = (await page.locator('[data-tile="tile-notes"]').boundingBox())!;
    expect(notes.y).toBe(status.y);
    await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeVisible();
    // With room, the freshness badge's dot and word keep design 04's 5 px apart
    // (T681; T250's review: its gap stopped applying to inline parts). Its
    // words for a screen reader are out of sight, and out of the measure.
    const gaps = await page
      .locator('[data-tile="tile-status"]')
      .getByTestId('tile-freshness')
      .evaluate((badge) => {
        const parts = [...badge.children]
          .filter((part) => !part.classList.contains('visually-hidden'))
          .map((part) => part.getBoundingClientRect());
        return parts.slice(1).map((part, at) => part.left - (parts[at]?.right ?? 0));
      });
    expect(gaps.length).toBeGreaterThan(0);
    for (const gap of gaps) expect(Math.round(gap)).toBe(5);
  });
});

test('while previewing, Refresh and SQL each keep their own place in the tile’s corner (T250’s review)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(
    `/explore/dashboards/seed-root-dashboard-1?preview=${encodeURIComponent(JSON.stringify({}))}`,
  );
  const tile = page.locator('[data-tile="tile-status"]');
  await expect(tile.getByTestId('chart-canvas')).toBeVisible({ timeout: 15_000 });
  await tile.hover();
  const refresh = (await tile.getByRole('button', { name: /^Refresh / }).boundingBox())!;
  const sql = (await tile.getByRole('button', { name: /^SQL for / }).boundingBox())!;
  const apart = refresh.x + refresh.width <= sql.x || sql.x + sql.width <= refresh.x;
  expect(apart).toBe(true);
});

test('a three-column chart tile keeps its title beside its badges at 1,440 px (T250)', async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const api = 'http://localhost:4100/api';
  const name = `Narrow tiles ${String(Date.now())}`;
  // A title of its own, as long as a seeded chart's: sharing the seed's
  // "Orders by category and status" gave model.spec.ts's list of the charts
  // using orders.count two items of that name.
  const chartTitle = `Narrow tile chart ${String(Date.now())}`;
  const { id } = (await (
    await request.post(`${api}/documents`, {
      data: { kind: 'dashboard', title: name, ...IN_MY_WORKSPACE },
    })
  ).json()) as { id: string };
  const chart = (await (
    await request.post(`${api}/documents`, {
      data: { kind: 'chart', title: chartTitle, ...IN_MY_WORKSPACE },
    })
  ).json()) as { id: string };
  await request.put(`${api}/documents/chart/${chart.id}`, {
    data: {
      version: 1,
      body: {
        schemaVersion: 1,
        title: chartTitle,
        owner: 'admin',
        localToDashboardId: id,
        chart: {
          source: { cube: 'orders' },
          wells: { measures: ['orders.count'], dimensions: ['orders.status'], timeDimensions: [] },
          chartType: 'bar',
        },
      },
    },
  });
  await request.put(`${api}/documents/dashboard/${id}`, {
    data: {
      version: 1,
      body: {
        schemaVersion: 1,
        title: name,
        ...IN_MY_WORKSPACE,
        owner: 'admin',
        settings: { width: 'fixed' },
        pages: [
          {
            id: 'only',
            title: 'Only',
            items: [{ id: 'tile-narrow', kind: 'chart', w: 3, h: 40, chartId: chart.id }],
          },
        ],
      },
    },
  });
  await page.goto(`/explore/dashboards/${id}`);
  const tile = page.locator('[data-tile="tile-narrow"]');
  // Its answer in: the one freshness badge shows (T681).
  await expect(tile.getByTestId('tile-freshness')).toBeVisible({ timeout: 15_000 });
  const room = await titleRoom(tile);
  expect(room.whole || room.width >= 64).toBe(true);
});
