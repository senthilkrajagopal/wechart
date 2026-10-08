import { expect, type Locator } from '@playwright/test';

/**
 * A dashboard tile's table, or its chart again, from its ⋯ menu: "View as
 * table" and "View as chart" (T681's follow-up; R76 dashboard-Q1; design 04
 * pin 5). A tile's head has no Table view button since.
 */
export async function viewAs(tile: Locator, view: 'table' | 'chart'): Promise<void> {
  await tile.getByRole('button', { name: /^Actions for / }).click();
  const menu = tile.getByRole('menu', { name: /^Actions for / });
  await expect(menu).toBeVisible();
  await menu.getByRole('menuitem', { name: `View as ${view}`, exact: true }).click();
}
