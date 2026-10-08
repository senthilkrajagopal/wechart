import { expect, test } from '@playwright/test';

/**
 * T681's follow-up (R76 dashboard-Q1; design 04 pins 5–6; direction.md §6
 * and rule 5): on a dashboard, a tile's Table view is ⋯'s "View as table",
 * and a chart of 4 or fewer series names each where it ends, beside its
 * legend, so identity never rests on colour alone.
 *
 * The seed's two charts are split by the 3 order statuses: a bar by
 * category, and a time series by month.
 */
const STATUSES = ['completed', 'processing', 'shipped'];

/** How often each status is written on a tile's chart. */
const namedIn = async (tile: import('@playwright/test').Locator) => {
  const texts = await tile.locator('svg text').allTextContents();
  return STATUSES.map((status) => texts.filter((text) => text === status).length);
};

test('a tile of 3 series names each twice: in its legend, and where it ends', async ({ page }) => {
  await page.goto('/explore/dashboards/seed-root-dashboard-1');
  // Bars by category: each status's last bar named over it.
  const status = page.locator('[data-tile="tile-status"]');
  await expect(status.getByTestId('chart-canvas')).toBeVisible();
  // No Table view button in its head: the table is ⋯'s.
  await expect(status.getByTestId('toggle-table-view')).toHaveCount(0);
  await expect.poll(() => namedIn(status)).toEqual([2, 2, 2]);

  // Bars by day, the last day's three side by side: a name that would meet
  // another is hidden, which the legend still names (the coordinator's call
  // on research/echarts-end-labels.md). One at least is drawn.
  const region = page.locator('[data-tile="tile-region"]');
  await expect(region.getByTestId('chart-canvas')).toBeVisible();
  await expect
    .poll(async () => {
      const counts = await namedIn(region);
      return counts.every((count) => count >= 1) && counts.reduce((a, b) => a + b, 0) >= 4;
    })
    .toBe(true);
});

test('its table is one menu away, and back to its chart', async ({ page }) => {
  await page.goto('/explore/dashboards/seed-root-dashboard-1');
  const tile = page.locator('[data-tile="tile-status"]');
  await tile.getByRole('button', { name: /^Actions for / }).click();
  await tile
    .getByRole('menu', { name: /^Actions for / })
    .getByRole('menuitem', { name: 'View as table', exact: true })
    .click();
  await expect(tile.getByTestId('data-table')).toBeVisible();
  await tile.getByRole('button', { name: /^Actions for / }).click();
  await tile
    .getByRole('menu', { name: /^Actions for / })
    .getByRole('menuitem', { name: 'View as chart', exact: true })
    .click();
  await expect(tile.getByTestId('chart-canvas')).toBeVisible();
});
