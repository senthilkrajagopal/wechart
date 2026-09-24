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
