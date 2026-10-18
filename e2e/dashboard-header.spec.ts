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
 * T831 (AC-486; design 19 pin 6, states B3 and E): the toggle, last in the
 * row, a disclosure button for the sheet, counting the filters set, named and
 * described by them; Enter and Space open and close it, focus staying on it.
 */
test('the Filters toggle counts the filters set, says which, and opens and closes the sheet by the keyboard', async ({
  page,
  request,
}) => {
  const { id, title } = await sharedDashboard(request);
  const filters = [
    { id: 'f-status', member: 'orders.status', value: { kind: 'values', values: ['shipped'] } },
  ];
  await page.goto(
    `/explore/dashboards/${id}?filters=${encodeURIComponent(JSON.stringify(filters))}`,
  );
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();

  const toggle = row(page).getByRole('button', { name: 'Filters, 1 set' });
  await expect(toggle).toHaveAccessibleDescription('1 of 1 filters set: Orders Status');
  await expect(toggle).toHaveAttribute('title', '1 of 1 filters set: Orders Status');
  await expect(toggle.locator('.header-toggle__count')).toHaveText('1');
  await expect(toggle.locator('.header-toggle__funnel')).toBeVisible();
  await expect(toggle.locator('.header-toggle__chevron')).toBeVisible();
  // Last in the row.
  await expect(row(page).locator(':scope > :visible').last()).toHaveClass(/header-toggle/);
  // aria-controls names the sheet.
  const controls = (await toggle.getAttribute('aria-controls')) ?? '';
  await expect(page.locator(`[id="${controls}"]`)).toHaveAttribute(
    'aria-label',
    'Filters and details',
  );

  // Enter and Space, focus kept on it.
  await toggle.focus();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await page.keyboard.press('Enter');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(headerSheet(page)).toBeVisible();
  await expect(toggle).toBeFocused();
  await page.keyboard.press('Space');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(headerSheet(page)).toBeHidden();
  await expect(toggle).toBeFocused();

  // Cleared in the open sheet: none set, and no count.
  await page.keyboard.press('Space');
  await headerSheet(page).getByRole('button', { name: 'Clear Orders Status' }).click();
  const none = row(page).getByRole('button', { name: 'Filters, none set' });
  await expect(none).toHaveAccessibleDescription('0 of 1 filters set');
  await expect(none.locator('.header-toggle__count')).toHaveCount(0);
});

test('a dashboard with no filters reads "Details", with the info icon and no count', async ({
  page,
  request,
}) => {
  const title = `Details ${String(Date.now())}`;
  const id = await sharedIn(request, 'dashboard', 'root', {
    title,
    description: 'Notes for the EMEA leads.',
    pages: [{ id: 'only', title: 'Only', items: [] }],
  });
  await page.goto(`/explore/dashboards/${id}`);
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();

  const details = row(page).getByRole('button', { name: 'Details', exact: true });
  await expect(details).toHaveText('Details');
  await expect(details.locator('.header-toggle__info')).toBeVisible();
  await expect(details.locator('.header-toggle__count')).toHaveCount(0);
  await expect(row(page).getByRole('button', { name: /^Filters\b/ })).toHaveCount(0);
  // It still opens the sheet, with the description in it.
  await details.click();
  await expect(headerSheet(page).getByText('Notes for the EMEA leads.')).toBeVisible();
});

/** A box as `getBoundingClientRect` draws it: x, y, width, height. */
type Box = { x: number; y: number; width: number; height: number };

/** Whether two boxes share any area (touching edges don't). */
const overlaps = (a: Box, b: Box): boolean =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/**
 * Each tile's box as the reader sees it: clipped to the canvas that scrolls
 * it, since a tile scrolled up out of view is drawn nowhere. None where it is
 * wholly out of view.
 */
async function visibleTiles(page: Page): Promise<Box[]> {
  return page.evaluate(() => {
    const canvas = document.querySelector('[data-testid="canvas-scroll"]')!.getBoundingClientRect();
    return [...document.querySelectorAll('.grid-tile')].flatMap((tile) => {
      const box = tile.getBoundingClientRect();
      const x = Math.max(box.left, canvas.left);
      const y = Math.max(box.top, canvas.top);
      const right = Math.min(box.right, canvas.right);
      const bottom = Math.min(box.bottom, canvas.bottom);
      return right > x && bottom > y ? [{ x, y, width: right - x, height: bottom - y }] : [];
    });
  });
}

/**
 * T832 (AC-487; design 19 screen 2 pin 7, states F and H): the open sheet
 * pushes the tiles down by its height and covers none of them, the canvas
 * keeping its scroll position (rule 40) as it opens and closes; it holds the
 * description, the ownership line where there is one, and the filter bar, in
 * that order.
 */
test('the open sheet pushes the tiles down by its height, covers none, and keeps the canvas scrolled where it was', async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const { id, title } = await sharedDashboard(request);
  await page.goto(`/explore/dashboards/${id}`);
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
  await expect(page.getByText('Notes 1')).toBeVisible();

  // Scrolled 300 px down the tiles.
  expect(
    await canvas(page).evaluate((node) => {
      node.scrollTop = 300;
      return node.scrollTop;
    }),
  ).toBe(300);
  const closedTop = (await canvas(page).boundingBox())!.y;

  await page.locator('.dashboard__header button.header-toggle').click();
  const sheet = headerSheet(page);
  await expect(sheet).toBeVisible();
  // Settled: the canvas's top has moved down by the sheet's whole height.
  await expect
    .poll(async () => {
      const [box, top] = [await sheet.boundingBox(), (await canvas(page).boundingBox())!.y];
      return (
        box !== null && box.height > 0 && Math.round(top - closedTop) === Math.round(box.height)
      );
    })
    .toBe(true);
  const sheetBox = (await sheet.boundingBox())!;
  // Directly under the row, the dashboard's full width.
  const rowBox = (await row(page).boundingBox())!;
  expect(sheetBox.y).toBe(rowBox.y + rowBox.height);
  expect(sheetBox.width).toBe(rowBox.width);
  // The scroll position kept, and no tile under the sheet.
  expect(await canvas(page).evaluate((node) => node.scrollTop)).toBe(300);
  const tiles = await visibleTiles(page);
  expect(tiles.length).toBeGreaterThan(0);
  for (const tile of tiles) expect(overlaps(tile, sheetBox), JSON.stringify(tile)).toBe(false);

  // The description, the ownership line where there is one (signed in), then
  // the filter bar, each under the last.
  const parts = sheet.locator('.dashboard__description, .dashboard__ownership, section.filter-bar');
  const classes = await parts.evaluateAll((nodes) => nodes.map((node) => node.className));
  expect(classes.filter((name) => name !== 'dashboard__ownership')).toEqual([
    'dashboard__description',
    'filter-bar',
  ]);
  let above = sheetBox.y;
  for (let at = 0; at < classes.length; at += 1) {
    const box = (await parts.nth(at).boundingBox())!;
    expect(box.y, classes[at]).toBeGreaterThanOrEqual(above);
    above = box.y + box.height;
  }

  // Closed again: the canvas back where it was, still scrolled 300 px.
  await page.locator('.dashboard__header button.header-toggle').click();
  await expect(sheet).toBeHidden();
  await expect.poll(async () => (await canvas(page).boundingBox())!.y).toBe(closedTop);
  expect(await canvas(page).evaluate((node) => node.scrollTop)).toBe(300);
  // Closed, nothing in it is reached by Tab from the toggle, or exposed.
  await page.locator('.dashboard__header button.header-toggle').focus();
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => document.activeElement?.closest('.header-sheet') === null)).toBe(
    true,
  );
  await expect(page.getByRole('region', { name: 'Filters', exact: true })).toHaveCount(0);
});

/**
 * T832 (AC-487; design 19 state F, 19-Q7): with 12 filters the bar wraps
 * onto more rows, every pill wholly in view and none cut, and the sheet grows
 * to hold them, still covering no tile.
 */
test('with 12 filters the open bar wraps, every pill in view, and the sheet grows with it', async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const title = `Many filters ${String(Date.now())}`;
  const id = await sharedIn(request, 'dashboard', 'root', {
    title,
    // Long enough to reach the description's 860 px.
    description: 'Twelve filters, more than one row holds. '.repeat(8).trim(),
    pages: [
      {
        id: 'only',
        title: 'Only',
        items: [{ id: 'notes', kind: 'markdown', w: 12, h: 20, text: 'Notes' }],
      },
    ],
    filters: Array.from({ length: 12 }, (_, index) => ({
      id: `f-${String(index)}`,
      widget: 'checkbox',
      member: 'orders.status',
    })),
  });
  await page.goto(`/explore/dashboards/${id}`);
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
  await openHeaderSheet(page);
  const sheet = headerSheet(page);
  const bar = sheet.getByRole('region', { name: 'Filters', exact: true });
  const pills = bar.locator('.filter-pill');
  await expect(pills).toHaveCount(12);

  // Settled: the sheet as tall as what it holds.
  await expect
    .poll(() => sheet.evaluate((node) => node.getBoundingClientRect().height - node.scrollHeight))
    .toBe(0);
  const sheetBox = (await sheet.boundingBox())!;
  const barBox = (await bar.boundingBox())!;
  // More than one row of pills.
  const rows = new Set<number>();
  for (let at = 0; at < 12; at += 1) {
    const pill = pills.nth(at);
    await expect(pill).toBeInViewport({ ratio: 1 });
    const box = (await pill.boundingBox())!;
    rows.add(Math.round(box.y));
    // Wholly inside the bar and the sheet: wrapped, not cut off.
    expect(box.y).toBeGreaterThanOrEqual(barBox.y);
    expect(box.y + box.height).toBeLessThanOrEqual(barBox.y + barBox.height);
    expect(box.x + box.width).toBeLessThanOrEqual(barBox.x + barBox.width);
    expect(box.y + box.height).toBeLessThanOrEqual(sheetBox.y + sheetBox.height);
  }
  expect(rows.size).toBeGreaterThan(1);
  // The description at most 860 px wide, wrapping within it.
  const description = (await sheet.locator('.dashboard__description').boundingBox())!;
  expect(description.width).toBeLessThanOrEqual(860);
  expect(description.width).toBeGreaterThan(800);
  // The bar ends the sheet, and the canvas starts under it.
  expect(Math.round(barBox.y + barBox.height)).toBe(Math.round(sheetBox.y + sheetBox.height));
  expect((await canvas(page).boundingBox())!.y).toBeGreaterThanOrEqual(
    sheetBox.y + sheetBox.height,
  );
  for (const tile of await visibleTiles(page)) expect(overlaps(tile, sheetBox)).toBe(false);
});

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
