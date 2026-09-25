import { expect, test, type APIRequestContext, type Locator, type Page } from '@playwright/test';

import { ownCubeFile } from './model-files';

/**
 * T190: the marking subsystem, connected to the rendering path.
 *
 * Every module behind these criteria was built and unit-tested between T086
 * and T119, and nothing mounted any of it — which is why the 18 ticks were
 * withdrawn on 2026-09-20. These tests drive the real dashboard, so a
 * criterion is ticked only where a user can see it.
 *
 * AC-087: WHEN the user clicks an item in a tile that marks, THE SYSTEM SHALL
 * replace that marking with the clicked item; WHEN the user Ctrl-clicks or
 * ⌘-clicks, THE SYSTEM SHALL toggle that item and leave the rest.
 * `Fails when: a plain click adds to the marking, or a modified click
 * replaces it.`
 * AC-096: marked items keep their colour with an outline in the marking's,
 * and unmarked items fade.
 * `Fails when: unmarked items render at full strength, or marked items carry
 * no outline.`
 * AC-098: a badge naming the marking and the number of marked items, and a
 * chip naming it and summarising its values.
 * `Fails when: a tile or chip conveys the marking only through colour.`
 * AC-101: the change is announced in a polite live region.
 * `Fails when: no announcement is made, or it omits the count.`
 * AC-094: a click on empty plot area unmarks that tile's marking.
 * `Fails when: another marking is cleared, or the marking survives.`
 */
const API = 'http://localhost:4100/api';

/**
 * A dashboard of its own, in Markings mode, with two bar tiles on one page —
 * and, when asked, a third on a second page marking with the same marking.
 */
async function markingDashboard(
  request: APIRequestContext,
  {
    twoPages = false,
    split = false,
    table = false,
    trellis = false,
    apart = false,
    limited = false,
    second = false,
  } = {},
) {
  const unique = `${String(Date.now())}-${String(Math.round(Math.random() * 1e6))}`;
  const title = `Markings ${unique}`;
  const dashboard = (await (
    await request.post(`${API}/documents`, {
      data: { kind: 'dashboard', title, folderId: 'root' },
    })
  ).json()) as { id: string };

  const chartOn = async (
    chartTitle: string,
    dimensions: readonly string[],
    chartType = 'bar',
    encoding?: Record<string, readonly string[]>,
    cube = 'orders',
  ) => {
    const chart = (await (
      await request.post(`${API}/documents`, {
        data: { kind: 'chart', title: chartTitle, folderId: 'root' },
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
            source: { cube },
            wells: {
              measures: chartType === 'table' ? [] : [`${cube}.count`],
              dimensions: [...dimensions],
              timeDimensions: [],
            },
            chartType,
            // An encoding given here wins over the one `compile` works out
            // for the type (T242), so a test can name exactly what it draws.
            ...(encoding === undefined ? {} : { encoding }),
          },
        },
      },
    });
    return chart.id;
  };

  const status = await chartOn('By status', ['orders.status']);
  const category = await chartOn('By category', ['products.category']);
  const elsewhere = twoPages ? await chartOn('Elsewhere by status', ['orders.status']) : undefined;
  // Split by a second dimension, so its legend names categories to mark.
  const splitChart = split
    ? await chartOn('Split by category', ['orders.status', 'products.category'], 'stackedBar')
    : undefined;
  // A table of rows, each identified by the cube's primary key.
  const tableChart = table
    ? await chartOn('Orders', ['orders.id', 'orders.status'], 'table')
    : undefined;
  /**
   * A tile on a cube with no joins at all (`monthly_orders`), so nothing on
   * the dashboard can reach `orders.status` on its behalf.
   */
  const apartChart = apart
    ? await chartOn(
        'Apart',
        ['monthly_orders.status'],
        'bar',
        { x: ['monthly_orders.status'], y: ['monthly_orders.count'] },
        'monthly_orders',
      )
    : undefined;
  /**
   * A details tile: it marks with nothing, and shows only what the master
   * tile has marked (AC-107). Charted on the same dimension the master marks
   * on, so "restricted to the marking" is countable — the whole axis, or the
   * one marked value.
   */
  const detailsChart = limited ? await chartOn('Details by status', ['orders.status']) : undefined;
  // One panel per category, each with its own header to mark from.
  const trellisChart = trellis
    ? await chartOn('Per category', ['orders.status', 'products.category'], 'trellis', {
        x: ['orders.status'],
        y: ['orders.count'],
        facet: ['products.category'],
      })
    : undefined;
  await request.put(`${API}/documents/dashboard/${dashboard.id}`, {
    data: {
      version: 1,
      body: {
        schemaVersion: 1,
        title,
        folderId: 'root',
        owner: 'admin',
        settings: { width: 'fixed', interactions: { mode: 'markings' } },
        markings: [
          { id: 'm1', name: 'Marking', slot: 'mk1', isDefault: true },
          // A second marking, so a tile can be limited by two and the
          // empty-is-skipped rule has something to skip (AC-107).
          ...(second ? [{ id: 'm2', name: 'Comparison', slot: 'mk2', isDefault: false }] : []),
        ],
        /**
         * A filter to exclude the marked items with (AC-111). Its value is
         * the reader's, so the test sets it in the URL.
         *
         * Scoped to the details tile alone, so the master still draws every
         * bar — there has to be something to mark that the filter then
         * excludes, which a dashboard-wide filter would hide as well.
         */
        filters: [
          {
            id: 'f-status',
            widget: 'checkbox',
            member: 'orders.status',
            scope: { kind: 'tiles', tileIds: ['tile-details'] },
          },
        ],
        pages: [
          {
            id: 'only',
            title: 'Only',
            items: [
              { id: 'tile-status', kind: 'chart', w: 6, h: 40, chartId: status },
              {
                id: 'tile-category',
                kind: 'chart',
                w: 6,
                h: 40,
                chartId: category,
                // With a second marking, this is the other master.
                ...(second ? { marksWith: 'm2' } : {}),
              },
              ...(detailsChart === undefined
                ? []
                : [
                    {
                      id: 'tile-details',
                      kind: 'chart',
                      w: 12,
                      h: 40,
                      chartId: detailsChart,
                      // It marks with nothing and follows the master(s).
                      marksWith: '',
                      limitedBy: second ? ['m1', 'm2'] : ['m1'],
                    },
                  ]),
              ...(splitChart === undefined
                ? []
                : [{ id: 'tile-split', kind: 'chart', w: 12, h: 40, chartId: splitChart }]),
              ...(tableChart === undefined
                ? []
                : [{ id: 'tile-table', kind: 'chart', w: 12, h: 40, chartId: tableChart }]),
              ...(trellisChart === undefined
                ? []
                : [{ id: 'tile-trellis', kind: 'chart', w: 12, h: 60, chartId: trellisChart }]),
              ...(apartChart === undefined
                ? []
                : [{ id: 'tile-apart', kind: 'chart', w: 6, h: 40, chartId: apartChart }]),
            ],
          },
          ...(elsewhere === undefined
            ? []
            : [
                {
                  id: 'second',
                  title: 'Second',
                  items: [
                    {
                      id: 'tile-elsewhere',
                      kind: 'chart',
                      w: 6,
                      h: 40,
                      chartId: elsewhere,
                      marksWith: 'm1',
                    },
                  ],
                },
              ]),
        ],
      },
    },
  });
  return { id: dashboard.id, title };
}

const tile = (page: Page, id: string) => page.locator(`[data-tile="${id}"]`);

/** Clicks the bar over a category's axis label, as the cross-filter spec does. */
async function clickBar(
  page: Page,
  target: Locator,
  category: string,
  /**
   * `ControlOrMeta` is Ctrl, or ⌘ on a Mac — where Ctrl+click is the context
   * menu, which a press does not survive (T190 stage 7's review).
   */
  modifiers: ('ControlOrMeta' | 'Meta')[] = [],
) {
  const label = target.locator('svg text', { hasText: category }).first();
  await expect(label).toBeVisible();
  let box: { x: number; y: number; width: number } | null = null;
  // The label's own client rect, and where it has come to rest: the same box
  // twice running. Playwright's boundingBox() puts a middle-anchored SVG text
  // half its width to the right in WebKit, which put the click in the gap
  // between two bars once the prototype's grid widened the plot (T254).
  let last = '';
  await expect
    .poll(async () => {
      box = await label.evaluate((text) => {
        const rect = text.getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width };
      });
      const now = JSON.stringify(box);
      const settled = box.width > 0 && now === last;
      last = now;
      return settled;
    })
    .toBe(true);
  const at = box as unknown as { x: number; y: number; width: number };
  for (const key of modifiers) await page.keyboard.down(key);
  await page.mouse.click(at.x + at.width / 2, at.y - 10);
  for (const key of modifiers) await page.keyboard.up(key);
}

/**
 * How solid each bar in a tile is, in the order they are drawn. The SVG
 * renderer writes an item's opacity as `fill-opacity` on its path, so that is
 * what a faded bar looks like from outside.
 */
async function opacities(target: Locator) {
  return target.locator('svg path[fill]').evaluateAll((nodes) =>
    nodes
      .filter((node) => {
        const box = (node as SVGGraphicsElement).getBBox();
        return box.width > 2 && box.height > 2;
      })
      .map((node) => {
        const fill = node.getAttribute('fill-opacity') ?? node.getAttribute('opacity');
        return fill === null ? 1 : Number(fill);
      }),
  );
}

async function open(page: Page, id: string, title: string) {
  await page.goto(`/explore/dashboards/${id}`);
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  await expect(tile(page, 'tile-status').getByTestId('chart-canvas')).toBeVisible();
  await expect(tile(page, 'tile-category').getByTestId('chart-canvas')).toBeVisible();
}

test('a click marks what was clicked, and says so in words and a count', async ({
  page,
  request,
}) => {
  const { id, title } = await markingDashboard(request);
  await open(page, id, title);
  const status = tile(page, 'tile-status');

  // Nothing marked: nothing faded, and no badge.
  expect((await opacities(status)).every((value) => value === 1)).toBe(true);
  await expect(status.getByTestId('mark-badge')).toHaveCount(0);

  await clickBar(page, status, 'shipped');

  // Marked: the rest fade (AC-096), and the tile says what it is showing in
  // words and a number rather than by colour alone (AC-098).
  await expect
    .poll(async () => (await opacities(status)).filter((value) => value < 1).length)
    .toBeGreaterThan(0);
  // The marked bar carries an outline in the marking's colour, which is the
  // other half of AC-096: colour alone would not distinguish it.
  const outlined = await status
    .locator('svg path[stroke-width]')
    .evaluateAll((nodes) =>
      nodes
        .filter((node) => Number(node.getAttribute('stroke-width') ?? 0) > 1)
        .map((node) => node.getAttribute('stroke')),
    );
  expect(outlined.length).toBeGreaterThan(0);

  await expect(status.getByTestId('mark-badge')).toContainText('Marking');
  await expect(status.getByTestId('mark-badge')).toContainText('1 marked');
  // And a chip on the bar, naming it and what it holds.
  await expect(page.getByTestId('mark-chip')).toContainText('shipped');
  // Announced politely, with the count (AC-101).
  await expect(page.getByTestId('marking-announcer')).toContainText('1');
});

test('a plain click replaces the marking, and Ctrl-click adds to it', async ({ page, request }) => {
  const { id, title } = await markingDashboard(request);
  await open(page, id, title);
  const status = tile(page, 'tile-status');

  await clickBar(page, status, 'shipped');
  await expect(status.getByTestId('mark-badge')).toContainText('1 marked');

  // A plain click replaces: still one item, and it is the new one.
  await clickBar(page, status, 'completed');
  await expect(status.getByTestId('mark-badge')).toContainText('1 marked');
  await expect(page.getByTestId('mark-chip')).toContainText('completed');
  await expect(page.getByTestId('mark-chip')).not.toContainText('shipped');

  // Ctrl-click toggles that one item and leaves the rest (AC-087).
  await clickBar(page, status, 'shipped', ['ControlOrMeta']);
  await expect(status.getByTestId('mark-badge')).toContainText('2 marked');
  await expect(page.getByTestId('mark-chip')).toContainText('completed');
  await expect(page.getByTestId('mark-chip')).toContainText('shipped');

  // The same item again takes it back off, leaving the other.
  await clickBar(page, status, 'shipped', ['ControlOrMeta']);
  await expect(status.getByTestId('mark-badge')).toContainText('1 marked');
});

test('a click on empty plot area unmarks that tile’s marking', async ({ page, request }) => {
  const { id, title } = await markingDashboard(request);
  await open(page, id, title);
  const status = tile(page, 'tile-status');
  await clickBar(page, status, 'shipped');
  await expect(status.getByTestId('mark-badge')).toContainText('1 marked');

  // Above the tallest bar: inside the plot, on nothing (AC-094).
  const canvas = status.getByTestId('chart-canvas');
  const box = await canvas.boundingBox();
  if (box === null) throw new Error('No canvas');
  await page.mouse.click(box.x + box.width / 2, box.y + 12);

  await expect(status.getByTestId('mark-badge')).toHaveCount(0);
  expect((await opacities(status)).every((value) => value === 1)).toBe(true);
});

/**
 * AC-090: WHEN the user clicks a legend entry's text in a tile that marks,
 * THE SYSTEM SHALL mark every item of that category, and Ctrl-click or
 * ⌘-click SHALL add further categories; series visibility SHALL be changed
 * elsewhere.
 * `Fails when: a legend click hides the series, or does not mark it.`
 */
test('a legend entry marks its whole category, and does not hide the series', async ({
  page,
  request,
}) => {
  const { id, title } = await markingDashboard(request, { split: true });
  await open(page, id, title);
  const split = tile(page, 'tile-split');
  await expect(split.getByTestId('chart-canvas')).toBeVisible();

  const bars = await split.locator('svg path[fill]').count();
  await split.locator('svg text', { hasText: 'Components' }).first().click();

  // Marked, not hidden: the same marks are drawn, some of them faded.
  await expect(split.getByTestId('mark-badge')).toContainText('1 marked');
  await expect(page.getByTestId('mark-chip')).toContainText('Components');
  expect(await split.locator('svg path[fill]').count()).toBe(bars);
  await expect
    .poll(async () => (await opacities(split)).filter((value) => value < 1).length)
    .toBeGreaterThan(0);

  // Ctrl-click adds a further category, where Ctrl on an item toggles one.
  // ⌘ on a Mac, where Ctrl+click is the context menu (T190 stage 7's review).
  await page.keyboard.down('ControlOrMeta');
  await split.locator('svg text', { hasText: 'Instruments' }).first().click();
  await page.keyboard.up('ControlOrMeta');
  await expect(split.getByTestId('mark-badge')).toContainText('2 marked');
});

/**
 * AC-091: WHEN the user clicks a trellis panel header, THE SYSTEM SHALL mark
 * every item in that panel.
 * `Fails when: the click marks a single item, or nothing.`
 */
test('a trellis panel header marks the whole panel', async ({ page, request }) => {
  const { id, title } = await markingDashboard(request, { trellis: true });
  await open(page, id, title);
  const panels = tile(page, 'tile-trellis');
  await expect(panels.getByTestId('chart-canvas')).toBeVisible();

  // The header of the first panel, which is the category it stands for.
  await panels.locator('svg text', { hasText: 'Components' }).first().click();

  // The panel's category, not one bar inside it: one item in the marking,
  // and every bar of the other panel faded.
  await expect(panels.getByTestId('mark-badge')).toContainText('1 marked');
  await expect(page.getByTestId('mark-chip')).toContainText('Components');
  await expect
    .poll(async () => (await opacities(panels)).filter((value) => value < 1).length)
    .toBeGreaterThan(0);
});

/**
 * AC-092: WHEN the user clicks a row in a table tile, THE SYSTEM SHALL mark
 * it; Shift-click SHALL mark the range from the anchor row; and rows SHALL be
 * markable only when the cube's primary key is available.
 * `Fails when: Shift-click marks a single row, or rows are markable without a
 * primary key.`
 */
test('a table’s rows mark, and a Shift-click marks the range', async ({ page, request }) => {
  const { id, title } = await markingDashboard(request, { table: true });
  await open(page, id, title);
  const table = tile(page, 'tile-table');
  await expect(table.getByTestId('table-row').first()).toBeVisible();

  const rows = table.getByTestId('table-row');
  await rows.nth(0).click();
  await expect(table.getByTestId('mark-badge')).toContainText('1 marked');
  await expect(rows.nth(0)).toHaveAttribute('aria-selected', 'true');

  // Shift extends from the anchor, rather than marking one row.
  await rows.nth(2).click({ modifiers: ['Shift'] });
  await expect(table.getByTestId('mark-badge')).toContainText('3 marked');
  await expect(rows.nth(1)).toHaveAttribute('aria-selected', 'true');
});

/**
 * AC-103: WHEN a tile's cube or view cannot resolve every member of a
 * marking's predicate, THE SYSTEM SHALL leave that tile unmarked and label it
 * as not linked to that marking.
 * `Fails when: the tile shows a query error, or is silently left unbrushed
 * with no label.`
 */
test('a tile that cannot reach the marked field says it is not linked', async ({
  page,
  request,
}) => {
  const { id, title } = await markingDashboard(request, { apart: true });
  await open(page, id, title);
  const apart = tile(page, 'tile-apart');
  await expect(apart.getByTestId('chart-canvas')).toBeVisible();

  await clickBar(page, tile(page, 'tile-status'), 'shipped');
  await expect(tile(page, 'tile-status').getByTestId('mark-badge')).toContainText('1 marked');

  // Unmarked, and said: silence would read as "none of it is in here" — the
  // member by its title (AC-220).
  await expect(apart.getByTestId('not-linked')).toContainText('Orders Status');
  await expect(apart.getByTestId('not-linked')).not.toContainText('orders.status');
  await expect(apart.getByTestId('mark-badge')).toHaveCount(0);
  expect((await opacities(apart)).every((value) => value === 1)).toBe(true);
  // And no error on it either.
  await expect(apart.getByRole('alert')).toHaveCount(0);
});

/**
 * AC-100: WHEN a tile has keyboard focus in view mode, THE SYSTEM SHALL move
 * between its items with the arrow keys without changing the marking, mark
 * the focused item with Space, toggle it with Ctrl+Space or ⌘+Space, and
 * extend the marking with Shift and the arrow keys.
 * `Fails when: an arrow key changes the marking, or Space does not mark the
 * focused item.`
 *
 * AC-094's other half rides here too: Escape on a focused tile unmarks that
 * tile's marking and leaves other markings alone.
 */
test('a focused tile marks from the keyboard, and Escape unmarks it', async ({ page, request }) => {
  const { id, title } = await markingDashboard(request);
  await open(page, id, title);
  const status = tile(page, 'tile-status');

  await status.focus();
  await expect(status).toBeFocused();

  // Arrows move without marking — each marking change re-queries every tile
  // using it, so "select as you move" would be unusable.
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('marking-announcer')).toContainText('2 of 3');
  await expect(status.getByTestId('mark-badge')).toHaveCount(0);

  // Space marks the focused item.
  await page.keyboard.press('Space');
  await expect(status.getByTestId('mark-badge')).toContainText('1 marked');

  // Shift and an arrow extend from the anchor.
  await page.keyboard.press('Shift+ArrowRight');
  await expect(status.getByTestId('mark-badge')).toContainText('2 marked');

  // Ctrl+Space toggles the focused item, leaving the rest.
  await page.keyboard.press('Control+Space');
  await expect(status.getByTestId('mark-badge')).toContainText('1 marked');

  // Escape on the focused tile unmarks it (AC-094).
  await page.keyboard.press('Escape');
  await expect(status.getByTestId('mark-badge')).toHaveCount(0);
});

/**
 * AC-095: WHEN a marking changes, THE SYSTEM SHALL update every tile that
 * uses it or is limited by it, on every page tab of the dashboard.
 * `Fails when: a tile on another page tab still shows the previous marking
 * state when opened.`
 *
 * The tab that was never open while the marking changed is the case that
 * matters: it is rendered for the first time afterwards, and has to agree
 * with the tiles that were on screen.
 */
test('a marking reaches a tile on a page tab that was never open', async ({ page, request }) => {
  const { id, title } = await markingDashboard(request, { twoPages: true });
  await open(page, id, title);

  await clickBar(page, tile(page, 'tile-status'), 'shipped');
  await expect(tile(page, 'tile-status').getByTestId('mark-badge')).toContainText('1 marked');

  await page.getByRole('tab', { name: 'Second' }).click();
  const elsewhere = tile(page, 'tile-elsewhere');
  await expect(elsewhere.getByTestId('chart-canvas')).toBeVisible();

  // Drawn marked the moment it appears, and saying so.
  await expect(elsewhere.getByTestId('mark-badge')).toContainText('1 marked');
  await expect
    .poll(async () => (await opacities(elsewhere)).filter((value) => value < 1).length)
    .toBeGreaterThan(0);
});

/**
 * AC-085: WHEN a chart tile is created, THE SYSTEM SHALL set it to mark with
 * the dashboard's default marking, and the tile's Marking setting SHALL also
 * offer "(None)" and every other marking.
 * `Fails when: a new tile marks with nothing, or the setting omits "(None)".`
 */
test('a tile’s Marking setting offers (None), and a new tile takes the default', async ({
  page,
  request,
}) => {
  const { id, title } = await markingDashboard(request);
  await open(page, id, title);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();

  // The tile's own setting, in Properties.
  await tile(page, 'tile-status').click();
  const sidebar = page.getByRole('complementary', { name: 'Edit sidebar' });
  await sidebar.getByRole('tab', { name: 'Properties' }).click();
  // Exactly "Marking": the limit list below it names each marking too.
  const picker = sidebar.getByLabel('Marking', { exact: true });
  await expect(picker).toHaveValue('m1');
  await expect(picker.locator('option')).toHaveText(['(None)', 'Marking']);

  // A tile added now marks with the dashboard's default from the start.
  await sidebar.getByRole('tab', { name: 'Add' }).click();
  await sidebar.getByTestId('add-chart').click();
  await sidebar.getByRole('tab', { name: 'Properties' }).click();
  await expect(sidebar.getByLabel('Marking', { exact: true })).toHaveValue('m1');

  // And "(None)" is a tile that marks with nothing: chosen here, clicking in
  // it changes no marking.
  await tile(page, 'tile-status').click();
  await sidebar.getByLabel('Marking', { exact: true }).selectOption('');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeVisible();

  await clickBar(page, tile(page, 'tile-status'), 'shipped');
  await expect(tile(page, 'tile-status').getByTestId('mark-badge')).toHaveCount(0);
});

/**
 * AC-107: WHEN a tile is limited by one or more markings, THE SYSTEM SHALL
 * restrict its query to those markings, combined as All markings (AND) or Any
 * marking (OR) according to its setting, and SHALL skip markings that are
 * empty.
 * `Fails when: a tile limited by two markings with one empty returns no rows,
 * or OR behaves as AND.`
 * AC-109: WHEN every marking limiting a tile is empty, THE SYSTEM SHALL show
 * the tile's nothing-marked state.
 * `Fails when: an unmarked dashboard shows a limited tile's full data with no
 * indication.`
 * AC-110: WHEN a tile is first limited by a marking, THE SYSTEM SHALL set its
 * nothing-marked state to the message option and pre-fill the message with
 * the names of the tiles that mark with those markings.
 * `Fails when: the message is empty or names no tile.`
 * AC-111: IF a limiting marking is not empty but its items are excluded by the
 * active filters, THEN THE SYSTEM SHALL say the marked items are hidden by
 * the filters rather than showing the nothing-marked state.
 * `Fails when: the tile shows "nothing is marked" while something is marked.`
 */

/** The axis labels a tile draws, which say what its query returned. */
async function axisLabels(target: Locator) {
  return target
    .locator('svg text')
    .evaluateAll((nodes) => nodes.map((node) => node.textContent ?? '').filter((text) => text));
}

test('a limited tile shows only what is marked, and says so while nothing is', async ({
  page,
  request,
}) => {
  const { id, title } = await markingDashboard(request, { limited: true });
  await open(page, id, title);

  const details = tile(page, 'tile-details');
  /**
   * AC-109 first, because it is the state the dashboard opens in: nothing is
   * marked anywhere, so the details tile is waiting. The message names the
   * tile to go and click — which may be on a page tab that is not open, and
   * is the part a reader cannot work out for themselves.
   */
  await expect(details.getByTestId('nothing-marked')).toContainText('By status');
  await expect(details.getByTestId('chart-canvas')).toHaveCount(0);

  // Every status the master draws — the value axis's own ticks dropped, so
  // this is the set the details tile is measured against.
  const statuses = (await axisLabels(tile(page, 'tile-status'))).filter(
    (text) => !/^[\d.,]+$/.test(text),
  );
  expect(statuses.length).toBeGreaterThan(1);

  await clickBar(page, tile(page, 'tile-status'), 'shipped');

  // AC-107: restricted to the marking — one status, not all of them. The
  // master still draws every bar; only the limited tile narrows.
  await expect(details.getByTestId('chart-canvas')).toBeVisible();
  await expect
    .poll(async () => (await axisLabels(details)).filter((text) => statuses.includes(text)))
    .toEqual(['shipped']);
  await expect(details.getByTestId('nothing-marked')).toHaveCount(0);
});

test('an empty marking limiting a tile is skipped, not intersected', async ({ page, request }) => {
  /**
   * The criterion's own failing state. Two markings limit the tile, combined
   * with AND, and only one of them has anything in it. Read naively the tile
   * would intersect against an empty set and go blank the moment someone
   * started working — with "go and mark something in the other master tile
   * as well" as a remedy nobody would guess (direction.md rule 33).
   */
  const { id, title } = await markingDashboard(request, { limited: true, second: true });
  await open(page, id, title);

  const details = tile(page, 'tile-details');
  await clickBar(page, tile(page, 'tile-status'), 'shipped');

  await expect(details.getByTestId('chart-canvas')).toBeVisible();
  await expect(details.getByTestId('nothing-marked')).toHaveCount(0);
  await expect.poll(async () => (await axisLabels(details)).includes('shipped')).toBe(true);
});

test('Any marking widens a limited tile where All markings narrows it', async ({
  page,
  request,
}) => {
  /**
   * The other half of AC-107's failing state: "or OR behaves as AND". Two
   * markings limit the tile, each holding a different status. Under AND the
   * tile can show nothing — no row is both — and under OR it shows both.
   *
   * Without this the setting was inert: hard-coding `'all'` in the dashboard
   * left every test green, because the unit test drives `limitFilterFor`
   * directly and the component test only checks that the select emits a patch.
   */
  const { id, title } = await markingDashboard(request, { limited: true, second: true });
  await open(page, id, title);
  const details = tile(page, 'tile-details');

  // The statuses the details tile could draw, measured on the master so the
  // chart's own title and value-axis ticks are never counted as data.
  const statuses = (await axisLabels(tile(page, 'tile-status'))).filter(
    (text) => !/^[\d.,]+$/.test(text),
  );
  const shown = async () => (await axisLabels(details)).filter((text) => statuses.includes(text));

  // tile-status marks with m1; tile-category marks with m2, and marking a
  // category there puts a `products.category` item in m2.
  await clickBar(page, tile(page, 'tile-status'), 'shipped');
  const category = (await axisLabels(tile(page, 'tile-category'))).find(
    (text) => !/^[\d.,]+$/.test(text) && !statuses.includes(text),
  );
  await clickBar(page, tile(page, 'tile-category'), category as string);

  // AND: shipped orders of that category — one status.
  await expect(details.getByTestId('chart-canvas')).toBeVisible();
  await expect.poll(shown).toEqual(['shipped']);

  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  const sidebar = page.getByRole('complementary', { name: 'Edit sidebar' });
  await details.click();
  await sidebar.getByRole('tab', { name: 'Properties' }).click();
  await sidebar.getByLabel('Combine markings').selectOption('any');

  // OR: every shipped order, *plus* every order of that category — which
  // brings back statuses the AND excluded.
  await expect.poll(async () => (await shown()).length).toBeGreaterThan(1);
});

test('the nothing-marked state is the one set on the tile, not one state for all', async ({
  page,
  request,
}) => {
  // AC-109's failing state is "a state other than the one configured", so
  // each of the three has to be reachable from the tile's own setting.
  const { id, title } = await markingDashboard(request, { limited: true });
  await open(page, id, title);
  const details = tile(page, 'tile-details');
  await expect(details.getByTestId('nothing-marked')).toBeVisible();

  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  const sidebar = page.getByRole('complementary', { name: 'Edit sidebar' });
  await details.click();
  await sidebar.getByRole('tab', { name: 'Properties' }).click();
  const state = sidebar.getByLabel('When nothing is marked');

  // Empty visualization: the tile holds its place and says nothing.
  await state.selectOption('empty');
  await expect(details.getByTestId('nothing-marked-empty')).toBeVisible();
  await expect(details.getByTestId('nothing-marked')).toHaveCount(0);

  // All data: the tile draws, exactly as an unlimited one would.
  await state.selectOption('all');
  await expect(details.getByTestId('chart-canvas')).toBeVisible();
  await expect(details.getByTestId('nothing-marked-empty')).toHaveCount(0);
});

test('a tile cannot be limited by the marking it marks with, and is told why', async ({
  page,
  request,
}) => {
  // AC-108, at the control: the master tile marks with m1, so m1 is not a
  // limit it can take — a tile limited by its own marking would lock itself.
  const { id, title } = await markingDashboard(request, { limited: true });
  await open(page, id, title);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();

  await tile(page, 'tile-status').click();
  const sidebar = page.getByRole('complementary', { name: 'Edit sidebar' });
  await sidebar.getByRole('tab', { name: 'Properties' }).click();

  const own = sidebar.getByLabel('Limit by Marking');
  await expect(own).toBeDisabled();
  await expect(sidebar.getByTestId('limit-m1')).toContainText('marks with this');
});

test('a tile limited for the first time starts with a message naming its master', async ({
  page,
  request,
}) => {
  // AC-110. The tile marks with nothing, so m1 is a limit it may take.
  const { id, title } = await markingDashboard(request);
  await open(page, id, title);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();

  const sidebar = page.getByRole('complementary', { name: 'Edit sidebar' });
  await tile(page, 'tile-category').click();
  await sidebar.getByRole('tab', { name: 'Properties' }).click();
  await sidebar.getByLabel('Marking', { exact: true }).selectOption('');
  await sidebar.getByLabel('Limit by Marking').check();

  /**
   * The message, pre-filled with the tile that marks with m1.
   *
   * Only this assertion is made. Checking the *state* reads "message" here
   * whether or not the patch ever stored it, because the control falls back
   * to `NOTHING_MARKED_DEFAULT` — an assertion that cannot fail is worse than
   * none, since it reads as cover. The message is empty without the patch.
   */
  await expect(sidebar.getByLabel('Message')).toHaveValue(/By status/);
});

test('a marking whose items the filters exclude says so, not “nothing is marked”', async ({
  page,
  request,
}) => {
  /**
   * AC-111. The two states want different things of the reader — one wants a
   * mark, the other wants a filter changed — so telling someone to go and
   * mark something that *is* marked sends them looking for a bug.
   */
  const { id, title } = await markingDashboard(request, { limited: true });

  // A filter on the details tile alone, keeping a status other than the one
  // about to be marked. Marks are the reader's view state, so this is set
  // before marking rather than by navigating away from a mark.
  const filters = JSON.stringify([
    { id: 'f-status', member: 'orders.status', value: { kind: 'values', values: ['completed'] } },
  ]);
  await page.goto(`/explore/dashboards/${id}?filters=${encodeURIComponent(filters)}`);
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  await expect(tile(page, 'tile-status').getByTestId('chart-canvas')).toBeVisible();

  const details = tile(page, 'tile-details');
  await expect(details.getByTestId('nothing-marked')).toBeVisible();

  await clickBar(page, tile(page, 'tile-status'), 'shipped');

  await expect(details.getByTestId('marks-filtered-out')).toBeVisible();
  await expect(details.getByTestId('nothing-marked')).toHaveCount(0);
});

/**
 * AC-105: WHEN the same set of items is marked again, THE SYSTEM SHALL produce
 * an identical Cube query to the previous time, so the result can be served
 * from cache.
 * `Fails when: marking the same two items in the other order asks Cube a
 * different question.`
 */
test('the same set of marks asks Cube the same question, whatever order it was marked in', async ({
  page,
  request,
}) => {
  const { id, title } = await markingDashboard(request, { limited: true });

  // Every query the page sends, as sent.
  const asked: string[] = [];
  await page.route('**/api/load', async (route) => {
    const body = route.request().postData();
    if (body !== null) asked.push(body);
    await route.continue();
  });

  await open(page, id, title);
  const details = tile(page, 'tile-details');
  const master = tile(page, 'tile-status');

  // shipped, then completed.
  await clickBar(page, master, 'shipped');
  await clickBar(page, master, 'completed', ['ControlOrMeta']);
  await expect(details.getByTestId('chart-canvas')).toBeVisible();
  // Generously, because this waits on a round trip to Cube under whatever
  // load the rest of the suite is putting on it.
  await expect
    .poll(() => asked.filter((body) => body.includes('completed')).length, { timeout: 20_000 })
    .toBeGreaterThan(0);
  const first = asked.filter((body) => body.includes('completed') && body.includes('shipped'));

  // The other order, from a clean marking.
  await page.reload();
  await expect(master.getByTestId('chart-canvas')).toBeVisible();
  asked.length = 0;
  await clickBar(page, master, 'completed');
  await clickBar(page, master, 'shipped', ['ControlOrMeta']);
  await expect(details.getByTestId('chart-canvas')).toBeVisible();
  await expect
    .poll(() => asked.filter((body) => body.includes('shipped')).length, { timeout: 20_000 })
    .toBeGreaterThan(0);
  const second = asked.filter((body) => body.includes('completed') && body.includes('shipped'));

  expect(first.length).toBeGreaterThan(0);
  expect(second.length).toBeGreaterThan(0);
  // The same question, character for character: a marking is a set, and the
  // order it was clicked in is the user's history, not part of what was asked.
  expect(second.at(-1)).toBe(first.at(-1));
});

/**
 * T218 / AC-198: WHEN the user opens Settings › Markings, THE SYSTEM SHALL
 * list the dashboard's markings with their colour, name, whether each is the
 * default and how many tiles mark with or are limited by it, let the user add
 * a marking (up to four), rename, recolour, delete and make one the default,
 * and show a table of every chart tile with the marking it marks with and the
 * markings that limit it.
 * `Fails when: any of those changes cannot be made on that page, or the tiles
 * table is missing.`
 */
test('Settings › Markings adds, renames, recolours, deletes and defaults markings, and sets each tile’s', async ({
  page,
  request,
}) => {
  const { id, title } = await markingDashboard(request, { limited: true });
  await open(page, id, title);
  await page.getByRole('button', { name: 'Dashboard settings' }).click();
  await page
    .getByRole('navigation', { name: 'Settings sections' })
    .locator('[data-section="Markings"]')
    .click();
  const panel = page.getByRole('region', { name: 'Markings settings' });
  const markings = panel.getByRole('table', { name: 'Markings', exact: true });

  // The one marking: its colour, name, default, and what uses it — the two
  // masters follow the default, and the details tile is limited by it.
  const first = markings.getByRole('row').nth(1);
  await expect(first.getByRole('textbox', { name: 'Name of marking 1' })).toHaveValue('Marking');
  await expect(first.getByRole('radio', { name: 'Colour 1' })).toBeChecked();
  await expect(first.getByRole('radio', { name: 'Default marking' })).toBeChecked();
  await expect(first).toContainText('Used by 2 · limits 1');

  // Add one: named, recoloured, made the default.
  await panel.getByRole('button', { name: '+ New marking' }).click();
  const second = markings.getByRole('row').nth(2);
  await second.getByRole('textbox', { name: 'Name of marking 2' }).fill('Region');
  await second.getByRole('radio', { name: 'Colour 3' }).click();
  await expect(second.getByRole('radio', { name: 'Colour 3' })).toBeChecked();
  await second.getByRole('radio', { name: 'Default marking' }).click();
  await expect(first.getByRole('radio', { name: 'Default marking' })).not.toBeChecked();

  // Up to four; a fifth is refused, and says why.
  await panel.getByRole('button', { name: '+ New marking' }).click();
  await panel.getByRole('button', { name: '+ New marking' }).click();
  await expect(markings.getByRole('row')).toHaveCount(5);
  const more = panel.getByRole('button', { name: '+ New marking' });
  await expect(more).toHaveAttribute('aria-disabled', 'true');
  // Clicked anyway — Playwright will not click what says it is disabled.
  await more.dispatchEvent('click');
  await expect(markings.getByRole('row')).toHaveCount(5);
  await expect(panel).toContainText('Four markings at most');

  // Delete the fourth.
  await markings
    .getByRole('row')
    .nth(4)
    .getByRole('button', { name: /^Delete / })
    .click();
  await expect(markings.getByRole('row')).toHaveCount(4);

  // The tiles table: every chart tile, what it marks with and what limits it.
  const tiles = panel.getByRole('table', { name: 'Tiles and markings' });
  await expect(tiles.getByRole('row')).toHaveCount(4);
  await tiles.getByRole('combobox', { name: 'Marking for By category' }).selectOption({
    label: 'Marking',
  });
  await tiles.getByRole('checkbox', { name: 'Details by status limited by Region' }).check();
  // What each tile marks with, as shown: the details tile marks with none,
  // and the other master follows the new default.
  await expect(tiles.getByRole('combobox', { name: 'Marking for Details by status' })).toHaveValue(
    '',
  );
  await expect(
    tiles.getByRole('combobox', { name: 'Marking for By status' }).locator('option:checked'),
  ).toHaveText('Region (default)');

  // A marking with no name is refused on save, and nothing is saved.
  const secondName = second.getByRole('textbox', { name: 'Name of marking 2' });
  await secondName.fill('');
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByTestId('settings-save-failed')).toHaveText(
    'Each marking needs a name of its own.',
  );
  await expect(page.getByTestId('dashboard-settings')).toBeVisible();
  await secondName.fill('Region');

  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByTestId('dashboard-settings')).toBeHidden();

  // Saved as set.
  const saved = (await (await request.get(`${API}/documents/dashboard/${id}`)).json()) as {
    body: {
      markings: { id: string; name: string; slot: string; isDefault: boolean }[];
      pages: { items: { id: string; marksWith?: string; limitedBy?: string[] }[] }[];
    };
  };
  const region = saved.body.markings.find((marking) => marking.name === 'Region');
  expect(region).toMatchObject({ slot: 'mk3', isDefault: true });
  expect(saved.body.markings).toHaveLength(3);
  const items = saved.body.pages[0]?.items ?? [];
  expect(items.find((item) => item.id === 'tile-category')?.marksWith).toBe('m1');
  expect(items.find((item) => item.id === 'tile-details')?.limitedBy).toEqual(['m1', region?.id]);
});

/**
 * T219 / AC-199: WHEN the user opens a chart tile's menu in view mode, THE
 * SYSTEM SHALL offer View as table, View query, Download CSV and Edit chart,
 * and, while the dashboard is in Markings mode, the marked-rows actions headed
 * by the tile's marking and its count.
 * `Fails when: one of those items is missing, or the marked-rows actions
 * appear outside Markings mode.`
 */
test('a chart tile’s menu offers its views, its query, a download and Edit chart, and its marking’s actions', async ({
  page,
  request,
}) => {
  const { id, title } = await markingDashboard(request);
  await open(page, id, title);
  const status = tile(page, 'tile-status');
  await clickBar(page, status, 'shipped');
  await expect(status.getByTestId('mark-badge')).toContainText('1 marked');

  const openMenu = async () => {
    await status.getByRole('button', { name: 'Actions for By status' }).click();
    return status.getByRole('list', { name: 'Actions for By status' });
  };
  let menu = await openMenu();
  // The marked-rows group first, headed by the tile's marking and its count.
  const marked = menu.getByRole('group', { name: 'Marking · 1 marked' });
  // Filter to and out of marked first, as the prototype's group (T119, AC-113).
  await expect(marked.getByRole('button')).toHaveText([
    'Filter to marked',
    'Filter out marked',
    'View marked rows',
    'Invert marking',
    'Mark all',
    'Unmark',
    'Create details tile',
  ]);
  await expect(
    menu.getByRole('button').filter({
      hasNotText:
        /^(Filter to marked|Filter out marked|View marked rows|Invert marking|Mark all|Unmark|Create details tile)$/,
    }),
  ).toHaveText(['View as table', 'View query', 'Download CSV', 'Edit chart']);

  // View as table: the tile shows its rows.
  await menu.getByRole('button', { name: 'View as table' }).click();
  await expect(status.getByRole('table')).toBeVisible();

  // View query: the Cube query, and the SQL it runs.
  menu = await openMenu();
  await menu.getByRole('button', { name: 'View query' }).click();
  const dialog = page.getByRole('dialog', { name: /By status/ });
  await expect(dialog).toContainText('"orders.count"');
  await expect(dialog.getByTestId('generated-sql')).toContainText(/select/i);
  // However long Cube's lines, Close stays in the dialog and in view.
  const close = dialog.getByRole('button', { name: 'Close' });
  await expect(close).toBeInViewport({ ratio: 1 });
  const [dialogBox, closeBox] = [await dialog.boundingBox(), await close.boundingBox()];
  expect((closeBox?.x ?? 0) + (closeBox?.width ?? 0)).toBeLessThanOrEqual(
    (dialogBox?.x ?? 0) + (dialogBox?.width ?? 0) + 1,
  );
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  // Back where it was opened from.
  await expect(status.getByRole('button', { name: 'Actions for By status' })).toBeFocused();

  // Unmark, from the marking's own group — and said, as every change is (AC-101).
  menu = await openMenu();
  await menu.getByRole('button', { name: 'Unmark' }).click();
  await expect(status.getByTestId('mark-badge')).toHaveCount(0);
  await expect(page.getByTestId('marking-announcer')).toContainText('Marking cleared');

  // Edit chart opens the editor on it.
  menu = await openMenu();
  await menu.getByRole('button', { name: 'Edit chart' }).click();
  await expect(page.getByRole('heading', { name: 'Chart editor' })).toBeVisible();
});

test('outside Markings mode, a chart tile’s menu has no marked-rows actions', async ({
  page,
  request,
}) => {
  const { id, title } = await markingDashboard(request);
  // The same dashboard, cross-filtering.
  const stored = (await (await request.get(`${API}/documents/dashboard/${id}`)).json()) as {
    version: number;
    body: { settings: Record<string, unknown> };
  };
  await request.put(`${API}/documents/dashboard/${id}`, {
    data: {
      version: stored.version,
      body: {
        ...stored.body,
        settings: { ...stored.body.settings, interactions: { mode: 'crossFilter' } },
      },
    },
  });
  await open(page, id, title);
  const status = tile(page, 'tile-status');
  await status.getByRole('button', { name: 'Actions for By status' }).click();
  const menu = status.getByRole('list', { name: 'Actions for By status' });
  await expect(menu.getByRole('button', { name: 'Download CSV' })).toBeVisible();
  await expect(menu.getByRole('group')).toHaveCount(0);
  await expect(menu.getByRole('button', { name: 'Unmark' })).toHaveCount(0);
});

/**
 * T219 / AC-201: THE SYSTEM SHALL show the marked-items badge in a chart
 * tile's header row, beside its title, and only on chart tiles whose marking
 * holds something.
 * `Fails when: the badge pushes the title down, or appears on a tile that does
 * not mark or whose marking is empty.`
 */
test('the marked badge sits beside the title in the tile’s header, and never on a text tile', async ({
  page,
}) => {
  // The seeded dashboard has a text tile beside a bar chart.
  await page.goto('/explore/dashboards/seed-root-dashboard-1');
  const status = tile(page, 'tile-status');
  const heading = status.getByRole('heading', { level: 3 });
  await expect(status.getByTestId('chart-canvas')).toBeVisible();
  // Measured within its tile: the filter bar above grows when its chip
  // replaces the hint, and moves every tile down with it.
  const titleInTile = async () =>
    ((await heading.boundingBox())?.y ?? 0) - ((await status.boundingBox())?.y ?? 0);
  const before = await titleInTile();

  // Its bars are the product categories; the statuses are its legend.
  await clickBar(page, status, 'Components');
  const badge = status.getByTestId('mark-badge');
  await expect(badge).toContainText('1 marked');
  // In the header row, beside the title, and the title where it was.
  await expect(status.locator('.tile-head').getByTestId('mark-badge')).toHaveCount(1);
  expect(await titleInTile()).toBeCloseTo(before, 0);
  const badgeBox = await badge.boundingBox();
  const headingBox = await heading.boundingBox();
  expect(
    Math.abs(
      (badgeBox?.y ?? 0) +
        (badgeBox?.height ?? 0) / 2 -
        ((headingBox?.y ?? 0) + (headingBox?.height ?? 0) / 2),
    ),
  ).toBeLessThan(6);
  // Not on the text tile, which marks nothing — and the tile is there.
  await expect(tile(page, 'tile-notes')).toBeVisible();
  await expect(tile(page, 'tile-notes').getByTestId('mark-badge')).toHaveCount(0);
});

/**
 * T220 / AC-200: THE SYSTEM SHALL show each non-empty marking in the filter bar
 * as a chip bordered in the marking's colour, naming the marking, summarising
 * its values by the members' titles, naming the tile it came from, and
 * offering a menu and a control that unmarks it.
 * `Fails when: a chip shows a member's internal name, omits the source tile,
 * or cannot unmark from the chip.`
 */
test('the marking’s chip names its values by title and its tile, is bordered in its colour, and unmarks', async ({
  page,
  request,
}) => {
  const { id, title } = await markingDashboard(request);
  await open(page, id, title);
  const status = tile(page, 'tile-status');
  await clickBar(page, status, 'shipped');

  // In the filter bar.
  const bar = page.getByRole('region', { name: 'Filters' });
  const chip = bar.getByTestId('mark-chip');
  await expect(chip).toContainText('Marking');
  await expect(chip).toContainText('Orders Status: shipped');
  await expect(chip).not.toContainText('orders.status');
  await expect(chip).toContainText('from By status');
  // Bordered in the marking's own colour: its swatch's.
  const [border, swatch, width] = await chip.evaluate((node) => [
    getComputedStyle(node).borderTopColor,
    getComputedStyle(node.querySelector('[data-testid="mark-chip-swatch"]') as HTMLElement)
      .backgroundColor,
    getComputedStyle(node).borderTopWidth,
  ]);
  expect(border).toBe(swatch);
  // The prototype's 1.5 px border, drawn — which browsers round to whole
  // device pixels, so 1 px at a scale of one.
  expect(parseFloat(width ?? '0')).toBeGreaterThanOrEqual(1);

  // Its ×: the marking is emptied, and every trace of it goes.
  await page.getByRole('button', { name: 'Unmark Marking' }).click();
  await expect(chip).toHaveCount(0);
  await expect(status.getByTestId('mark-badge')).toHaveCount(0);
  await expect(page.getByTestId('marking-announcer')).toContainText('Marking cleared');
  // The × went with its chip; focus did not fall to the page.
  await expect(bar).toBeFocused();

  // And its menu's Unmark, said as well.
  await clickBar(page, status, 'completed');
  await expect(chip).toContainText('completed');
  await expect(page.getByTestId('marking-announcer')).not.toContainText('cleared');
  await page.getByRole('button', { name: 'Marking menu' }).click();
  await page.getByRole('menuitem', { name: 'Unmark' }).click();
  await expect(chip).toHaveCount(0);
  await expect(page.getByTestId('marking-announcer')).toContainText('Marking cleared');
});

/**
 * T246 / AC-187: the chip and the badge as dashboard.js draws them
 * (recheck-dashboard mismatches 8 and 11):
 * - `.mchip { padding: 0 2px 0 8px }`, its `.msum` secondary, its "from"
 *   `.xs.muted`, and `.mchip button { height: 20px; min-width: 20px; padding: 0 4px }`;
 * - `.mbadge { padding: 0 6px; color: var(--text-secondary); background: var(--bg-subtle) }`;
 * - each swatch a `.mk-swatch`: radius 3, ringed `inset 0 0 0 1px var(--border-strong)`,
 *   10 px in the chip and 8 px in the badge.
 */
test('the chip and the badge are the prototype’s: their padding, inks and ringed swatches (T246)', async ({
  page,
  request,
}) => {
  const { id, title } = await markingDashboard(request);
  await open(page, id, title);
  const status = tile(page, 'tile-status');
  await clickBar(page, status, 'shipped');

  const computed = (target: Locator, ...properties: string[]) =>
    target.evaluate(
      (element, names) =>
        Object.fromEntries(
          names.map((name) => [name, getComputedStyle(element).getPropertyValue(name)]),
        ),
      properties,
    );
  /** A declaration's value as the page computes it, through a probe. */
  const probe = (property: string, value: string) =>
    page.evaluate(
      ([name, declared]) => {
        const element = document.createElement('span');
        element.style.setProperty(name, declared);
        document.body.append(element);
        const read = getComputedStyle(element).getPropertyValue(name);
        element.remove();
        return read;
      },
      [property, value] as const,
    );
  const ring = await probe('box-shadow', 'inset 0 0 0 1px var(--wc-border-strong)');

  const chip = page.getByRole('region', { name: 'Filters' }).getByTestId('mark-chip');
  await expect(chip).toBeVisible();
  // The band keeps its 53 px with a chip in it, as with a hint or a pill (N8;
  // T246's review: it was 45 px here).
  expect((await page.getByRole('region', { name: 'Filters' }).boundingBox())?.height).toBe(53);
  expect(await computed(chip, 'padding-left', 'padding-right')).toEqual({
    'padding-left': '8px',
    'padding-right': '2px',
  });
  expect(await computed(chip.locator('.mark-chip__summary'), 'color')).toEqual({
    color: await probe('color', 'var(--wc-text-secondary)'),
  });
  expect(await computed(chip.getByText(/^from /), 'color', 'line-height')).toEqual({
    color: await probe('color', 'var(--wc-text-muted)'),
    'line-height': '16px',
  });
  expect(
    await computed(
      chip.getByTestId('mark-chip-swatch'),
      'width',
      'height',
      'border-radius',
      'box-shadow',
    ),
  ).toEqual({ width: '10px', height: '10px', 'border-radius': '3px', 'box-shadow': ring });
  for (const button of [
    chip.getByRole('button', { name: 'Marking menu' }),
    chip.getByRole('button', { name: 'Unmark Marking' }),
  ])
    expect(await computed(button, 'height', 'min-width', 'padding-left', 'padding-right')).toEqual({
      height: '20px',
      'min-width': '20px',
      'padding-left': '4px',
      'padding-right': '4px',
    });

  const badge = status.getByTestId('mark-badge');
  await expect(badge).toBeVisible();
  expect(
    await computed(badge, 'padding-left', 'padding-right', 'color', 'background-color'),
  ).toEqual({
    'padding-left': '6px',
    'padding-right': '6px',
    color: await probe('color', 'var(--wc-text-secondary)'),
    'background-color': await probe('background-color', 'var(--wc-bg-subtle)'),
  });
  expect(
    await computed(
      badge.getByTestId('mark-swatch'),
      'width',
      'height',
      'border-radius',
      'box-shadow',
    ),
  ).toEqual({ width: '8px', height: '8px', 'border-radius': '3px', 'box-shadow': ring });
});

/**
 * T077 / AC-071: WHEN the interaction mode changes and the settings are
 * saved, THE SYSTEM SHALL clear current marks and cross-filters.
 * `Fails when: a mark or cross-filter from the previous mode still affects a
 * tile.` (Cross-filters: `e2e/crossfilter.spec.ts`, "switching the
 * interaction mode and back leaves no cross-filter behind".)
 */
test('switching the interaction mode and back leaves no mark behind', async ({ page, request }) => {
  const { id, title } = await markingDashboard(request);
  await open(page, id, title);
  const status = tile(page, 'tile-status');
  await clickBar(page, status, 'shipped');
  await expect(status.getByTestId('mark-badge')).toContainText('1 marked');

  const settings = async () => {
    await page.getByRole('button', { name: 'Dashboard settings' }).click();
    await page.getByRole('button', { name: /^Interactions/ }).click();
  };
  // Settings looked at and left: the mode is the same, and so are the marks.
  await settings();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByTestId('dashboard-settings')).toHaveCount(0);
  await expect(status.getByTestId('mark-badge')).toContainText('1 marked');

  const setMode = async (label: string | RegExp) => {
    await settings();
    await page.getByRole('radio', { name: label }).check();
    await page.getByRole('button', { name: 'Save settings' }).click();
    await expect(page.getByTestId('dashboard-settings')).toHaveCount(0);
  };
  await setMode(/^Cross-filtering/);
  await setMode('Markings');

  // Back in Markings mode with nothing marked: what was marked before the
  // dashboard changed mode does not come back with it.
  await expect(status.getByTestId('chart-canvas')).toBeVisible();
  await expect(status.getByTestId('mark-badge')).toHaveCount(0);
  await expect(page.getByTestId('mark-chip')).toHaveCount(0);
  expect((await opacities(status)).every((value) => value === 1)).toBe(true);
});

/**
 * T121 / AC-115: WHEN the user chooses Invert marking or Mark all on a tile,
 * THE SYSTEM SHALL mark exactly the tile's unmarked items, or all of its
 * items, and leave other tiles' contributions to that marking unchanged.
 * `Fails when: an inverted marking keeps a previously marked item, or Mark all
 * misses a visible item.`
 *
 * Both from the tile's ⋯ marked-rows group, as the prototype's (AC-199).
 */
test('Invert marking and Mark all change one tile’s items, and keep another tile’s', async ({
  page,
  request,
}) => {
  const { id, title } = await markingDashboard(request);
  await open(page, id, title);
  const status = tile(page, 'tile-status');
  const category = tile(page, 'tile-category');
  // The status tile's shipped, and — added with Ctrl — the category tile's Instruments.
  await clickBar(page, status, 'shipped');
  await clickBar(page, category, 'Instruments', ['ControlOrMeta']);
  await expect(status.getByTestId('mark-badge')).toContainText('2 marked');
  /** How many of a tile's bars are faded — unmarked — and how many drawn. */
  const faded = async (target: Locator) => {
    const all = await opacities(target);
    return `${String(all.filter((value) => value < 1).length)} of ${String(all.length)}`;
  };
  // Of three statuses, shipped marked; of two categories, Instruments.
  await expect.poll(() => faded(status)).toBe('2 of 3');
  await expect.poll(() => faded(category)).toBe('1 of 2');
  /** The opacity of the bar over an axis label: the one a click on it marks. */
  const opacityAt = async (label: string) => {
    const at = await status.locator('svg text', { hasText: label }).first().boundingBox();
    return status.locator('svg path[fill]').evaluateAll(
      (nodes, x) =>
        nodes
          .map((node) => ({ box: (node as SVGGraphicsElement).getBoundingClientRect(), node }))
          .filter(({ box }) => box.width > 2 && box.height > 2 && box.left <= x && x <= box.right)
          // No bar found is no opacity at all, which no assertion accepts.
          .map(({ node }) => Number(node.getAttribute('fill-opacity') ?? 1))[0] ?? Number.NaN,
      (at?.x ?? 0) + (at?.width ?? 0) / 2,
    );
  };
  expect(await opacityAt('shipped')).toBe(1);

  const act = async (name: string) => {
    await status.getByRole('button', { name: /^Actions for / }).click();
    const group = status
      .getByRole('list', { name: /^Actions for / })
      .getByRole('group', { name: /marked$/ });
    await group.getByRole('button', { name }).click();
  };

  // Inverted: the tile's other two statuses, not shipped; Instruments kept.
  await act('Invert marking');
  await expect(status.getByTestId('mark-badge')).toContainText('3 marked');
  await expect.poll(() => faded(status)).toBe('1 of 3');
  // Faded to direction.md's unmarked strength, not merely something under 1.
  await expect.poll(() => opacityAt('shipped')).toBe(0.28);
  await expect.poll(() => faded(category)).toBe('1 of 2');

  // Mark all: every status the tile draws, stored as what the tile is
  // filtered by (AC-102) — nothing, here, so every row — and Instruments kept.
  await act('Mark all');
  await expect(status.getByTestId('mark-badge')).toContainText('4 marked');
  await expect.poll(() => faded(status)).toBe('0 of 3');
  await expect.poll(() => faded(category)).toBe('0 of 2');
  await expect(page.getByTestId('mark-chip').locator('.mark-chip__summary')).toHaveAttribute(
    'title',
    /all 3 in By status/,
  );

  // A Ctrl-click then takes one status away, as on any marked item.
  await clickBar(page, status, 'completed', ['ControlOrMeta']);
  await expect(status.getByTestId('mark-badge')).toContainText('3 marked');
  await expect.poll(() => faded(status)).toBe('1 of 3');
  await expect.poll(() => opacityAt('completed')).toBe(0.28);
  await expect.poll(() => faded(category)).toBe('1 of 2');

  // Mark all, then Invert: none of the tile, Instruments still kept.
  await act('Mark all');
  await act('Invert marking');
  await expect(status.getByTestId('mark-badge')).toContainText('1 marked');
  await expect.poll(() => faded(status)).toBe('3 of 3');
  await expect.poll(() => faded(category)).toBe('1 of 2');
});

test('Mark all limits a details tile by what the tile shows, and is offered only where a click marks its categories', async ({
  page,
  request,
}) => {
  const { id, title } = await markingDashboard(request, { limited: true, split: true });
  await open(page, id, title);
  const details = tile(page, 'tile-details');
  const statuses = (await axisLabels(tile(page, 'tile-status'))).filter(
    (text) => !/^[\d.,]+$/.test(text),
  );
  await expect(details.getByTestId('nothing-marked')).toBeVisible();

  const group = async (target: Locator) => {
    await target.getByRole('button', { name: /^Actions for / }).click();
    return target
      .getByRole('list', { name: /^Actions for / })
      .getByRole('group', { name: /marked$/ });
  };
  // By status, unfiltered, marked whole: the details tile shows every status.
  await (await group(tile(page, 'tile-status'))).getByRole('button', { name: 'Mark all' }).click();
  await expect(details.getByTestId('chart-canvas')).toBeVisible();
  await expect
    .poll(async () => (await axisLabels(details)).filter((text) => statuses.includes(text)))
    .toEqual(statuses);

  // A stacked bar's click marks its series, not its categories: not offered there.
  const split = await group(tile(page, 'tile-split'));
  await expect(split.getByRole('button', { name: 'Unmark' })).toBeVisible();
  await expect(split.getByRole('button', { name: 'Mark all' })).toHaveCount(0);
  await expect(split.getByRole('button', { name: 'Invert marking' })).toHaveCount(0);
});

/**
 * T118 / AC-112: WHEN the user chooses "Create details tile" on a tile, THE
 * SYSTEM SHALL add a tile limited by that tile's marking, with its
 * nothing-marked message pre-filled.
 * `Fails when: the new tile is not limited by the marking, or has no message.`
 *
 * From the tile's ⋯ marked-rows group (AC-199), then saved and read.
 */
test('Create details tile adds a tile limited by the tile’s marking, its message filled in', async ({
  page,
  request,
}) => {
  const { id, title } = await markingDashboard(request);
  await open(page, id, title);
  const status = tile(page, 'tile-status');
  const statuses = (await axisLabels(status)).filter((text) => !/^[\d.,]+$/.test(text));
  expect(statuses.length).toBeGreaterThan(1);
  const tiles = page.getByTestId('grid-item');
  const before = await tiles.count();

  await status.getByRole('button', { name: /^Actions for / }).click();
  await status
    .getByRole('list', { name: /^Actions for / })
    .getByRole('group', { name: /marked$/ })
    .getByRole('button', { name: 'Create details tile' })
    .click();

  // Beside it, in edit mode, chosen.
  const bar = page.getByRole('toolbar', { name: 'Dashboard editing' });
  await expect(bar).toBeVisible();
  await expect(tiles).toHaveCount(before + 1);
  const details = page.locator('[data-tile][data-selected="true"]');
  await expect(details).toBeVisible();
  const madeId = (await details.getAttribute('data-tile')) ?? '';
  const order = await tiles.evaluateAll((all) => all.map((each) => each.getAttribute('data-tile')));
  expect(order[order.indexOf('tile-status') + 1]).toBe(madeId);

  await bar.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(bar).toBeHidden();
  const made = tile(page, madeId);

  // Nothing marked: its message, naming every tile that marks with the
  // marking, as a first limit's does (AC-110).
  await expect(made.getByTestId('nothing-marked')).toContainText(
    'Nothing is marked in By status or By category. Mark something there to fill this tile.',
  );
  // Marked: only what is marked, while the tile it came from draws everything.
  await clickBar(page, status, 'shipped');
  await expect(made.getByTestId('chart-canvas')).toBeVisible();
  // The details of By status: a chart of its own, so named.
  await expect(made).toContainText('Details: By status');
  await expect
    .poll(async () => (await axisLabels(made)).filter((text) => statuses.includes(text)))
    .toEqual(['shipped']);
  expect((await axisLabels(status)).filter((text) => statuses.includes(text))).toEqual(statuses);
});

/**
 * AC-088: WHEN the user drags a rectangle, or Alt-drags a lasso, over a tile
 * that marks, THE SYSTEM SHALL mark every item the shape touches, and a
 * press-and-release without movement SHALL be treated as a click, not a
 * selection.
 * `Fails when: a drag of at least 5 pixels is treated as a click, or a click
 * is treated as an empty selection.`
 * AC-089: WHEN the user Ctrl-drags or ⌘-drags a shape, THE SYSTEM SHALL
 * toggle the enclosed items when all or none of them are marked, and
 * otherwise add them (direction.md rule 47).
 * `Fails when: a Ctrl-drag over a partly marked set unmarks items.`
 */
test.describe('marking with a shape', () => {
  /** Each category's axis label, where it has come to rest, left to right. */
  async function labelsOf(target: Locator, names: readonly string[]) {
    const boxes: { name: string; x: number; y: number; width: number }[] = [];
    for (const name of names) {
      const label = target.locator('svg text', { hasText: name }).first();
      await expect(label).toBeVisible();
      let last = '';
      let box = { x: 0, y: 0, width: 0 };
      await expect
        .poll(async () => {
          box = await label.evaluate((text) => {
            const rect = text.getBoundingClientRect();
            return { x: rect.x, y: rect.y, width: rect.width };
          });
          const now = JSON.stringify(box);
          const settled = box.width > 0 && now === last;
          last = now;
          return settled;
        })
        .toBe(true);
      boxes.push({ name, ...box });
    }
    return boxes.sort((a, b) => a.x - b.x);
  }

  const centre = (box: { x: number; width: number }) => box.x + box.width / 2;

  /** A press, a path, and a release, with the keys held throughout. */
  async function drag(
    page: Page,
    path: readonly (readonly [number, number])[],
    keys: ('ControlOrMeta' | 'Meta' | 'Alt')[] = [],
  ) {
    const [first, ...rest] = path;
    if (first === undefined) return;
    for (const key of keys) await page.keyboard.down(key);
    await page.mouse.move(first[0], first[1]);
    await page.mouse.down();
    for (const [x, y] of rest) await page.mouse.move(x, y, { steps: 4 });
    await page.mouse.up();
    for (const key of keys) await page.keyboard.up(key);
  }

  test('a rectangle marks every bar it touches, a lasso the one it rings, and a still press is a click', async ({
    page,
    request,
  }) => {
    const { id, title } = await markingDashboard(request);
    await open(page, id, title);
    const status = tile(page, 'tile-status');
    const [left, middle, right] = await labelsOf(status, ['completed', 'shipped', 'processing']);
    if (left === undefined || middle === undefined || right === undefined) throw new Error('axis');

    // Across the feet of the two left-hand bars, just above their labels.
    const top = left.y - 40;
    const foot = left.y - 6;
    await drag(page, [
      [centre(left) - 3, top],
      [centre(middle) + 3, foot],
    ]);
    const badge = status.getByTestId('mark-badge');
    await expect(badge).toContainText('2 marked');
    const chip = page.getByTestId('mark-chip');
    await expect(chip).toContainText(left.name);
    await expect(chip).toContainText(middle.name);
    await expect(chip).not.toContainText(right.name);

    // Alt: a lasso, ringing the right-hand bar alone, replaces the marking.
    await drag(
      page,
      [
        [centre(right) - 6, top],
        [centre(right) + 6, top],
        [centre(right) + 6, foot],
        [centre(right) - 6, foot],
        [centre(right) - 6, top + 2],
      ],
      ['Alt'],
    );
    await expect(badge).toContainText('1 marked');
    await expect(chip).toContainText(right.name);
    await expect(chip).not.toContainText(left.name);

    // Under 5 px of movement is a click on the bar, not an empty selection.
    await drag(page, [
      [centre(left), foot - 4],
      [centre(left) + 2, foot - 3],
    ]);
    await expect(badge).toContainText('1 marked');
    await expect(chip).toContainText(left.name);
    await expect(chip).not.toContainText(right.name);
  });

  test('a Ctrl-drag adds to a partly marked set, and toggles a set wholly marked', async ({
    page,
    request,
  }) => {
    const { id, title } = await markingDashboard(request);
    await open(page, id, title);
    const status = tile(page, 'tile-status');
    const [left, middle, right] = await labelsOf(status, ['completed', 'shipped', 'processing']);
    if (left === undefined || middle === undefined || right === undefined) throw new Error('axis');
    const top = left.y - 40;
    const foot = left.y - 6;
    const badge = status.getByTestId('mark-badge');
    const chip = page.getByTestId('mark-chip');

    await clickBar(page, status, left.name);
    await expect(badge).toContainText('1 marked');

    // Over the left two, one of them marked: add, so both are marked.
    const overLeftTwo = [
      [centre(left) - 3, top],
      [centre(middle) + 3, foot],
    ] as const;
    await drag(page, overLeftTwo, ['ControlOrMeta']);
    await expect(badge).toContainText('2 marked');
    await expect(chip).toContainText(left.name);
    await expect(chip).toContainText(middle.name);

    // Over the right one, none marked: toggled on, beside the others.
    await drag(
      page,
      [
        [centre(right) - 3, top],
        [centre(right) + 3, foot],
      ],
      ['ControlOrMeta'],
    );
    await expect(badge).toContainText('3 marked');

    // Over the left two again, both marked: toggled off, the right one kept.
    await drag(page, overLeftTwo, ['ControlOrMeta']);
    await expect(badge).toContainText('1 marked');
    await expect(chip).toContainText(right.name);
    await expect(chip).not.toContainText(left.name);
  });

  // T190 stage 7's review: a gesture is one thing — a click, a shape, a
  // context menu — and belongs to the tile it began on.
  test('a drag out and back, a right-click, an overshoot and an empty drag each do one thing', async ({
    page,
    request,
  }) => {
    const { id, title } = await markingDashboard(request, { second: true });
    await open(page, id, title);
    const status = tile(page, 'tile-status');
    const category = tile(page, 'tile-category');
    const [left, middle] = await labelsOf(status, ['completed', 'shipped', 'processing']);
    if (left === undefined || middle === undefined) throw new Error('axis');
    const badge = status.getByTestId('mark-badge');
    const foot = left.y - 8;

    // Ctrl, out 20 px and back onto the same bar: the shape toggles it off,
    // and no click toggles it back on.
    await clickBar(page, status, left.name);
    await expect(badge).toContainText('1 marked');
    await drag(
      page,
      [
        [centre(left), foot],
        [centre(left) + 20, foot - 20],
        [centre(left) + 1, foot],
      ],
      ['ControlOrMeta'],
    );
    await expect(badge).toHaveCount(0);

    // A right-click on a bar marks nothing.
    await page.mouse.click(centre(middle), foot, { button: 'right' });
    await expect(badge).toHaveCount(0);

    // The other tile marks with its own marking; a drag on this one that
    // ends over it leaves that marking alone.
    await clickBar(page, category, 'Instruments');
    const categoryBadge = category.getByTestId('mark-badge');
    await expect(categoryBadge).toContainText('1 marked');
    const into = await category.getByTestId('chart-canvas').boundingBox();
    if (into === null) throw new Error('no canvas');
    await drag(page, [
      [centre(left) - 3, left.y - 40],
      [into.x + into.width / 2, into.y + 20],
    ]);
    await expect(categoryBadge).toContainText('1 marked');

    // A plain drag over nothing on this tile replaces its marking with nothing.
    await clickBar(page, status, middle.name);
    await expect(badge).toContainText('1 marked');
    const box = await status.getByTestId('chart-canvas').boundingBox();
    if (box === null) throw new Error('no canvas');
    await drag(page, [
      [box.x + 4, box.y + 4],
      [box.x + 30, box.y + 12],
    ]);
    await expect(badge).toHaveCount(0);
    await expect(categoryBadge).toContainText('1 marked');
  });
});

/**
 * AC-113: WHEN the user chooses "Filter to marked" or "Filter out marked", THE
 * SYSTEM SHALL create a removable dashboard filter equivalent to the
 * marking's predicate, or its negation, and then clear the marking
 * (direction.md rule 53).
 * `Fails when: the filter is not removable, the marking survives, or the rows
 * kept differ from the marked rows.`
 *
 * From the tile's ⋯ marked-rows group (AC-199): the status tile keeps exactly
 * the marked status, or exactly the others; the category tile, joined to it,
 * is filtered too; the chip removes it; and with nothing marked the actions
 * say why they are unavailable.
 */
test('Filter to marked and Filter out marked filter every tile they reach, clear the marking, and come off', async ({
  page,
  request,
}) => {
  const { id, title } = await markingDashboard(request);
  await open(page, id, title);
  const status = tile(page, 'tile-status');
  const category = tile(page, 'tile-category');
  const labels = (target: Locator) =>
    target.locator('svg text').evaluateAll((nodes) =>
      nodes
        .map((node) => node.textContent ?? '')
        .filter((text) => ['completed', 'shipped', 'processing'].includes(text))
        .sort(),
    );
  const act = async (name: string) => {
    await status.getByRole('button', { name: /^Actions for / }).click();
    await status
      .getByRole('list', { name: /^Actions for / })
      .getByRole('group', { name: /marked$/ })
      .getByRole('button', { name })
      .click();
  };
  /** The statuses the data holds, so "every status" below means these. */
  const countsByStatus = () =>
    request
      .post(`${API}/load`, {
        data: { query: { measures: ['orders.count'], dimensions: ['orders.status'] } },
      })
      .then(async (response) => {
        const rows = ((await response.json()) as { data: Record<string, unknown>[] }).data;
        return rows;
      });
  const byStatus = Object.fromEntries(
    (await countsByStatus()).map((row) => [
      String(row['orders.status']),
      Number(row['orders.count']),
    ]),
  );
  expect(Object.keys(byStatus).sort()).toEqual(['completed', 'processing', 'shipped']);

  // To marked: only shipped is left, on both tiles, and the marking is gone.
  await clickBar(page, status, 'shipped');
  await expect(status.getByTestId('mark-badge')).toContainText('1 marked');
  await act('Filter to marked');
  const chip = page.getByTestId('mark-filter-chip');
  await expect(chip).toContainText('Filtered to Marking');
  await expect(chip).toContainText('shipped');
  await expect.poll(() => labels(status)).toEqual(['shipped']);
  await expect(status.getByTestId('mark-badge')).toHaveCount(0);
  await expect(page.getByTestId('mark-chip')).toHaveCount(0);
  // The joined tile is asked for shipped orders only: its table view's total.
  await category.getByRole('button', { name: /^Actions for / }).click();
  await category
    .getByRole('list', { name: /^Actions for / })
    .getByRole('button', { name: 'View query' })
    .click();
  await expect(page.getByRole('dialog')).toContainText('"equals"');
  await expect(page.getByRole('dialog')).toContainText('"shipped"');
  await page.keyboard.press('Escape');

  // With nothing marked, both actions say why they cannot run.
  await status.getByRole('button', { name: /^Actions for / }).click();
  const group = status
    .getByRole('list', { name: /^Actions for / })
    .getByRole('group', { name: /marked$/ });
  await expect(group.getByRole('button', { name: 'Filter to marked' })).toHaveAttribute(
    'aria-disabled',
    'true',
  );
  await expect(group.getByRole('button', { name: 'Filter out marked' })).toHaveAttribute(
    'title',
    'Nothing is marked.',
  );
  await page.keyboard.press('Escape');

  // Removed from its chip: every status again.
  await chip.getByRole('button', { name: /^Remove: / }).click();
  await expect(chip).toHaveCount(0);
  await expect.poll(() => labels(status)).toEqual(['completed', 'processing', 'shipped']);

  // Out of marked: every status but shipped.
  await clickBar(page, status, 'shipped');
  await act('Filter out marked');
  await expect(chip).toContainText('Filtered out Marking');
  await expect.poll(() => labels(status)).toEqual(['completed', 'processing']);
  await expect(status.getByTestId('mark-badge')).toHaveCount(0);
});

/**
 * AC-114: WHEN the user chooses "View marked rows", THE SYSTEM SHALL show the
 * underlying rows behind the marked items, state the total number of rows,
 * and offer an export of them (direction.md rule 53).
 * `Fails when: the rows shown do not match the marking, or the total is absent.`
 * AC-239: WHEN the user chooses View underlying rows on a chart tile with
 * nothing marked, THE SYSTEM SHALL show the rows behind the whole tile, as its
 * query ungrouped with its filters, and state the total number of rows.
 * `Fails when: the rows differ from the tile's query ungrouped, or the total
 * is absent.`
 *
 * 240 orders, 80 of each status (infra/sample-db/init.sql): shipped marked,
 * the rows are all shipped and there are 80 of them; nothing marked, all 240.
 */
test('View marked rows shows the marked rows and their total, exports them, and with nothing marked the whole tile’s', async ({
  page,
  request,
}) => {
  const { id, title } = await markingDashboard(request);
  await open(page, id, title);
  const status = tile(page, 'tile-status');
  const menu = async () => {
    await status.getByRole('button', { name: /^Actions for / }).click();
    return status.getByRole('list', { name: /^Actions for / });
  };

  // Nothing marked: the whole tile's rows.
  await (await menu()).getByRole('button', { name: 'View underlying rows' }).click();
  let dialog = page.getByRole('dialog', { name: 'Underlying rows: By status' });
  await expect(dialog.getByTestId('rows-count')).toHaveText('Showing 100 of 240 rows');
  await dialog.getByRole('button', { name: 'Close' }).click();

  // Shipped marked: only shipped rows, and 80 of them.
  await clickBar(page, status, 'shipped');
  const listed = await menu();
  // Offered in place of View underlying rows while something is marked.
  await expect(listed.getByRole('button', { name: 'View underlying rows' })).toHaveCount(0);
  await listed
    .getByRole('group', { name: /marked$/ })
    .getByRole('button', { name: 'View marked rows' })
    .click();
  dialog = page.getByRole('dialog', { name: 'Marked rows: By status' });
  await expect(dialog.getByTestId('rows-count')).toHaveText('Showing 80 of 80 rows');
  const statuses = await dialog
    .locator('tbody tr')
    .evaluateAll((rows) => rows.map((row) => row.textContent ?? ''));
  expect(statuses).toHaveLength(80);
  expect(statuses.every((text) => text.includes('shipped'))).toBe(true);

  // The export: every marked row, headed as the table is.
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    dialog.getByRole('button', { name: 'Download CSV' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('By status - marked rows.csv');
  const { readFile } = await import('node:fs/promises');
  const read = await readFile(await download.path(), 'utf8');
  // Past the byte-order mark a spreadsheet reads it as UTF-8 by.
  const text = read.charCodeAt(0) === 0xfeff ? read.slice(1) : read;
  const lines = text.trim().split('\r\n');
  expect(lines).toHaveLength(81);
  expect(lines.slice(1).every((line) => line.includes('shipped'))).toBe(true);
  // Every column the view shows, and a measure's raw number beside it (AC-171, AC-173).
  const shown = await dialog.locator('th').allTextContents();
  expect((lines[0] ?? '').split(',').filter((head) => !head.endsWith(' (raw)'))).toEqual(shown);
  await expect(dialog.getByRole('status')).toContainText('Downloaded 80 rows');
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(dialog).toHaveCount(0);
});

/**
 * AC-102: IF a marking would exceed 1,000 items, THEN THE SYSTEM SHALL refuse
 * the additional items and explain the limit; "Mark all" SHALL be exempt
 * because it stores the tile's filter rather than a list.
 * `Fails when: a marking holds more than 1,000 enumerated items, or Mark all
 * is refused on a tile with more than 1,000 items.`
 *
 * On a tile of 1,500 bars, from a cube of the browser's own over a generated
 * series: a rectangle across all of them marks 1,000 and says why the rest
 * were not; Mark all then marks every one.
 */
test('a shape over more than 1,000 items marks 1,000 and says why, and Mark all is exempt', async ({
  page,
  request,
  browserName,
}) => {
  test.setTimeout(120_000);
  const cube = `many_${browserName}`;
  await ownCubeFile(
    request,
    cube,
    `cubes:
  - name: ${cube}
    sql: >
      SELECT n AS id, 'item ' || lpad(n::text, 4, '0') AS label
      FROM generate_series(1, 1500) AS n
    dimensions:
      - name: id
        sql: id
        type: number
        primary_key: true
      - name: label
        sql: label
        type: string
    measures:
      - name: count
        type: count
`,
  );
  const unique = `${String(Date.now())}-${String(Math.round(Math.random() * 1e6))}`;
  const title = `Many ${unique}`;
  const dashboard = (await (
    await request.post(`${API}/documents`, {
      data: { kind: 'dashboard', title, folderId: 'root' },
    })
  ).json()) as { id: string };
  const chart = (await (
    await request.post(`${API}/documents`, {
      data: { kind: 'chart', title: 'Every item', folderId: 'root' },
    })
  ).json()) as { id: string };
  await request.put(`${API}/documents/chart/${chart.id}`, {
    data: {
      version: 1,
      body: {
        schemaVersion: 1,
        title: 'Every item',
        owner: 'admin',
        localToDashboardId: dashboard.id,
        chart: {
          source: { cube },
          wells: { measures: [`${cube}.count`], dimensions: [`${cube}.label`], timeDimensions: [] },
          chartType: 'bar',
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
        folderId: 'root',
        owner: 'admin',
        settings: { width: 'fixed', interactions: { mode: 'markings' } },
        markings: [{ id: 'm1', name: 'Marking', slot: 'mk1', isDefault: true }],
        pages: [
          {
            id: 'only',
            title: 'Only',
            items: [{ id: 'tile-many', kind: 'chart', w: 12, h: 50, chartId: chart.id }],
          },
        ],
      },
    },
  });

  await page.goto(`/explore/dashboards/${dashboard.id}`);
  const many = tile(page, 'tile-many');
  const canvas = many.getByTestId('chart-canvas');
  await expect(canvas).toBeVisible();
  // Drawn: every bar is a path, so wait for well over 1,000 of them.
  await expect
    .poll(() => canvas.locator('svg path[fill]').count(), { timeout: 30_000 })
    .toBeGreaterThan(1_000);
  const box = await canvas.boundingBox();
  if (box === null) throw new Error('no canvas');

  // Across the whole plot, corner to corner.
  await page.mouse.move(box.x + 4, box.y + 4);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 4 });
  await page.mouse.move(box.x + box.width - 4, box.y + box.height - 4, { steps: 4 });
  await page.mouse.up();

  const badge = many.getByTestId('mark-badge');
  await expect(badge).toContainText('1,000 marked');
  await expect(page.getByTestId('marking-announcer')).toContainText(
    'A marking holds at most 1,000 items. 500 were not added.',
  );

  // Mark all stores the tile's filter, so the cap does not apply to it.
  await many.getByRole('button', { name: /^Actions for / }).click();
  await many
    .getByRole('list', { name: /^Actions for / })
    .getByRole('group', { name: /marked$/ })
    .getByRole('button', { name: 'Mark all' })
    .click();
  await expect(badge).toContainText('1,500 marked');
});

/**
 * T112 / AC-106: WHILE a dashboard is in edit mode, THE SYSTEM SHALL select
 * the tile on click and change no marking.
 * `Fails when: clicking a chart in edit mode changes a marking.`
 */
test('a click while editing selects the tile and leaves the marking as it was', async ({
  page,
  request,
}) => {
  const { id, title } = await markingDashboard(request);
  await open(page, id, title);
  const status = tile(page, 'tile-status');
  const category = tile(page, 'tile-category');
  await clickBar(page, status, 'shipped');
  await expect(status.getByTestId('mark-badge')).toContainText('1 marked');

  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  const bar = page.getByRole('toolbar', { name: 'Dashboard editing' });
  await expect(bar).toBeVisible();

  // Editing is arranging: a click on a bar picks the tile up, marking nothing
  // — a plain click on another bar, a Ctrl-click, a click on another tile.
  await clickBar(page, status, 'completed');
  await expect(status).toHaveAttribute('data-selected', 'true');
  await clickBar(page, status, 'completed', ['ControlOrMeta']);
  await clickBar(page, category, 'Instruments');
  await expect(category).toHaveAttribute('data-selected', 'true');
  await expect(status).not.toHaveAttribute('data-selected', /./);

  // Out of edit mode with nothing changed: the marking is the one made
  // before, holding what it held — nothing clicked since replaced or joined it.
  await bar.getByRole('button', { name: 'Discard', exact: true }).click();
  await expect(bar).toBeHidden();
  await expect(status.getByTestId('mark-badge')).toContainText('1 marked');
  const chip = page.getByTestId('mark-chip');
  await expect(chip).toContainText('shipped');
  for (const clicked of ['completed', 'Instruments']) await expect(chip).not.toContainText(clicked);
});
