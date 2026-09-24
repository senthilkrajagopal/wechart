import { expect, test, type APIRequestContext, type Locator, type Page } from '@playwright/test';

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
  { twoPages = false, split = false, table = false, trellis = false, apart = false } = {},
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
            // A trellis needs its panels named: two dimensions alone become
            // an axis and a colour split, never a facet.
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
        markings: [{ id: 'm1', name: 'Marking', slot: 'mk1', isDefault: true }],
        pages: [
          {
            id: 'only',
            title: 'Only',
            items: [
              { id: 'tile-status', kind: 'chart', w: 6, h: 40, chartId: status },
              { id: 'tile-category', kind: 'chart', w: 6, h: 40, chartId: category },
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
  modifiers: ('Control' | 'Meta')[] = [],
) {
  const label = target.locator('svg text', { hasText: category }).first();
  await expect(label).toBeVisible();
  let box: Awaited<ReturnType<Locator['boundingBox']>> = null;
  await expect
    .poll(async () => {
      box = await label.boundingBox();
      return box !== null && box.width > 0;
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
  await clickBar(page, status, 'shipped', ['Control']);
  await expect(status.getByTestId('mark-badge')).toContainText('2 marked');
  await expect(page.getByTestId('mark-chip')).toContainText('completed');
  await expect(page.getByTestId('mark-chip')).toContainText('shipped');

  // The same item again takes it back off, leaving the other.
  await clickBar(page, status, 'shipped', ['Control']);
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
  await page.keyboard.down('Control');
  await split.locator('svg text', { hasText: 'Instruments' }).first().click();
  await page.keyboard.up('Control');
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

  // Unmarked, and said: silence would read as "none of it is in here".
  await expect(apart.getByTestId('not-linked')).toContainText('orders.status');
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
  const picker = sidebar.getByLabel('Marking');
  await expect(picker).toHaveValue('m1');
  await expect(picker.locator('option')).toHaveText(['(None)', 'Marking']);

  // A tile added now marks with the dashboard's default from the start.
  await sidebar.getByRole('tab', { name: 'Add' }).click();
  await sidebar.getByTestId('add-chart').click();
  await sidebar.getByRole('tab', { name: 'Properties' }).click();
  await expect(sidebar.getByLabel('Marking')).toHaveValue('m1');

  // And "(None)" is a tile that marks with nothing: chosen here, clicking in
  // it changes no marking.
  await tile(page, 'tile-status').click();
  await sidebar.getByLabel('Marking').selectOption('');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeVisible();

  await clickBar(page, tile(page, 'tile-status'), 'shipped');
  await expect(tile(page, 'tile-status').getByTestId('mark-badge')).toHaveCount(0);
});
