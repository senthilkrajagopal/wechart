import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

import { sharedIn } from './workspace';

/**
 * F43, the compact dashboard header (design 19; direction.md §7g).
 */

/**
 * A shared dashboard of the spec's own, outside My workspace: a description,
 * two page tabs, a filter, and notes tall enough that its canvas scrolls.
 */
async function sharedDashboard(request: APIRequestContext): Promise<{ id: string; title: string }> {
  const title = `Header ${String(Date.now())}-${String(Math.round(Math.random() * 1e6))}`;
  const notes = Array.from({ length: 6 }, (_, index) => ({
    id: `notes-${String(index)}`,
    kind: 'markdown',
    w: 12,
    h: 40,
    text: `Notes ${String(index + 1)}`,
  }));
  const id = await sharedIn(request, 'dashboard', 'root', {
    title,
    description: 'Monthly revenue, orders and top products for the EMEA region.',
    settings: { width: 'full' },
    pages: [
      { id: 'overview', title: 'Overview', items: notes },
      { id: 'detail', title: 'Detail', items: [] },
    ],
    filters: [{ id: 'f-status', widget: 'checkbox', member: 'orders.status' }],
  });
  return { id, title };
}

const row = (page: Page) => page.locator('.dashboard__header');
const canvas = (page: Page) => page.getByTestId('canvas-scroll');

/**
 * T829 (AC-484, AC-196, AC-496): one 48 px row, fixed above the scrolling
 * tiles with its page tabs, the canvas starting at most 96 px down.
 */
for (const size of [
  { width: 1440, height: 900 },
  { width: 1280, height: 720 },
]) {
  test(`the compact row: 48 px, fixed with its tabs while the tiles scroll, the canvas at most 96 px down, at ${String(size.width)} × ${String(size.height)}`, async ({
    page,
    request,
  }) => {
    const { id, title } = await sharedDashboard(request);
    await page.setViewportSize(size);
    await page.goto(`/explore/dashboards/${id}`);
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
    await expect(page.getByText('Notes 1')).toBeVisible();

    // One row, 48 px tall, its tabs in it.
    const header = await row(page).boundingBox();
    expect(header?.height).toBe(48);
    const tabs = row(page).getByRole('tablist', { name: 'Pages' });
    await expect(tabs.getByRole('tab')).toHaveText(['Overview', 'Detail']);
    const tabsBox = await tabs.boundingBox();
    // On the row's line, not wrapped under it.
    expect(tabsBox?.y ?? 0).toBeGreaterThanOrEqual(header?.y ?? 0);
    expect((tabsBox?.y ?? 0) + (tabsBox?.height ?? 0)).toBeLessThanOrEqual(
      (header?.y ?? 0) + (header?.height ?? 0),
    );

    // The canvas's top: the 48 px app bar, then the 48 px row (AC-496).
    const top = (await canvas(page).boundingBox())?.y ?? Number.POSITIVE_INFINITY;
    expect(top).toBeLessThanOrEqual(96);

    // Scrolled 600 px, the tiles move and the row and its tabs stay.
    const scrolled = await canvas(page).evaluate((node) => {
      node.scrollTop = 600;
      return node.scrollTop;
    });
    expect(scrolled).toBe(600);
    await expect(page.getByText('Notes 1')).not.toBeInViewport();
    expect(await row(page).boundingBox()).toEqual(header);
    expect(await tabs.boundingBox()).toEqual(tabsBox);
    await expect(tabs).toBeInViewport({ ratio: 1 });
    expect((await canvas(page).boundingBox())?.y).toBe(top);
  });
}
