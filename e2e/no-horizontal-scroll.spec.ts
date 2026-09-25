import { expect, test, type Page } from '@playwright/test';

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
  await page.goto('/explore/dashboards/seed-root-dashboard-1');
  await expect(drawnTile(page, 'tile-status')).toBeVisible({ timeout: 15_000 });
  expect(await overflowOf(page)).toEqual(NONE);

  // In edit mode, with its sidebar beside the canvas.
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Edit sidebar' })).toBeVisible();
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
  await page.goto('/explore/dashboards/seed-root-dashboard-1');
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
    await page.goto('/explore/dashboards/seed-root-dashboard-1');
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

    // For reading: no Edit, no ✎, no way into edit mode.
    await expect(page.getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0);
    await expect(page.locator('[data-edit-chart]')).toHaveCount(0);
    // The canvas does not scroll sideways.
    expect((await overflowOf(page)).canvas).toBe(0);
  });

  test('widened past 1,024 px, the dashboard is its grid again, and Edit comes back', async ({
    page,
  }) => {
    await page.goto('/explore/dashboards/seed-root-dashboard-1');
    await expect(drawnTile(page, 'tile-status')).toBeVisible({ timeout: 15_000 });
    await page.setViewportSize({ width: 1280, height: 844 });
    const status = (await page.locator('[data-tile="tile-status"]').boundingBox())!;
    const notes = (await page.locator('[data-tile="tile-notes"]').boundingBox())!;
    // Side by side again, six columns each.
    expect(notes.y).toBe(status.y);
    await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeVisible();
  });
});

test('a three-column chart tile keeps its title beside its badges at 1,440 px (T250)', async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const api = 'http://localhost:4100/api';
  const name = `Narrow tiles ${String(Date.now())}`;
  const { id } = (await (
    await request.post(`${api}/documents`, {
      data: { kind: 'dashboard', title: name, folderId: 'root' },
    })
  ).json()) as { id: string };
  const chart = (await (
    await request.post(`${api}/documents`, {
      data: { kind: 'chart', title: 'Orders by category and status', folderId: 'root' },
    })
  ).json()) as { id: string };
  await request.put(`${api}/documents/chart/${chart.id}`, {
    data: {
      version: 1,
      body: {
        schemaVersion: 1,
        title: 'Orders by category and status',
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
        folderId: 'root',
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
  await expect(tile.getByTestId('data-as-of')).toBeVisible({ timeout: 15_000 });
  const room = await titleRoom(tile);
  expect(room.whole || room.width >= 64).toBe(true);
});
