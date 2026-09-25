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
  await clickBar(page, master, 'completed', ['Control']);
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
  await clickBar(page, master, 'shipped', ['Control']);
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
  await expect(marked.getByRole('button', { name: 'Unmark' })).toBeVisible();
  await expect(menu.getByRole('button').filter({ hasNotText: 'Unmark' })).toHaveText([
    'View as table',
    'View query',
    'Download CSV',
    'Edit chart',
  ]);

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
 * T112 / AC-106: WHILE a dashboard is in edit mode, THE SYSTEM SHALL select
 * the tile on click and change no marking.
 * `Fails when: a click in edit mode changes a marking.`
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
  await clickBar(page, status, 'completed', ['Control']);
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
