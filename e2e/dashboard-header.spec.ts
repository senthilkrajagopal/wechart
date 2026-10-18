import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

import { headerSheet, openHeaderSheet } from './dashboardHeader';
import { sharedIn } from './workspace';

/**
 * F43, the compact dashboard header (design 19; direction.md §7g).
 */

/**
 * A shared dashboard of the spec's own, outside My workspace: a description,
 * two page tabs, a filter, and notes tall enough that its canvas scrolls.
 */
async function sharedDashboard(
  request: APIRequestContext,
  named?: (unique: string) => string,
): Promise<{ id: string; title: string }> {
  const unique = `${String(Date.now())}-${String(Math.round(Math.random() * 1e6))}`;
  const title = named?.(unique) ?? `Header ${unique}`;
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
    // With a filter set (AC-496's dashboard).
    const filters = [
      { id: 'f-status', member: 'orders.status', value: { kind: 'values', values: ['shipped'] } },
    ];
    await page.goto(
      `/explore/dashboards/${id}?filters=${encodeURIComponent(JSON.stringify(filters))}`,
    );
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
    await expect(page.getByText('Notes 1')).toBeVisible();

    // One row, 48 px tall, its tabs in it.
    const header = await row(page).boundingBox();
    expect(header?.height).toBe(48);
    // Nothing wrapped out of it: each of its parts wholly inside its box, and
    // in the window (T829's review).
    const parts = row(page).locator(':scope > :visible');
    const count = await parts.count();
    expect(count).toBeGreaterThan(5);
    for (let at = 0; at < count; at += 1) {
      const box = (await parts.nth(at).boundingBox())!;
      expect(box.y, String(at)).toBeGreaterThanOrEqual(header?.y ?? 0);
      expect(box.y + box.height, String(at)).toBeLessThanOrEqual(
        (header?.y ?? 0) + (header?.height ?? 0),
      );
      expect(box.x + box.width, String(at)).toBeLessThanOrEqual(size.width);
    }
    await expect(row(page).getByRole('button', { name: /^Filters\b/ })).toBeInViewport({
      ratio: 1,
    });
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

/**
 * T830 (AC-485; design 19 pins 1 and 2, state G): the title at text-lg
 * 20/26/600, cut short with "…" when the row has no room, never under
 * 160 px, whole in its tooltip and name, and whole at the top of the open
 * sheet only when cut.
 */
test('a long title is cut on its one line, whole in its tooltip, its name and the open sheet; a short one is not repeated', async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const { id, title } = await sharedDashboard(request, (unique) =>
    `Quarterly revenue, margin and fulfilment review for the EMEA regional leads ${unique} `.padEnd(
      120,
      'x',
    ),
  );
  expect(title).toHaveLength(120);
  await page.goto(`/explore/dashboards/${id}`);
  const heading = page.getByRole('heading', { level: 1, name: title, exact: true });
  await expect(heading).toBeVisible();

  // 20 px at 600, on one line, at least 160 px wide, cut with an ellipsis.
  const drawn = await heading.evaluate((node) => {
    const style = getComputedStyle(node);
    return {
      size: style.fontSize,
      weight: style.fontWeight,
      overflow: style.textOverflow,
      lineHeight: Number.parseFloat(style.lineHeight),
      height: node.getBoundingClientRect().height,
      width: node.getBoundingClientRect().width,
      cut: node.scrollWidth > node.clientWidth,
    };
  });
  expect(drawn.size).toBe('20px');
  expect(drawn.weight).toBe('600');
  expect(drawn.overflow).toBe('ellipsis');
  expect(drawn.height).toBe(drawn.lineHeight);
  expect(drawn.width).toBeGreaterThanOrEqual(160);
  expect(drawn.cut).toBe(true);
  await expect(heading).toHaveAttribute('title', title);

  // Every tab and action still in the row, and in the window.
  const header = (await row(page).boundingBox())!;
  const parts = row(page).locator('a:visible, button:visible');
  const count = await parts.count();
  expect(count).toBeGreaterThan(5);
  for (let at = 0; at < count; at += 1) {
    const box = (await parts.nth(at).boundingBox())!;
    expect(box.y, String(at)).toBeGreaterThanOrEqual(header.y);
    expect(box.y + box.height, String(at)).toBeLessThanOrEqual(header.y + header.height);
    expect(box.x + box.width, String(at)).toBeLessThanOrEqual(1440);
  }
  expect(header.height).toBe(48);

  // The open sheet starts with the whole title.
  await openHeaderSheet(page);
  const sheet = headerSheet(page);
  await expect(sheet.locator('.header-sheet__title')).toHaveText(title);
  const [whole, description] = [
    await sheet.locator('.header-sheet__title').boundingBox(),
    await sheet.locator('.dashboard__description').boundingBox(),
  ];
  expect((whole?.y ?? 0) + (whole?.height ?? 0)).toBeLessThanOrEqual(description?.y ?? 0);

  // A short title, whole in the row, is not repeated there.
  const short = await sharedDashboard(request);
  await page.goto(`/explore/dashboards/${short.id}`);
  await expect(page.getByRole('heading', { level: 1, name: short.title })).toBeVisible();
  expect(
    await page
      .getByRole('heading', { level: 1 })
      .evaluate((node) => node.scrollWidth > node.clientWidth),
  ).toBe(false);
  await openHeaderSheet(page);
  await expect(headerSheet(page).locator('.dashboard__description')).toBeVisible();
  await expect(headerSheet(page).locator('.header-sheet__title')).toHaveCount(0);
});
