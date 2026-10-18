import { expect, test, type APIRequestContext, type Locator, type Page } from '@playwright/test';

import { headerSheet, openHeaderSheet } from './dashboardHeader';
import { IN_MY_WORKSPACE, sharedIn } from './workspace';

const API = 'http://localhost:4100/api';

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

/** The sheet's motion as drawn now: its state, its transition and its height. */
const motionOf = (page: Page) =>
  page.locator('.header-sheet').evaluate((node: HTMLElement) => {
    const style = getComputedStyle(node);
    return {
      motion: node.dataset.motion,
      inert: node.hasAttribute('inert'),
      property: style.transitionProperty,
      duration: style.transitionDuration,
      timing: style.transitionTimingFunction,
      height: node.getBoundingClientRect().height,
      full: node.scrollHeight,
    };
  });

/**
 * T833 (AC-488; design 19 pin 8, state I): the sheet opens by its height over
 * 200 ms decelerating and closes over 150 ms accelerating, nothing in it
 * reached while it moves.
 */
test('the sheet opens by its height over 200 ms decelerating and closes over 150 ms accelerating, nothing in it reached while it moves', async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const { id, title } = await sharedDashboard(request);
  await page.goto(`/explore/dashboards/${id}`);
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
  // Played at a tenth of its speed, so that a move lasts long enough to be
  // looked at: 2 s opening, 1.5 s closing.
  const devtools = await page.context().newCDPSession(page);
  await devtools.send('Animation.enable');
  await devtools.send('Animation.setPlaybackRate', { playbackRate: 0.1 });

  const toggle = page.locator('.dashboard__header button.header-toggle');
  await toggle.focus();
  await page.keyboard.press('Enter');
  const opening = await motionOf(page);
  expect(opening).toMatchObject({
    motion: 'opening',
    inert: true,
    property: 'height',
    duration: '0.2s',
    timing: 'cubic-bezier(0, 0, 0, 1)',
  });
  expect(opening.height).toBeLessThan(opening.full);
  // Mid-opening, Tab passes over it: no pill takes focus.
  await page.keyboard.press('Tab');
  expect(
    await page.evaluate(() => ({
      inSheet: document.activeElement?.closest('.header-sheet') !== null,
      motion: document.querySelector<HTMLElement>('.header-sheet')?.dataset.motion,
    })),
  ).toEqual({ inSheet: false, motion: 'opening' });

  // At rest, open: its full height, and its pills reached again.
  const sheet = headerSheet(page);
  await expect(sheet).not.toHaveAttribute('data-motion', /./, { timeout: 10_000 });
  await expect(sheet).not.toHaveAttribute('inert');
  const open = await motionOf(page);
  expect(open.height).toBe(open.full);
  await expect(sheet.getByRole('button', { name: /Status/ }).first()).toBeVisible();

  // Closing: 150 ms accelerating, inert, then hidden.
  await toggle.click();
  const closing = await motionOf(page);
  expect(closing).toMatchObject({
    motion: 'closing',
    inert: true,
    property: 'height',
    duration: '0.15s',
    timing: 'cubic-bezier(1, 0, 1, 1)',
  });
  expect(closing.height).toBeGreaterThan(0);
  await expect(page.locator('.header-sheet')).toBeHidden({ timeout: 10_000 });

  // Opening starts from 0 (T833's review): read as the press is handled.
  expect(
    await page.evaluate(() => {
      document.querySelector<HTMLButtonElement>('.dashboard__header button.header-toggle')!.click();
      return document.querySelector('.header-sheet')!.getBoundingClientRect().height;
    }),
  ).toBe(0);
});

/**
 * T833 (AC-488; WCAG 2.2 SC 2.3.3): with reduced motion asked for, the sheet
 * opens and closes with no transition, at its full height, or gone, in the
 * first frame after the toggle is pressed.
 */
test('with reduced motion the sheet opens and closes at once', async ({ page, request }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1440, height: 900 });
  const { id, title } = await sharedDashboard(request);
  await page.goto(`/explore/dashboards/${id}`);
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();

  /** Presses the toggle, then reads the sheet in the next animation frame. */
  const pressed = () =>
    page.evaluate(async () => {
      document.querySelector<HTMLButtonElement>('.dashboard__header button.header-toggle')!.click();
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const node = document.querySelector<HTMLElement>('.header-sheet')!;
      return {
        hidden: node.hidden,
        motion: node.dataset.motion,
        duration: getComputedStyle(node).transitionDuration,
        height: node.getBoundingClientRect().height,
        full: node.scrollHeight,
      };
    });

  const opened = await pressed();
  expect(opened).toMatchObject({ hidden: false, motion: undefined, duration: '0s' });
  expect(opened.height).toBeGreaterThan(0);
  expect(opened.height).toBe(opened.full);
  // And it stays at that height: it was already where it was going.
  expect((await headerSheet(page).boundingBox())!.height).toBe(opened.height);

  const closed = await pressed();
  expect(closed).toMatchObject({ hidden: true, motion: undefined, height: 0 });
});

/**
 * T834 (AC-489; design 19's keyboard table, rule 85): with a filter's popover
 * open, Escape closes it, focus back on its pill and the sheet still open; a
 * second Escape closes the sheet, focus on the toggle.
 */
test("Escape closes a filter's popover first, then the sheet, focus on the toggle", async ({
  page,
  request,
}) => {
  const { id, title } = await sharedDashboard(request);
  await page.goto(`/explore/dashboards/${id}`);
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
  const toggle = page.locator('.dashboard__header button.header-toggle');
  await openHeaderSheet(page);
  const sheet = headerSheet(page);
  const summary = sheet.locator('.filter-pill button[aria-expanded]').first();
  await summary.click();
  await expect(page.locator('.filter-popover')).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(page.locator('.filter-popover')).toHaveCount(0);
  await expect(summary).toBeFocused();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(sheet).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(toggle).toBeFocused();
  await expect(page.locator('.header-sheet')).toBeHidden();
});

/**
 * A dashboard of its own in My workspace, marking or cross-filtering, with a
 * description, a Status filter, and two page tabs: Only, with one bar tile,
 * orders by status ("tile-status"), and Detail, empty; opened — with
 * `filters` after the Status filter, and the values in `set` in its address.
 */
async function barBoard(
  page: Page,
  request: APIRequestContext,
  mode: 'markings' | 'crossFilter',
  { filters = [], set = [] }: { filters?: object[]; set?: object[] } = {},
): Promise<Locator> {
  const unique = `${String(Date.now())}-${String(Math.round(Math.random() * 1e6))}`;
  const title = `Header ${mode} ${unique}`;
  const board = (await (
    await request.post(`${API}/documents`, {
      data: { kind: 'dashboard', title, ...IN_MY_WORKSPACE },
    })
  ).json()) as { id: string };
  const chart = (await (
    await request.post(`${API}/documents`, {
      data: { kind: 'chart', title: 'By status', ...IN_MY_WORKSPACE },
    })
  ).json()) as { id: string };
  await request.put(`${API}/documents/chart/${chart.id}`, {
    data: {
      version: 1,
      body: {
        schemaVersion: 1,
        title: 'By status',
        owner: 'admin',
        localToDashboardId: board.id,
        chart: {
          source: { cube: 'orders' },
          wells: { measures: ['orders.count'], dimensions: ['orders.status'], timeDimensions: [] },
          chartType: 'bar',
        },
      },
    },
  });
  await request.put(`${API}/documents/dashboard/${board.id}`, {
    data: {
      version: 1,
      body: {
        schemaVersion: 1,
        title,
        description: 'Orders by status.',
        ...IN_MY_WORKSPACE,
        owner: 'admin',
        settings: {
          width: 'fixed',
          interactions: { mode, crossFilter: { defaultAction: 'filter' } },
        },
        pages: [
          {
            id: 'only',
            title: 'Only',
            items: [{ id: 'tile-status', kind: 'chart', w: 6, h: 40, chartId: chart.id }],
          },
          { id: 'detail', title: 'Detail', items: [] },
        ],
        filters: [{ id: 'f-status', widget: 'checkbox', member: 'orders.status' }, ...filters],
      },
    },
  });
  await page.goto(
    `/explore/dashboards/${board.id}${
      set.length === 0 ? '' : `?filters=${encodeURIComponent(JSON.stringify(set))}`
    }`,
  );
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
  const status = page.locator('[data-tile="tile-status"]');
  await expect(status.getByTestId('chart-canvas')).toBeVisible();
  return status;
}

/**
 * T834 (AC-489, AC-119; design 19 state B4): with a cross-filter set and
 * focus in the open sheet, Escape closes the sheet and clears nothing; Escape
 * with focus outside the header then clears the cross-filter.
 */
test('Escape in the open sheet closes it ahead of the dashboard’s Escape, which then clears the cross-filter', async ({
  page,
  request,
}) => {
  const status = await barBoard(page, request, 'crossFilter');
  const chips = page.getByTestId('cross-filter-chip');

  // A cross-filter from the keyboard (T405).
  await status.focus();
  await page.keyboard.press('Space');
  await expect(chips).toHaveCount(1);

  // Focus in the open sheet, on the chip's own Clear: Escape closes the
  // sheet, focus on the toggle, and the cross-filter stays.
  const toggle = page.locator('.dashboard__header button.header-toggle');
  await openHeaderSheet(page);
  await chips.getByRole('button', { name: /^Clear / }).focus();
  await page.keyboard.press('Escape');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(toggle).toBeFocused();
  await expect(chips).toHaveCount(1);

  // Focus outside the header: the dashboard's Escape clears it.
  await status.focus();
  await page.keyboard.press('Escape');
  await expect(chips).toHaveCount(0);
});

/**
 * T834 (AC-489, AC-094; 19-Q10): Escape on a focused tile unmarks that tile
 * only and leaves the open sheet open; so does a click on a tile.
 */
test('Escape on a focused tile unmarks it and leaves the sheet open, as a click on a tile does', async ({
  page,
  request,
}) => {
  const status = await barBoard(page, request, 'markings');
  const toggle = page.locator('.dashboard__header button.header-toggle');
  await openHeaderSheet(page);
  const chips = headerSheet(page).getByTestId('mark-chip');

  // Marked from the keyboard: Space on the focused tile.
  await status.focus();
  await page.keyboard.press('Space');
  await expect(chips).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(chips).toHaveCount(0);
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(headerSheet(page)).toBeVisible();

  // A click on the tile marks, and the sheet stays open to show it.
  await status.getByTestId('chart-canvas').click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(headerSheet(page)).toBeVisible();
});

/**
 * T835 (AC-490; 19-Q2, "No, always start compact (Recommended)"): the sheet
 * stays as the reader left it across a page tab, a bookmark applied, a
 * refresh and edit mode; every opening — a reload, a way back from Explore —
 * starts it closed; and opening or closing it touches no storage, the
 * address or the API.
 */
test('the sheet is kept as left for the visit only, and stored nowhere', async ({
  page,
  request,
}) => {
  const status = await barBoard(page, request, 'markings');
  const toggle = page.locator('.dashboard__header button.header-toggle');
  const expanded = () => toggle.getAttribute('aria-expanded');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');

  // Opening and closing it: no key in any storage, the same address, and no
  // request at all.
  const stored = () =>
    page.evaluate(async () => ({
      local: Object.keys(localStorage).sort(),
      session: Object.keys(sessionStorage).sort(),
      indexed: (await indexedDB.databases()).map((each) => each.name).sort(),
    }));
  const before = await stored();
  const address = page.url();
  const sent: string[] = [];
  const record = (asked: { method: () => string; url: () => string }) => {
    sent.push(`${asked.method()} ${asked.url()}`);
  };
  page.on('request', record);
  await openHeaderSheet(page);
  await toggle.click();
  await expect(page.locator('.header-sheet')).toBeHidden();
  await openHeaderSheet(page);
  page.off('request', record);
  expect(sent).toEqual([]);
  expect(page.url()).toBe(address);
  expect(await stored()).toEqual(before);

  // A page tab and back.
  await page.getByRole('tab', { name: 'Detail' }).click();
  await expect(page.getByRole('tab', { name: 'Detail', selected: true })).toBeVisible();
  expect(await expanded()).toBe('true');
  await page.getByRole('tab', { name: 'Only' }).click();

  // A bookmark saved, then applied.
  await page.getByRole('button', { name: 'Bookmarks' }).click();
  await page
    .getByRole('dialog', { name: 'Bookmarks' })
    .getByRole('button', { name: 'Bookmark this view…' })
    .click();
  const naming = page.getByRole('dialog', { name: 'Save a bookmark' });
  await naming.getByRole('textbox', { name: 'Name' }).fill('Header visit');
  await naming.getByRole('button', { name: 'Save' }).click();
  await expect(naming).toHaveCount(0);
  await page.getByRole('button', { name: 'Bookmarks' }).click();
  await page
    .getByRole('dialog', { name: 'Bookmarks' })
    .getByRole('list', { name: 'Mine' })
    .getByRole('button', { name: 'Header visit', exact: true })
    .click();
  // Said by the dashboard (T840, AC-493).
  await expect(page.getByTestId('marking-announcer')).toHaveText(
    'Bookmark applied: Header visit. Page Only. No filters set. Nothing marked.',
  );
  expect(await expanded()).toBe('true');

  // A refresh of the tile's data.
  const refresh = status.getByRole('button', { name: 'Refresh By status' });
  await expect(refresh).toBeEnabled();
  // The tile asked again, and answered (T835's review: not merely clicked).
  const asked = page.waitForResponse((answer) => answer.url().endsWith('/api/load'));
  await refresh.click();
  await asked;
  await expect(refresh).toBeEnabled();
  expect(await expanded()).toBe('true');

  // Edit, then Discard: the reader's state back.
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(toggle).toHaveCount(0);
  await page.getByRole('button', { name: /^Discard/ }).click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');

  // Closed there, it stays closed across the same page tab.
  await toggle.click();
  await page.getByRole('tab', { name: 'Detail' }).click();
  await expect(page.getByRole('tab', { name: 'Detail', selected: true })).toBeVisible();
  expect(await expanded()).toBe('false');

  // Every opening starts it closed: a reload, and a way back from Explore.
  await openHeaderSheet(page);
  await page.reload();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await openHeaderSheet(page);
  await page.locator('.dashboard__header .header-back').click();
  await expect(page).toHaveURL(/\/explore/);
  await page.goBack();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
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

/**
 * T837 (AC-492; 19-Q5 (a); design 19 pin 3 and state D1): in view mode at
 * 1,024 px and wider, page tabs that don't fit the compact row go behind
 * "More ▾", the open page always inline; the strip never scrolls, and no tab
 * is cut short or hidden except into that menu.
 */
test('at 1,152 px, 8 page tabs: those that fit inline, the rest behind More, the open page always inline, the strip never scrolling', async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 1152, height: 800 });
  // Short, as design 19 draws them: a few fit beside the actions at 1,152 px.
  const titles = Array.from({ length: 8 }, (_, index) => `Week ${String(index + 1)}`);
  const unique = `${String(Date.now())}-${String(Math.round(Math.random() * 1e6))}`;
  const id = await sharedIn(request, 'dashboard', 'root', {
    title: `Pages ${unique}`,
    settings: { width: 'full' },
    pages: titles.map((title, index) => ({
      id: `p${String(index + 1)}`,
      title,
      items: [{ id: `notes-${String(index)}`, kind: 'markdown', w: 6, h: 8, text: `On ${title}` }],
    })),
    filters: [{ id: 'f-status', widget: 'checkbox', member: 'orders.status' }],
  });
  await page.goto(`/explore/dashboards/${id}`);
  await expect(page.getByText('On Week 1', { exact: true })).toBeVisible();

  const strip = row(page).getByRole('tablist', { name: 'Pages' });
  const more = row(page).getByRole('button', { name: 'More pages' });

  /** Each tab inline, wholly in view and uncut, or in the menu: never both, never neither. */
  async function everyTabPlaced(open: string): Promise<void> {
    await expect(more).toBeVisible();
    // The strip doesn't scroll.
    expect(await strip.evaluate((node) => node.scrollWidth - node.clientWidth)).toBe(0);
    const inline = await strip.getByRole('tab').allTextContents();
    expect(inline.length).toBeGreaterThan(1);
    expect(inline).toContain(open);
    for (const name of inline) {
      const tab = strip.getByRole('tab', { name, exact: true });
      await expect(tab).toBeInViewport({ ratio: 1 });
      expect(await tab.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
    }
    await expect(strip.getByRole('tab', { name: open, exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await more.click();
    const menu = page.getByRole('menu', { name: 'More pages' });
    const listed = await menu.getByRole('menuitem').allTextContents();
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    // In order, the open page not among them, and each tab in one place.
    expect(listed).not.toContain(open);
    expect(listed.length).toBeGreaterThan(0);
    expect([...inline, ...listed].sort()).toEqual([...titles].sort());
    expect(listed).toEqual(titles.filter((title) => listed.includes(title)));
    expect(inline).toEqual(titles.filter((title) => inline.includes(title)));
    // "More ▾" right after the inline tabs, on the row's line.
    const [stripBox, moreBox, rowBox] = await Promise.all([
      strip.boundingBox(),
      more.boundingBox(),
      row(page).boundingBox(),
    ]);
    expect(moreBox!.x).toBeGreaterThanOrEqual(stripBox!.x + stripBox!.width);
    expect(moreBox!.x - (stripBox!.x + stripBox!.width)).toBeLessThan(16);
    expect(rowBox!.height).toBe(48);
  }

  await everyTabPlaced('Week 1');

  // The 7th, chosen from the menu: open, inline and in view.
  await more.click();
  await page
    .getByRole('menu', { name: 'More pages' })
    .getByRole('menuitem', { name: 'Week 7' })
    .click();
  await expect(page.getByText('On Week 7', { exact: true })).toBeVisible();
  await everyTabPlaced('Week 7');

  // At 1,024 px, the narrowest AC-492 holds at: the open page inline, whole
  // and in view, the rest behind "More ▾", and still no scrolling.
  await page.setViewportSize({ width: 1024, height: 800 });
  await expect(strip.getByRole('tab')).not.toHaveCount(8);
  const open = strip.getByRole('tab', { name: 'Week 7', exact: true });
  await expect(open).toHaveAttribute('aria-selected', 'true');
  await expect(open).toBeInViewport({ ratio: 1 });
  await expect(more).toBeInViewport({ ratio: 1 });
  expect(await strip.evaluate((node) => node.scrollWidth - node.clientWidth)).toBe(0);
  expect((await row(page).boundingBox())?.height).toBe(48);

  // Wide enough for every tab: no "More ▾".
  await page.setViewportSize({ width: 2400, height: 800 });
  await expect(strip.getByRole('tab')).toHaveCount(8);
  await expect(more).toHaveCount(0);
  expect(await strip.evaluate((node) => node.scrollWidth - node.clientWidth)).toBe(0);
});

/**
 * T841 (AC-494; design 19 state D1): from 1,024 to 1,279 px the compact row
 * stays one 48 px row, History and Bookmarks icon buttons named, and
 * titled, "History" and "Bookmarks", and the page doesn't scroll sideways.
 */
test('at 1,024 and 1,152 px the row is one 48 px line, History and Bookmarks icons named in their names and tooltips', async ({
  page,
  request,
}) => {
  const { id, title } = await sharedDashboard(request);
  const filters = [
    { id: 'f-status', member: 'orders.status', value: { kind: 'values', values: ['shipped'] } },
  ];
  for (const width of [1024, 1152]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto(
      `/explore/dashboards/${id}?filters=${encodeURIComponent(JSON.stringify(filters))}`,
    );
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
    const header = (await row(page).boundingBox())!;
    expect(header.height, String(width)).toBe(48);
    // One line: every part of it within its 48 px.
    const parts = row(page).locator(':scope > :visible');
    const count = await parts.count();
    for (let at = 0; at < count; at += 1) {
      const box = (await parts.nth(at).boundingBox())!;
      expect(box.y, `${String(width)}: ${String(at)}`).toBeGreaterThanOrEqual(header.y);
      expect(box.y + box.height, `${String(width)}: ${String(at)}`).toBeLessThanOrEqual(
        header.y + header.height,
      );
    }
    for (const name of ['History', 'Bookmarks']) {
      const button = row(page).getByRole('button', { name, exact: true });
      await expect(button).toBeVisible();
      await expect(button).toHaveAttribute('title', name);
      // An icon: no text drawn, the icon itself shown.
      expect(await button.innerText(), `${String(width)}: ${name}`).toBe('');
      await expect(button.locator('svg').first()).toBeVisible();
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBe(0);
  }

  // From 1,280 px, their words again.
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(row(page).getByRole('button', { name: 'History', exact: true })).toHaveText(
    'History',
  );
  await expect(row(page).getByRole('button', { name: 'Bookmarks', exact: true })).toHaveText(
    'Bookmarks',
  );
});

/**
 * Watches every polite live region on the page (`aria-live="polite"`, or a
 * `status`, polite by default) and keeps each new message, in order, with
 * the times the Filters toggle took and lost its change highlight.
 */
async function listen(page: Page): Promise<void> {
  await page.evaluate(() => {
    const kept = window as unknown as {
      said: string[];
      lit: { on: number; off?: number }[];
    };
    kept.said = [];
    kept.lit = [];
    const polite = '[aria-live="polite"], [role="status"]:not([aria-live="off"])';
    new MutationObserver((records) => {
      const regions = new Set<Element>();
      for (const record of records) {
        const at = record.target instanceof Element ? record.target : record.target.parentElement;
        const region = at?.closest(polite);
        if (region) regions.add(region);
      }
      for (const region of regions) {
        const text = (region.textContent ?? '').trim();
        if (text !== '') kept.said.push(text);
      }
    }).observe(document.body, { subtree: true, childList: true, characterData: true });
    new MutationObserver(() => {
      const on = document.querySelector('.header-toggle--changed') !== null;
      const last = kept.lit[kept.lit.length - 1];
      if (on && (last === undefined || last.off !== undefined))
        kept.lit.push({ on: performance.now() });
      if (!on && last !== undefined && last.off === undefined) last.off = performance.now();
    }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'] });
  });
}

/** What the polite regions said since `listen`, or since the last call to this. */
async function saidSince(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const kept = window as unknown as { said: string[] };
    const said = kept.said;
    kept.said = [];
    return said;
  });
}

/**
 * T840 (AC-493; design 19 states B2 and B5): with the sheet closed, Filter
 * to marked from a tile's ⋯ turns the toggle's number to 4, the compact chip
 * goes, the toggle is highlighted for 2 s in `accent-soft` and `accent`, and
 * the polite regions together say it once, with "4 filters set"; a bookmark
 * applied is said once too; the sheet never opens.
 */
test('a change made with the sheet closed is said once, with the new number, and leaves the sheet closed', async ({
  page,
  request,
}) => {
  const all = { kind: 'values', values: ['completed', 'processing', 'shipped'] };
  const status = await barBoard(page, request, 'markings', {
    filters: [
      { id: 'f-status-2', widget: 'checkbox', member: 'orders.status' },
      { id: 'f-ordered', widget: 'dateRange', member: 'orders.ordered_at' },
    ],
    set: [
      { id: 'f-status', member: 'orders.status', value: all },
      { id: 'f-status-2', member: 'orders.status', value: all },
      {
        id: 'f-ordered',
        member: 'orders.ordered_at',
        value: { kind: 'dates', from: '2000-01-01', to: '2099-12-31' },
      },
    ],
  });
  const toggle = row(page).locator('button.header-toggle');
  const count = toggle.locator('.header-toggle__count');
  await expect(count).toHaveText('3');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');

  // Kept as it is now, to apply later.
  await page.getByRole('button', { name: 'Bookmarks' }).click();
  await page
    .getByRole('dialog', { name: 'Bookmarks' })
    .getByRole('button', { name: 'Bookmark this view…' })
    .click();
  const naming = page.getByRole('dialog', { name: 'Save a bookmark' });
  await naming.getByRole('textbox', { name: 'Name' }).fill('Start');
  await naming.getByRole('button', { name: 'Save' }).click();
  await expect(naming).toHaveCount(0);

  // Marked from the keyboard; the compact chip shows it in the row.
  await status.focus();
  await page.keyboard.press('Space');
  const chip = row(page).getByTestId('compact-mark-chip');
  await expect(chip).toHaveCount(1);
  await expect(toggle).not.toHaveClass(/header-toggle--changed/);

  await listen(page);
  await status.getByRole('button', { name: /^Actions for / }).click();
  await status
    .getByRole('menu', { name: /^Actions for / })
    .getByRole('group', { name: /marked$/ })
    .getByRole('menuitem', { name: 'Filter to marked' })
    .click();

  // The number at once, the compact chip gone, the sheet still closed.
  await expect(count).toHaveText('4');
  await expect(chip).toHaveCount(0);
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(headerSheet(page)).toBeHidden();

  // Highlighted: the accent-soft ground and a 1 px accent border, drawn.
  await expect(toggle).toHaveClass(/header-toggle--changed/);
  const drawn = await toggle.evaluate((node) => {
    const style = getComputedStyle(node);
    const probe = document.createElement('span');
    document.body.append(probe);
    probe.style.color = 'var(--wc-bg-accent-soft)';
    const soft = getComputedStyle(probe).color;
    probe.style.color = 'var(--wc-accent)';
    const accent = getComputedStyle(probe).color;
    probe.remove();
    return {
      ground: style.backgroundColor,
      border: style.borderTopColor,
      width: style.borderTopWidth,
      soft,
      accent,
    };
  });
  expect(drawn.ground).toBe(drawn.soft);
  expect(drawn.border).toBe(drawn.accent);
  expect(drawn.width).toBe('1px');

  // For 2 s: off after 1.8 s and by 2.2 s.
  await expect(toggle).not.toHaveClass(/header-toggle--changed/, { timeout: 4000 });
  const lit = await page.evaluate(
    () => (window as unknown as { lit: { on: number; off?: number }[] }).lit,
  );
  expect(lit).toHaveLength(1);
  const lasted = (lit[0]?.off ?? 0) - (lit[0]?.on ?? 0);
  expect(lasted).toBeGreaterThanOrEqual(1800);
  expect(lasted).toBeLessThanOrEqual(2200);

  // Said once, all the polite regions together, with the new number.
  const said = await saidSince(page);
  expect(said).toHaveLength(1);
  expect(said[0]).toMatch(/^Filter added: Orders Status is \w+\. 4 filters set\.$/);
  await expect(page.getByTestId('marking-announcer')).toHaveAttribute('aria-live', 'polite');

  // The bookmark applied: back to 3, said once, the sheet still closed.
  await page.getByRole('button', { name: 'Bookmarks' }).click();
  await page
    .getByRole('dialog', { name: 'Bookmarks' })
    .getByRole('list', { name: 'Mine' })
    .getByRole('button', { name: 'Start', exact: true })
    .click();
  await expect(count).toHaveText('3');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { said: string[] }).said.length))
    .toBeGreaterThan(0);
  expect(await saidSince(page)).toEqual([
    'Bookmark applied: Start. Page Only. 3 filters set. Nothing marked.',
  ]);
  await expect(headerSheet(page)).toBeHidden();
});
