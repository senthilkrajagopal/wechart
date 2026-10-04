import { expect, test, type APIRequestContext, type Locator, type Page } from '@playwright/test';

import { ownCubeFile } from './model-files';
import { IN_MY_WORKSPACE } from './workspace';

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
    kpi = false,
    // The first marking's name, and the KPI tile's columns (T402's review).
    markingName = 'Marking',
    kpiColumns = 3,
  } = {},
) {
  const unique = `${String(Date.now())}-${String(Math.round(Math.random() * 1e6))}`;
  const title = `Markings ${unique}`;
  const dashboard = (await (
    await request.post(`${API}/documents`, {
      data: { kind: 'dashboard', title, ...IN_MY_WORKSPACE },
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
        data: { kind: 'chart', title: chartTitle, ...IN_MY_WORKSPACE },
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
  // A KPI in a three-column tile: the re-critique's squeezed title (T402).
  const kpiChart = kpi ? await chartOn('Order count', [], 'kpi') : undefined;
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
        ...IN_MY_WORKSPACE,
        owner: 'admin',
        settings: { width: 'fixed', interactions: { mode: 'markings' } },
        markings: [
          { id: 'm1', name: markingName, slot: 'mk1', isDefault: true },
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
              ...(kpiChart === undefined
                ? []
                : [
                    { id: 'tile-kpi', kind: 'chart', w: kpiColumns, h: 20, chartId: kpiChart },
                    // A text tile, which marks nothing.
                    { id: 'tile-notes', kind: 'markdown', w: 3, h: 20, text: 'Notes' },
                  ]),
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

/**
 * T402, AC-201 (amended 2026-09-27, the user's answer (a) to question 29):
 * THE SYSTEM SHALL show the marked-items badge whole, in a chart tile's
 * header row beside its title where the head has room, and otherwise under
 * the chart; and only on chart tiles whose marking holds something.
 * `Fails when: the badge pushes the title down, squeezes it out of view or is
 * cut short itself, or appears on a tile that does not mark or whose marking
 * is empty.`
 *
 * The re-critique's case (2026-09-25, N1): a KPI in a three-column tile,
 * marked by a bar elsewhere, drew none of its title. Here at the widths it
 * measured, 1440 and 1280.
 */
for (const width of [1440, 1280])
  test(`a marked tile keeps its title whole, the badge whole beside it or, in a narrow tile, under the chart, at ${String(width)} px`, async ({
    page,
    request,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const { id, title } = await markingDashboard(request, { kpi: true, limited: true });
    await open(page, id, title);
    const kpi = tile(page, 'tile-kpi');
    await expect(kpi.getByTestId('kpi-value')).toBeVisible();
    // An empty marking: no badge.
    await expect(kpi.getByTestId('mark-badge')).toHaveCount(0);

    await clickBar(page, tile(page, 'tile-status'), 'shipped');

    /**
     * A narrow tile (the user's choices, questions 27 (c) and 29 (a)): its
     * head is its title's, whole, and both badges go to its foot, under the
     * chart — the marking's whole ("■ Marking: 1 marked"), never cut short,
     * inside the tile.
     */
    const badge = kpi.getByTestId('mark-badge');
    await expect(badge).toHaveText('Marking: 1 marked');
    const foot = kpi.locator('.tile-foot');
    await expect(foot.getByTestId('mark-badge')).toBeVisible();
    await expect(foot.getByTestId('tile-freshness')).toBeVisible();
    await expect(kpi.locator('.tile-head').getByTestId('mark-badge')).toHaveCount(0);
    await expect(kpi.locator('.tile-head').getByTestId('tile-freshness')).toHaveCount(0);
    const heading = kpi.locator('.tile-head__title');
    await expect(heading).toHaveText('Order count');
    expect(await heading.evaluate((node) => node.scrollWidth - node.clientWidth)).toBe(0);
    await expectWholeWithin(kpi, badge);
    const [badgeBox, valueBox] = [
      await badge.boundingBox(),
      await kpi.getByTestId('kpi-value').boundingBox(),
    ];
    // Under the chart, not over it.
    expect(valueBox && badgeBox && badgeBox.y >= valueBox.y + valueBox.height).toBe(true);

    // A tile whose head has room keeps it there, beside its title, on its line.
    const wide = tile(page, 'tile-category');
    const wideBadge = wide.locator('.tile-head').getByTestId('mark-badge');
    await expect(wideBadge).toHaveText('Marking: 1 marked');
    const wideTitle = wide.locator('.tile-head__title');
    expect(await wideTitle.evaluate((node) => node.scrollWidth - node.clientWidth)).toBe(0);
    const [titleBox, sideBox] = [await wideTitle.boundingBox(), await wideBadge.boundingBox()];
    expect(titleBox && sideBox && titleBox.x + titleBox.width <= sideBox.x).toBe(true);
    expect(
      Math.abs(
        (titleBox?.y ?? 0) +
          (titleBox?.height ?? 0) / 2 -
          (sideBox?.y ?? 0) -
          (sideBox?.height ?? 0) / 2,
      ),
    ).toBeLessThan(2);

    // No badge on a tile that marks nothing: the details tile, or text.
    await expect(tile(page, 'tile-details').getByTestId('mark-badge')).toHaveCount(0);
    await expect(tile(page, 'tile-notes').getByTestId('mark-badge')).toHaveCount(0);
  });

/** Every edge of `inner` inside `outer`'s box: nothing of it cut off by the tile. */
async function expectWholeWithin(outer: Locator, inner: Locator) {
  const [box, part] = [await outer.boundingBox(), await inner.boundingBox()];
  expect(box && part).toBeTruthy();
  if (!box || !part) return;
  expect(part.x).toBeGreaterThanOrEqual(box.x - 0.5);
  expect(part.x + part.width).toBeLessThanOrEqual(box.x + box.width + 0.5);
  expect(part.y + part.height).toBeLessThanOrEqual(box.y + box.height + 0.5);
}

/**
 * T402's review: where the head's room runs out is measured, not guessed from
 * a width. With a long marking name, in a three- and a five-column tile at
 * 1440 and 1280 px, the title is never cut for the badge, and the badge is
 * whole, inside the tile: beside the title on its line, or under the chart.
 */
for (const width of [1440, 1280])
  for (const kpiColumns of [3, 5])
    test(`a long marking name never cuts the title or itself, in a ${String(kpiColumns)}-column tile at ${String(width)} px`, async ({
      page,
      request,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      const { id, title } = await markingDashboard(request, {
        kpi: true,
        limited: true,
        kpiColumns,
        markingName: 'Regional comparison',
      });
      await open(page, id, title);
      const kpi = tile(page, 'tile-kpi');
      await expect(kpi.getByTestId('kpi-value')).toBeVisible();
      await clickBar(page, tile(page, 'tile-status'), 'shipped');

      const badge = kpi.getByTestId('mark-badge');
      await expect(badge).toHaveCount(1);
      await expect(badge).toHaveText('Regional comparison: 1 marked');
      const heading = kpi.locator('.tile-head__title');
      await expect(heading).toHaveText('Order count');
      expect(await heading.evaluate((node) => node.scrollWidth - node.clientWidth)).toBe(0);
      await expectWholeWithin(kpi, badge);
      const [titleBox, badgeBox, valueBox] = [
        await heading.boundingBox(),
        await badge.boundingBox(),
        await kpi.getByTestId('kpi-value').boundingBox(),
      ];
      if (!titleBox || !badgeBox || !valueBox) throw new Error('no box');
      if ((await kpi.locator('.tile-head').getByTestId('mark-badge').count()) === 1) {
        // In the head: after the title, on its line.
        expect(titleBox.x + titleBox.width).toBeLessThanOrEqual(badgeBox.x);
        expect(
          Math.abs(titleBox.y + titleBox.height / 2 - badgeBox.y - badgeBox.height / 2),
        ).toBeLessThan(2);
      } else {
        // Under the chart.
        await expect(kpi.locator('.tile-foot').getByTestId('mark-badge')).toBeVisible();
        expect(badgeBox.y).toBeGreaterThanOrEqual(valueBox.y + valueBox.height);
      }
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
 * T631 (AC-176, AC-091; R63, the user: "Tile ⋯ menu entries"): the same
 * panel marked from the keyboard alone, through the tile's menu (Shift+F10),
 * "Mark panel ›", as a click on its header marks it.
 */
test('a trellis panel marks from the tile’s menu, by the keyboard alone (T631)', async ({
  page,
  request,
}) => {
  const { id, title } = await markingDashboard(request, { trellis: true });
  await open(page, id, title);
  const panels = tile(page, 'tile-trellis');
  await expect(panels.getByTestId('chart-canvas')).toBeVisible();
  await panels.focus();
  await page.keyboard.press('Shift+F10');
  const menu = page.getByRole('menu', { name: /^Actions for / });
  await expect(menu.getByRole('menuitem').first()).toBeFocused();
  const markPanel = menu.getByRole('menuitem', { name: /^Mark panel/ });
  for (let step = 0; step < 30; step += 1) {
    if (await markPanel.evaluate((element) => element === document.activeElement)) break;
    await page.keyboard.press('ArrowDown');
  }
  await expect(markPanel).toBeFocused();
  await page.keyboard.press('ArrowRight');
  const components = page
    .getByRole('menu', { name: /^Mark panel/ })
    .getByRole('menuitem', { name: 'Components', exact: true });
  for (let step = 0; step < 30; step += 1) {
    if (await components.evaluate((element) => element === document.activeElement)) break;
    await page.keyboard.press('ArrowDown');
  }
  await expect(components).toBeFocused();
  await page.keyboard.press('Enter');

  // As the header's click: the panel's category, the other panel faded.
  await expect(panels.getByTestId('mark-badge')).toContainText('1 marked');
  await expect(page.getByTestId('mark-chip')).toContainText('Components');
  await expect
    .poll(async () => (await opacities(panels)).filter((value) => value < 1).length)
    .toBeGreaterThan(0);
});

/**
 * T632 (AC-091): a header marks its own panel once a filter has left out the
 * panels before it. The click carries the header's place among the panels
 * drawn, which was read against the chart as saved, so it marked whichever
 * panel came first there.
 */
test('a trellis header marks its own panel once a filter has dropped the panels before it (T632)', async ({
  page,
  request,
}) => {
  const { id, title } = await markingDashboard(request, { trellis: true });
  await open(page, id, title);
  const panels = tile(page, 'tile-trellis');
  const category = tile(page, 'tile-category');
  await expect(panels.getByTestId('chart-canvas')).toBeVisible();
  // The first panel as saved: the category of the trellis's first row.
  const toggle = panels.getByTestId('toggle-table-view');
  await toggle.click();
  const firstRow = await panels.getByTestId('table-row').first().innerText();
  await toggle.click();
  await expect(panels.getByTestId('chart-canvas')).toBeVisible();
  const chosen = ['Components', 'Instruments'].find((name) => !firstRow.includes(name));
  const first = ['Components', 'Instruments'].find((name) => firstRow.includes(name));
  expect(chosen, `a category other than the first panel's, in ${firstRow}`).toBeDefined();
  const headerOf = (name: string) =>
    panels.locator('svg text', { hasText: new RegExp(`^${name}$`) });

  // Filtered to the one category: the trellis draws its panel alone, first.
  await clickBar(page, category, chosen ?? '');
  await category.getByRole('button', { name: /^Actions for / }).click();
  await category
    .getByRole('menu', { name: /^Actions for / })
    .getByRole('group', { name: /marked$/ })
    .getByRole('menuitem', { name: 'Filter to marked' })
    .click();
  await expect(page.getByTestId('mark-filter-chip')).toContainText(chosen ?? '');
  await expect(headerOf(first ?? '')).toHaveCount(0);
  const header = headerOf(chosen ?? '').first();
  await expect(header).toBeVisible();
  await header.click();

  await expect(panels.getByTestId('mark-badge')).toContainText('1 marked');
  await expect(page.getByTestId('mark-chip')).toContainText(chosen ?? '');
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
 * T405 (AC-176; T307's fourth pointer-only action): the same rows marked
 * from the keyboard. From the table's region the arrows take focus to a row
 * and move it, marking nothing; Space marks it, and Shift and Space the range
 * from the anchor. The row the keyboard is on is ringed in the accent.
 */
test('a table’s rows mark from the keyboard: arrows move, Space marks, Shift and Space extend', async ({
  page,
  request,
}) => {
  const { id, title } = await markingDashboard(request, { table: true });
  await open(page, id, title);
  const table = tile(page, 'tile-table');
  const rows = table.getByTestId('table-row');
  await expect(rows.first()).toBeVisible();

  const region = table.getByTestId('data-table');
  await region.focus();
  await page.keyboard.press('ArrowDown');
  await expect(rows.nth(0)).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(rows.nth(1)).toBeFocused();
  await expect(table.getByTestId('mark-badge')).toHaveCount(0);
  // Its ring: 2 px in the accent, not a marking's 3 px rule in its ink.
  expect(
    await rows.nth(1).evaluate((row) => {
      const style = getComputedStyle(row);
      const probe = document.createElement('span');
      probe.style.color = 'var(--wc-accent)';
      document.body.append(probe);
      const accent = getComputedStyle(probe).color;
      probe.remove();
      return [style.outlineStyle, style.outlineWidth, style.outlineColor === accent];
    }),
  ).toEqual(['solid', '2px', true]);

  await page.keyboard.press('Space');
  await expect(table.getByTestId('mark-badge')).toContainText('1 marked');
  await expect(rows.nth(1)).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Shift+Space');
  await expect(table.getByTestId('mark-badge')).toContainText('3 marked');
  await expect(rows.nth(2)).toHaveAttribute('aria-selected', 'true');
  await expect(rows.nth(0)).toHaveAttribute('aria-selected', 'false');

  // End and Home reach rows outside the drawn window, scrolled to and focused
  // (T405's review): focus never falls to the page.
  const count = Number(await region.locator('table').getAttribute('aria-rowcount'));
  await page.keyboard.press('End');
  await expect(table.locator(`tr[aria-rowindex="${String(count + 1)}"]`)).toBeFocused();
  await page.keyboard.press('Home');
  await expect(table.locator('tr[aria-rowindex="2"]')).toBeFocused();
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
  // Waiting, it has no rows of its own to show (T120's review).
  await details.getByRole('button', { name: /^Actions for / }).click();
  const waitingMenu = details.getByRole('menu', { name: /^Actions for / });
  await expect(waitingMenu.getByRole('menuitem', { name: 'View query' })).toBeVisible();
  await expect(waitingMenu.getByRole('menuitem', { name: 'View underlying rows' })).toHaveCount(0);
  await page.keyboard.press('Escape');

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
/**
 * T131 / AC-125: THE SYSTEM SHALL save marking definitions — names, colours,
 * the default, which tile marks with which, and the limits — with the
 * dashboard, and never the marked items (direction.md rule 54).
 * `Fails when: reopening a saved dashboard restores marked items.`
 * T130 / AC-124: WHEN a dashboard is opened without a bookmark or link
 * parameters, THE SYSTEM SHALL open it with no marks.
 * `Fails when: a dashboard opens with marks the author left behind.`
 *
 * Saved with something marked: the store has the definitions and not the
 * marked value, and the dashboard reopens with them and with nothing marked.
 */
test('a dashboard saved with marks on keeps its marking definitions, never its marks, and opens unmarked', async ({
  page,
  request,
}) => {
  const { id, title } = await markingDashboard(request, { limited: true });
  await open(page, id, title);
  const status = tile(page, 'tile-status');
  await clickBar(page, status, 'shipped');
  await expect(status.getByTestId('mark-badge')).toContainText('1 marked');

  const settings = async () => {
    await page.getByRole('button', { name: 'Dashboard settings' }).click();
    await page
      .getByRole('navigation', { name: 'Settings sections' })
      .locator('[data-section="Markings"]')
      .click();
    const panel = page.getByRole('region', { name: 'Markings settings' });
    return {
      panel,
      markings: panel.getByRole('table', { name: 'Markings', exact: true }),
      tiles: panel.getByRole('table', { name: 'Tiles and markings' }),
    };
  };
  // A second marking, its own colour and the default, By category marking
  // with it and the details tile limited by it — saved with shipped marked.
  let shown = await settings();
  await shown.panel.getByRole('button', { name: '+ New marking' }).click();
  const region = shown.markings.getByRole('row').nth(2);
  await region.getByRole('textbox', { name: 'Name of marking 2' }).fill('Region');
  await region.getByRole('radio', { name: 'Colour 3' }).click();
  await region.getByRole('radio', { name: 'Default marking' }).click();
  await shown.tiles.getByRole('combobox', { name: 'Marking for By category' }).selectOption({
    label: 'Region (default)',
  });
  await shown.tiles.getByRole('checkbox', { name: 'Details by status limited by Region' }).check();
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByTestId('dashboard-settings')).toHaveCount(0);

  // Stored: every definition, and not the marked value.
  const stored = JSON.stringify(await (await request.get(`/api/documents/dashboard/${id}`)).json());
  expect(stored).toMatch(
    /"name":"Region","slot":"mk3","isDefault":true|"isDefault":true[^}]*"name":"Region"/,
  );
  expect(stored).toContain('"limitedBy":[');
  expect(stored).not.toContain('shipped');

  // Reopened: nothing marked — no chip, no badge, every bar solid — and the
  // definitions as saved.
  await page.reload();
  await expect(status.getByTestId('chart-canvas')).toBeVisible();
  await expect(page.getByTestId('mark-chip')).toHaveCount(0);
  await expect(status.getByTestId('mark-badge')).toHaveCount(0);
  expect((await opacities(status)).every((value) => value === 1)).toBe(true);
  shown = await settings();
  const again = shown.markings.getByRole('row').nth(2);
  await expect(again.getByRole('textbox', { name: 'Name of marking 2' })).toHaveValue('Region');
  await expect(again.getByRole('radio', { name: 'Colour 3' })).toBeChecked();
  await expect(again.getByRole('radio', { name: 'Default marking' })).toBeChecked();
  await expect(
    shown.tiles
      .getByRole('combobox', { name: 'Marking for By category' })
      .locator('option:checked'),
  ).toHaveText('Region (default)');
  await expect(
    shown.tiles.getByRole('checkbox', { name: 'Details by status limited by Region' }),
  ).toBeChecked();
});

/**
 * T127 / AC-121: WHEN the user saves a bookmark, THE SYSTEM SHALL store the
 * page tab, the filter values and the current marks under a name the user
 * gives.
 * `Fails when: applying the bookmark restores a different tab, filter value or
 * mark set.`
 *
 * T128 / AC-122: WHEN the user applies a bookmark, THE SYSTEM SHALL restore
 * that state without changing the dashboard's saved definition.
 * `Fails when: applying a bookmark modifies the dashboard for other users.`
 *
 * Saved on the second page tab, with a filter set and a bar marked; applied to
 * the dashboard opened afresh — first tab, no filter, nothing marked — which
 * the stored dashboard reads the same before and after.
 */
test('a bookmark keeps the page tab, the filters’ values and the marks, and restores them, leaving the dashboard as it was', async ({
  page,
  request,
}) => {
  const { id, title } = await markingDashboard(request, { twoPages: true, limited: true });
  const stored = async () =>
    (await (await request.get(`${API}/documents/dashboard/${id}`)).json()) as unknown;
  const before = await stored();
  const filters = [
    {
      id: 'f-status',
      member: 'orders.status',
      value: { kind: 'values', values: ['shipped', 'completed'] },
    },
  ];
  const inUrl = () => {
    const raw = new URL(page.url()).searchParams.get('filters');
    return raw === null ? null : (JSON.parse(raw) as unknown);
  };

  await page.goto(
    `/explore/dashboards/${id}?filters=${encodeURIComponent(JSON.stringify(filters))}`,
  );
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  await clickBar(page, tile(page, 'tile-status'), 'shipped');
  await expect(tile(page, 'tile-status').getByTestId('mark-badge')).toContainText('1 marked');
  await page.getByRole('tab', { name: 'Second' }).click();
  await expect(tile(page, 'tile-elsewhere').getByTestId('mark-badge')).toContainText('1 marked');

  // The Bookmarks popover (T367): Mine, then Shared, and Save bookmark….
  await page.getByRole('button', { name: 'Bookmarks' }).click();
  await page
    .getByRole('dialog', { name: 'Bookmarks' })
    .getByRole('button', { name: 'Save bookmark…' })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Save a bookmark' });
  await dialog.getByRole('textbox', { name: 'Name' }).fill('Shipped, on Second');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('status').filter({ hasText: 'Saved the bookmark' })).toHaveText(
    'Saved the bookmark “Shipped, on Second”.',
  );

  // Afresh: the first page tab, no filter, nothing marked (AC-124).
  await page.goto(`/explore/dashboards/${id}`);
  await expect(page.getByRole('tab', { name: 'Only', selected: true })).toBeVisible();
  await expect(tile(page, 'tile-status').getByTestId('chart-canvas')).toBeVisible();
  await expect(page.getByTestId('mark-chip')).toHaveCount(0);
  expect(inUrl()).toEqual(null);

  await page.getByRole('button', { name: 'Bookmarks' }).click();
  await page
    .getByRole('dialog', { name: 'Bookmarks' })
    .getByRole('list', { name: 'Mine' })
    .getByRole('button', { name: 'Shipped, on Second', exact: true })
    .click();

  // Its page tab, its marks there and on the other tab, its filter's values.
  await expect(page.getByRole('tab', { name: 'Second', selected: true })).toBeVisible();
  await expect(tile(page, 'tile-elsewhere').getByTestId('mark-badge')).toContainText('1 marked');
  await expect(page.getByTestId('mark-chip')).toContainText('shipped');
  await expect.poll(inUrl).toEqual(filters);
  await page.getByRole('tab', { name: 'Only' }).click();
  await expect(tile(page, 'tile-status').getByTestId('mark-badge')).toContainText('1 marked');

  // The dashboard, as every other reader has it, is as it was.
  expect(await stored()).toEqual(before);
});

/**
 * T129 / AC-123: WHEN the user copies a link with marks, THE SYSTEM SHALL
 * produce a URL that reproduces the current filters and marks when opened.
 * `Fails when: opening the link produces different marks or filters.`
 *
 * Copied from the marking's chip, as the prototype has it, and recorded as the
 * app hands it to the clipboard (as the Copy test does); opened in the same
 * browser afresh.
 */
test('Copy link with marks gives a URL that opens the dashboard with the same filters, marks and page tab', async ({
  page,
  request,
}) => {
  await page.addInitScript(() => {
    const texts: string[] = [];
    Object.assign(window, { __texts: texts });
    const { writeText } = Clipboard.prototype;
    Clipboard.prototype.writeText = function (this: Clipboard, text: string) {
      texts.push(text);
      return writeText.call(this, text);
    };
  });
  const { id, title } = await markingDashboard(request, { twoPages: true, limited: true });
  const filters = [
    { id: 'f-status', member: 'orders.status', value: { kind: 'values', values: ['shipped'] } },
  ];
  const param = (key: string) => {
    const raw = new URL(page.url()).searchParams.get(key);
    return raw === null ? null : (JSON.parse(raw) as unknown);
  };

  await page.goto(
    `/explore/dashboards/${id}?filters=${encodeURIComponent(JSON.stringify(filters))}`,
  );
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  await clickBar(page, tile(page, 'tile-status'), 'shipped');
  await clickBar(page, tile(page, 'tile-status'), 'completed', ['ControlOrMeta']);
  await expect(tile(page, 'tile-status').getByTestId('mark-badge')).toContainText('2 marked');
  await page.getByRole('tab', { name: 'Second' }).click();

  await page.getByRole('button', { name: 'Marking menu' }).click();
  await page.getByRole('menuitem', { name: 'Copy link with marks' }).click();
  await expect(page.getByTestId('link-note')).toHaveText(
    'Copied a link to this view, with its marks.',
  );
  const copied = await page.evaluate(() => (window as unknown as { __texts: string[] }).__texts);
  expect(copied).toHaveLength(1);
  const link = new URL(copied[0] ?? '');
  expect(link.pathname).toBe(`/explore/dashboards/${id}`);

  // Afresh, then the link.
  await page.goto(`/explore/dashboards/${id}`);
  await expect(page.getByRole('tab', { name: 'Only', selected: true })).toBeVisible();
  await expect(page.getByTestId('mark-chip')).toHaveCount(0);
  await page.goto(`${link.pathname}${link.search}`);

  await expect(page.getByRole('tab', { name: 'Second', selected: true })).toBeVisible();
  await expect(tile(page, 'tile-elsewhere').getByTestId('mark-badge')).toContainText('2 marked');
  await expect(page.getByTestId('mark-chip')).toContainText('shipped, completed');
  await expect.poll(() => param('filters')).toEqual(filters);
  // Taken: the view leaves the address, and the filters stay in it (AC-081).
  await expect.poll(() => param('view')).toBeNull();
  await page.getByRole('tab', { name: 'Only' }).click();
  await expect(tile(page, 'tile-status').getByTestId('mark-badge')).toContainText('2 marked');
});

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
 * SYSTEM SHALL offer View as table, View query, Export and Edit chart, and,
 * while the dashboard is in Markings mode, the marked-rows actions headed by
 * the tile's marking and its count. (Copy, T271, sits beside Export.)
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
    return status.getByRole('menu', { name: 'Actions for By status' });
  };
  let menu = await openMenu();
  // The marked-rows group first, headed by the tile's marking, what it holds
  // and how many of the tile's items (AC-247).
  const marked = menu.getByRole('group', {
    name: 'Marking · Orders Status: shipped · 1 of 3 marked',
  });
  // Filter to and out of marked first, as the prototype's group (T119, AC-113);
  // Drill by after View marked rows, as the context-menu mockup has it (T270).
  await expect(marked.getByRole('menuitem')).toHaveText([
    'Filter to marked',
    'Filter out marked',
    'View marked rows',
    'Drill by ›',
    'Invert marking',
    'Mark all',
    'Unmark',
    'Create details tile',
  ]);
  await expect(
    menu.getByRole('menuitem').filter({
      hasNotText:
        /^(Filter to marked|Filter out marked|View marked rows|Drill by ›|Invert marking|Mark all|Unmark|Create details tile)$/,
    }),
    // Export holds the CSV now, with the images (T272, AC-244).
  ).toHaveText([
    'View as table',
    'View query',
    /^Copy/,
    /^Export/,
    'Edit chart',
    // How fresh its answer is, last (T273, AC-245).
    /^Data as of \d/,
  ]);

  // View as table: the tile shows its rows.
  await menu.getByRole('menuitem', { name: 'View as table' }).click();
  await expect(status.getByRole('table')).toBeVisible();

  // View query: the Cube query, and the SQL it runs.
  menu = await openMenu();
  await menu.getByRole('menuitem', { name: 'View query' }).click();
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
  await menu.getByRole('menuitem', { name: 'Unmark' }).click();
  await expect(status.getByTestId('mark-badge')).toHaveCount(0);
  await expect(page.getByTestId('marking-announcer')).toContainText('Marking cleared');

  // Edit chart opens the editor on it.
  menu = await openMenu();
  await menu.getByRole('menuitem', { name: 'Edit chart' }).click();
  await expect(page.getByRole('heading', { name: 'Chart editor' })).toBeVisible();
});

/**
 * T266 / AC-246: WHEN the user right-clicks a chart tile's plot, or presses
 * Shift+F10 or the Menu key on a focused chart tile, THE SYSTEM SHALL open
 * the tile's menu at the pointer or at the tile, and the browser's own menu
 * SHALL not open there.
 * `Fails when: the browser's context menu opens instead, the keys do
 * nothing, or a right-click changes a marking.`
 *
 * A headless browser draws no native menu, so its suppression is read as
 * the event's `defaultPrevented` (research/context-menu-and-submenus.md §7).
 */
test('a right-click on the chart, Shift+F10 or the Menu key opens the tile’s menu, and marks nothing', async ({
  page,
  request,
}) => {
  const { id, title } = await markingDashboard(request);
  await open(page, id, title);
  const status = tile(page, 'tile-status');
  await clickBar(page, status, 'shipped');
  const badge = status.getByTestId('mark-badge');
  await expect(badge).toContainText('1 marked');
  await page.evaluate(() => {
    const seen: boolean[] = [];
    const keys: boolean[] = [];
    Object.assign(window, { __menus: seen, __keys: keys });
    document.addEventListener('contextmenu', (event) => seen.push(event.defaultPrevented));
    // Each menu key's own default prevented too, so no browser makes it a
    // `contextmenu` of its own (research §4).
    document.addEventListener('keydown', (event) => {
      if ((event.key === 'F10' && event.shiftKey) || event.key === 'ContextMenu')
        keys.push(event.defaultPrevented);
    });
  });

  // A right-click on another bar: the menu at the pointer, the marking as it was.
  const label = await status.locator('svg text', { hasText: 'completed' }).first().boundingBox();
  if (label === null) throw new Error('no label');
  const at = { x: label.x + label.width / 2, y: label.y - 10 };
  await page.mouse.click(at.x, at.y, { button: 'right' });
  const menu = status.getByRole('menu', { name: 'Actions for By status' });
  await expect(menu).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __menus: boolean[] }).__menus))
    .toEqual([true]);
  const box = await menu.locator('xpath=..').boundingBox();
  if (box === null) throw new Error('no menu');
  // At the pointer: its corner there, or turned back from the window's edge.
  expect(Math.min(Math.abs(box.x - at.x), Math.abs(box.x + box.width - at.x))).toBeLessThan(40);
  expect(Math.min(Math.abs(box.y - at.y), Math.abs(box.y + box.height - at.y))).toBeLessThan(40);
  await expect(menu.getByRole('menuitem').first()).toBeFocused();
  await expect(badge).toContainText('1 marked');
  await expect(page.getByTestId('mark-chip')).not.toContainText('completed');
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);

  // From the focused tile: Shift+F10, then the Menu key; Escape comes back to it.
  for (const key of ['Shift+F10', 'ContextMenu']) {
    await status.focus();
    await page.keyboard.press(key);
    await expect(menu).toBeVisible();
    await expect(menu.getByRole('menuitem').first()).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(status).toBeFocused();
  }
  expect(await page.evaluate(() => (window as unknown as { __keys: boolean[] }).__keys)).toEqual([
    true,
    true,
  ]);

  /**
   * The `contextmenu` a keyboard makes (T266's review): VoiceOver's
   * VO+Shift+M fires one at the focused tile, and Chromium on Windows fires
   * the Menu key's on its keyup — at the item the menu has just focused.
   * Neither opens the browser's menu. Playwright makes none from a key
   * (research §7), so each is dispatched where the browser would.
   */
  const keyboardMenu = (target: Locator) =>
    target.evaluate((node) => {
      const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
      node.dispatchEvent(event);
      return event.defaultPrevented;
    });
  await status.focus();
  expect(await keyboardMenu(status)).toBe(true);
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('menuitem').first()).toBeFocused();
  expect(await keyboardMenu(menu.getByRole('menuitem').first())).toBe(true);
  await expect(menu).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(badge).toContainText('1 marked');
});

/**
 * T267 / AC-247: WHILE the tile's marking holds items, THE SYSTEM SHALL head
 * the tile's menu with the marking's name, the marked values by their
 * members' titles, and the count marked out of the tile's items.
 * `Fails when: the heading omits the values, or either count differs from the
 * marked items or the tile's items.`
 *
 * The status tile draws three statuses (infra/sample-db/init.sql): two marked
 * are "2 of 3", named by the member's title; Mark all makes it "3 of 3".
 */
test('the tile menu is headed by its marking, the marked values by title, and how many of the tile’s items', async ({
  page,
  request,
}) => {
  const { id, title } = await markingDashboard(request);
  await open(page, id, title);
  const status = tile(page, 'tile-status');
  await clickBar(page, status, 'shipped');
  await clickBar(page, status, 'completed', ['ControlOrMeta']);
  await expect(status.getByTestId('mark-badge')).toContainText('2 marked');

  const trigger = status.getByRole('button', { name: 'Actions for By status' });
  await trigger.click();
  const menu = status.getByRole('menu', { name: 'Actions for By status' });
  const heading = status.locator('.tile-menu__heading');
  await expect(heading).toHaveText('● Marking · Orders Status: shipped, completed · 2 of 3 marked');
  // It names the group it heads.
  await expect(
    menu.getByRole('group', {
      name: 'Marking · Orders Status: shipped, completed · 2 of 3 marked',
    }),
  ).toBeVisible();

  await menu.getByRole('menuitem', { name: 'Mark all' }).click();
  await trigger.click();
  await expect(heading).toContainText('3 of 3 marked');
  await page.keyboard.press('Escape');

  /**
   * T267's review: on a tile the marking holds none of the items of — By
   * category, while statuses are marked — the heading counts the tile's own,
   * none, as the tile draws them all faded; and the marking's actions stay
   * there to take, since they act on the marking, not on this tile.
   */
  await status.getByRole('button', { name: 'Actions for By status' }).click();
  await menu.getByRole('menuitem', { name: 'Unmark' }).click();
  await clickBar(page, status, 'shipped');
  const category = tile(page, 'tile-category');
  await category.getByRole('button', { name: /^Actions for / }).click();
  const other = category.getByRole('menu', { name: /^Actions for / });
  await expect(category.locator('.tile-menu__heading')).toHaveText(
    /^● Marking · Orders Status: shipped · 0 of \d+ marked$/,
  );
  for (const name of ['Unmark', 'View marked rows'])
    await expect(other.getByRole('menuitem', { name })).not.toHaveAttribute(
      'aria-disabled',
      'true',
    );
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
  const menu = status.getByRole('menu', { name: 'Actions for By status' });
  await expect(menu.getByRole('menuitem', { name: 'Export' })).toBeVisible();
  await expect(menu.getByRole('group')).toHaveCount(0);
  await expect(menu.getByRole('menuitem', { name: 'Unmark' })).toHaveCount(0);
});

/**
 * T219 / AC-201 (amended 2026-09-27, T402): THE SYSTEM SHALL show the
 * marked-items badge whole, in a chart tile's header row beside its title
 * where the head has room, and otherwise under the chart, and only on chart
 * tiles whose marking holds something.
 * `Fails when: the badge pushes the title down, squeezes it out of view or is
 * cut short itself, or appears on a tile that does not mark or whose marking
 * is empty.`
 *
 * The seeded tile's head, at 1280 px, has no room for "Orders by category and
 * status" beside the badge, the freshness badge and "Table view": the badge
 * goes under the chart and the title stays whole (T402).
 */
test('the marked badge never pushes or cuts the title, and never sits on a text tile', async ({
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
  // The title where it was, and whole; the badge whole, inside the tile.
  expect(await titleInTile()).toBeCloseTo(before, 0);
  expect(await heading.evaluate((node) => node.scrollWidth - node.clientWidth)).toBe(0);
  await expect(badge).toHaveCount(1);
  await expectWholeWithin(status, badge);
  const badgeBox = await badge.boundingBox();
  const headingBox = await heading.boundingBox();
  if ((await status.locator('.tile-head').getByTestId('mark-badge').count()) === 1)
    // Beside the title, on its line.
    expect(
      Math.abs(
        (badgeBox?.y ?? 0) +
          (badgeBox?.height ?? 0) / 2 -
          ((headingBox?.y ?? 0) + (headingBox?.height ?? 0) / 2),
      ),
    ).toBeLessThan(6);
  // Or under the chart.
  else await expect(status.locator('.tile-foot').getByTestId('mark-badge')).toBeVisible();
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
      .getByRole('menu', { name: /^Actions for / })
      .getByRole('group', { name: /marked$/ });
    await group.getByRole('menuitem', { name }).click();
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
      .getByRole('menu', { name: /^Actions for / })
      .getByRole('group', { name: /marked$/ });
  };
  // By status, unfiltered, marked whole: the details tile shows every status.
  await (
    await group(tile(page, 'tile-status'))
  )
    .getByRole('menuitem', { name: 'Mark all' })
    .click();
  await expect(details.getByTestId('chart-canvas')).toBeVisible();
  await expect
    .poll(async () => (await axisLabels(details)).filter((text) => statuses.includes(text)))
    .toEqual(statuses);

  // A stacked bar's click marks its series, not its categories: not offered there.
  const split = await group(tile(page, 'tile-split'));
  await expect(split.getByRole('menuitem', { name: 'Unmark' })).toBeVisible();
  await expect(split.getByRole('menuitem', { name: 'Mark all' })).toHaveCount(0);
  await expect(split.getByRole('menuitem', { name: 'Invert marking' })).toHaveCount(0);
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
    .getByRole('menu', { name: /^Actions for / })
    .getByRole('group', { name: /marked$/ })
    .getByRole('menuitem', { name: 'Create details tile' })
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
      .getByRole('menu', { name: /^Actions for / })
      .getByRole('group', { name: /marked$/ })
      .getByRole('menuitem', { name })
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
    .getByRole('menu', { name: /^Actions for / })
    .getByRole('menuitem', { name: 'View query' })
    .click();
  await expect(page.getByRole('dialog')).toContainText('"equals"');
  await expect(page.getByRole('dialog')).toContainText('"shipped"');
  await page.keyboard.press('Escape');

  // With nothing marked, both actions say why they cannot run.
  await status.getByRole('button', { name: /^Actions for / }).click();
  const group = status
    .getByRole('menu', { name: /^Actions for / })
    .getByRole('group', { name: /marked$/ });
  await expect(group.getByRole('menuitem', { name: 'Filter to marked' })).toHaveAttribute(
    'aria-disabled',
    'true',
  );
  // Its reason as its description, which a keyboard reaches (T266, T182).
  await expect(
    group.getByRole('menuitem', { name: 'Filter out marked' }),
  ).toHaveAccessibleDescription('Nothing is marked.');
  await page.keyboard.press('Escape');

  // Removed from its chip: every status again, and the keyboard is left on the
  // filter bar rather than nowhere (T120's review).
  await chip.getByRole('button', { name: /^Remove: / }).click();
  await expect(chip).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Filters' })).toBeFocused();
  await expect.poll(() => labels(status)).toEqual(['completed', 'processing', 'shipped']);

  // Out of marked: every status but shipped.
  await clickBar(page, status, 'shipped');
  await act('Filter out marked');
  await expect(chip).toContainText('Filtered out Marking');
  await expect.poll(() => labels(status)).toEqual(['completed', 'processing']);
  await expect(status.getByTestId('mark-badge')).toHaveCount(0);
});

/**
 * T269 / AC-240: WHILE the details panel is on, WHEN the marking changes, THE
 * SYSTEM SHALL show the rows behind the newly marked items and their total,
 * and the panel SHALL be turned on and off both from the tile's menu and from
 * the panel itself. `Fails when: the panel shows rows of a previous marking
 * after the change, or either control does not toggle it.`
 *
 * 240 orders, 80 of each status (infra/sample-db/init.sql).
 */
test('the details panel follows the marking, and is turned off from the menu and from itself', async ({
  page,
  request,
}) => {
  const { id, title } = await markingDashboard(request);
  await open(page, id, title);
  const status = tile(page, 'tile-status');
  const detailsItem = async () => {
    await status.getByRole('button', { name: /^Actions for / }).click();
    return status
      .getByRole('menu', { name: /^Actions for / })
      .getByRole('menuitemcheckbox', { name: 'Details panel' });
  };
  const panel = page.getByRole('region', { name: 'Marked rows: By status' });
  const statuses = () =>
    panel.locator('tbody tr').evaluateAll((rows) => rows.map((row) => row.textContent ?? ''));

  // On from the menu, with nothing marked yet: it says so, beside the tiles.
  const first = await detailsItem();
  await expect(first).toHaveAttribute('aria-checked', 'false');
  await first.click();
  await expect(panel).toContainText('Nothing is marked.');
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // Shipped marked: its 80 rows; then processing: its own 80, none shipped.
  // The canvas gives the panel room — the more as its rows come — so the
  // tile's foot, where its bars' labels are, is scrolled to, as a user would.
  const inView = () =>
    status.evaluate((element) => {
      element.scrollIntoView({ block: 'end' });
    });
  await inView();
  await clickBar(page, status, 'shipped');
  await expect(panel.getByTestId('rows-count')).toHaveText('Showing 80 of 80 rows');
  expect((await statuses()).every((text) => text.includes('shipped'))).toBe(true);
  await inView();
  await clickBar(page, status, 'processing');
  await expect(panel.getByTestId('rows-count')).toHaveText('Showing 80 of 80 rows');
  // All 80 of them processing: an empty table, still loading, would not do
  // (T269's review).
  await expect
    .poll(async () => {
      const now = await statuses();
      return now.length === 80 && now.every((text) => text.includes('processing'));
    })
    .toBe(true);
  expect((await statuses()).some((text) => text.includes('shipped'))).toBe(false);

  // Off from its own switch.
  await panel.getByRole('switch', { name: 'Details panel: follow the marking' }).click();
  await expect(panel).toHaveCount(0);

  // On and off again from the menu, which shows it checked while on.
  await (await detailsItem()).click();
  await expect(panel.getByTestId('rows-count')).toHaveText('Showing 80 of 80 rows');
  const item = await detailsItem();
  await expect(item).toHaveAttribute('aria-checked', 'true');
  await item.click();
  await expect(panel).toHaveCount(0);

  // And the one-off view's switch pins it open.
  await status.getByRole('button', { name: /^Actions for / }).click();
  await status
    .getByRole('menu', { name: /^Actions for / })
    .getByRole('group', { name: /marked$/ })
    .getByRole('menuitem', { name: 'View marked rows' })
    .click();
  const once = page.getByRole('dialog', { name: 'Marked rows: By status' });
  // Its rows in first: the dialog is centred, and grows as they come, moving
  // its switch from under a press still going on (Firefox).
  await expect(once.getByTestId('rows-count')).toHaveText('Showing 80 of 80 rows');
  await once.getByRole('switch', { name: 'Details panel: follow the marking' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(panel.getByTestId('rows-count')).toHaveText('Showing 80 of 80 rows');
});

/**
 * T270 / AC-236: WHEN the user chooses Drill by and a dimension on a chart
 * tile whose marking holds items, THE SYSTEM SHALL redraw that tile in place
 * grouped by the chosen dimension and filtered to the marked items, with a
 * breadcrumb naming the drilled items and a Back control, and SHALL leave the
 * saved chart and every other tile unchanged. `Fails when: the drilled tile's
 * rows differ from a Cube query of the chosen dimension filtered to the
 * marked items, Back does not restore the previous view, or the saved chart
 * changes.`
 * AC-237 (the options, and what they leave out) and AC-238 (the drilled
 * answer's own freshness): `Fails when: a primary key or the marked member is
 * offered, or a dimension of a cube Cube reports in another join component is
 * offered` and `a drilled view the database answered shows the parent view's
 * pre-aggregation`.
 */
test('Drill by regroups a tile’s marked items in place, with its own answer, and Back restores it', async ({
  page,
  request,
}) => {
  const { id, title } = await markingDashboard(request);
  await open(page, id, title);
  const status = tile(page, 'tile-status');
  const category = tile(page, 'tile-category');
  // The tile's saved chart, as the store has it, to compare after.
  const dashboard = JSON.stringify(
    await (await request.get(`/api/documents/dashboard/${id}`)).json(),
  );
  const statusChart =
    /"id":"tile-status"[^}]*?"chartId":"([^"]+)"/.exec(dashboard)?.[1] ??
    /"chartId":"([^"]+)"[^}]*?"id":"tile-status"/.exec(dashboard)?.[1];
  expect(statusChart).toBeDefined();
  const savedChart = () =>
    request.get(`/api/documents/chart/${statusChart ?? ''}`).then((r) => r.text());
  const savedBefore = await savedChart();
  const categoryBefore = await category.locator('svg text').allTextContents();
  await clickBar(page, status, 'shipped');

  await status.getByRole('button', { name: /^Actions for / }).click();
  const menu = status.getByRole('menu', { name: /^Actions for / });
  await menu
    .getByRole('group', { name: /marked$/ })
    .getByRole('menuitem', { name: /^Drill by/ })
    .click();
  const drillBy = page.getByRole('menu', { name: /^Drill by/ });
  await expect(drillBy).toContainText('Drill Orders Status: shipped by');
  // Never a primary key, nor the marked member itself (AC-237).
  const offered = await drillBy.getByRole('menuitem').allTextContents();
  expect(offered).not.toContain('Id');
  expect(offered).not.toContain('Status');
  // Time first, then the tile's own cube, then the cubes of its join
  // component — none of the seed's views, which report none (AC-237).
  const groups = await drillBy
    .getByRole('group')
    .evaluateAll((all) => all.map((group) => group.getAttribute('aria-label') ?? ''));
  expect(groups.length).toBeGreaterThan(0);
  expect(
    groups.every((group) => /^(Time · .+|Orders|(Customers|Products) · via join)$/.test(group)),
  ).toBe(true);
  // The seed's orders offers nothing else of its own: its key, its time and
  // the marked Status are all there is.
  const firstJoined = groups.findIndex((group) => group.endsWith(' · via join'));
  expect(groups).toContain('Products · via join');
  expect(groups.findLastIndex((group) => group.startsWith('Time · '))).toBeLessThan(firstJoined);
  await drillBy
    .getByRole('group', { name: 'Products · via join' })
    .getByRole('menuitem', { name: 'Category' })
    .click();

  // In place: the breadcrumb, and the drilled rows as a table, against Cube's own answer.
  const crumb = status.getByTestId('drill-crumb');
  await expect(crumb.getByRole('navigation', { name: 'Drilled from' })).toContainText(
    'By status›Orders Status: shipped›Category',
  );
  const asked = (await (
    await request.post('/api/load', {
      data: {
        query: {
          measures: ['orders.count'],
          dimensions: ['products.category'],
          filters: [{ member: 'orders.status', operator: 'equals', values: ['shipped'] }],
        },
      },
    })
  ).json()) as { data: Record<string, string>[]; usedPreAggregations?: Record<string, unknown> };
  const expected = asked.data
    .map(
      (row) =>
        `${row['products.category'] ?? ''}|${Number(row['orders.count']).toLocaleString('en-US')}`,
    )
    .sort();
  await status.getByRole('button', { name: /^Actions for / }).click();
  await status
    .getByRole('menu', { name: /^Actions for / })
    .getByRole('menuitem', { name: 'View as table' })
    .click();
  await expect
    .poll(async () =>
      (
        await status
          .locator('tbody tr')
          .evaluateAll((rows) =>
            rows.map((row) =>
              [...row.querySelectorAll('td')]
                .map((cell) => cell.textContent?.trim() ?? '')
                .join('|'),
            ),
          )
      ).sort(),
    )
    .toEqual(expected);

  // Its own freshness: Cube's word for the drilled question, not the tile's (AC-238).
  const accelerated = Object.keys(asked.usedPreAggregations ?? {}).length > 0;
  await expect(status.getByTestId('tile-freshness')).toHaveAttribute(
    'title',
    new RegExp(`^${accelerated ? 'Accelerated' : 'Live'}`),
  );

  // Every other tile as it was, and the saved chart untouched.
  expect(await category.locator('svg text').allTextContents()).toEqual(categoryBefore);
  expect(await savedChart()).toBe(savedBefore);

  // Headed by the model's titles, as every tile is (T270's review).
  const heads = await status.locator('thead th').allTextContents();
  expect(heads.join('|')).toContain('Category');
  expect(heads.join('|')).not.toContain('products.category');

  // Back: the tile's own rows again — its statuses — its marking still on
  // it, and the focus on its ⋯, where the drill was chosen.
  await crumb.getByRole('button', { name: '← Back' }).click();
  await expect(status.getByTestId('drill-crumb')).toHaveCount(0);
  await expect(status.getByTestId('mark-badge')).toContainText('1 marked');
  await expect
    .poll(async () => (await status.locator('tbody tr').allTextContents()).join('|'))
    .toMatch(/shipped/);
  await expect(status.getByRole('button', { name: /^Actions for / })).toBeFocused();

  // A drill is of the marking it was made from: unmarked, it is let go, and
  // no drill of what was marked is left over the tile (T270's review).
  await status.getByRole('button', { name: /^Actions for / }).click();
  await menu
    .getByRole('group', { name: /marked$/ })
    .getByRole('menuitem', { name: /^Drill by/ })
    .click();
  await page
    .getByRole('menu', { name: /^Drill by/ })
    .getByRole('group', { name: 'Products · via join' })
    .getByRole('menuitem', { name: 'Category' })
    .click();
  await expect(status.getByTestId('drill-crumb')).toBeVisible();
  await status.getByRole('button', { name: /^Actions for / }).click();
  await menu
    .getByRole('group', { name: /marked$/ })
    .getByRole('menuitem', { name: 'Unmark' })
    .click();
  await expect(status.getByTestId('drill-crumb')).toHaveCount(0);
});

/**
 * T269's review: the details panel keeps to its own switch — a one-off view
 * of rows leaves it on, and a Space in the menu leaves the focus there — and
 * to marking: gone while editing, and in cross-filter mode (AC-120).
 */
test('the details panel stays on through a one-off view, and only while marking', async ({
  page,
  request,
}) => {
  const { id, title } = await markingDashboard(request);
  await open(page, id, title);
  const status = tile(page, 'tile-status');
  const panel = page.getByRole('region', { name: 'Marked rows: By status' });
  const menu = async () => {
    await status.getByRole('button', { name: /^Actions for / }).click();
    return status.getByRole('menu', { name: /^Actions for / });
  };
  await (await menu()).getByRole('menuitemcheckbox', { name: 'Details panel' }).click();
  await status.evaluate((element) => {
    element.scrollIntoView({ block: 'end' });
  });
  await clickBar(page, status, 'shipped');
  await expect(panel.getByTestId('rows-count')).toHaveText('Showing 80 of 80 rows');

  // A one-off view of the same rows, and closed: the panel is still on.
  await (
    await menu()
  )
    .getByRole('group', { name: /marked$/ })
    .getByRole('menuitem', { name: 'View marked rows' })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Marked rows: By status' });
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(panel.getByTestId('rows-count')).toHaveText('Showing 80 of 80 rows');

  // Space on the menu's checkbox: off, and the focus still on it, in the open menu.
  const item = (await menu()).getByRole('menuitemcheckbox', { name: 'Details panel' });
  await item.focus();
  await page.keyboard.press('Space');
  await expect(panel).toHaveCount(0);
  await expect(item).toHaveAttribute('aria-checked', 'false');
  await page.waitForTimeout(100);
  await expect(item).toBeFocused();
  await page.keyboard.press('Space');
  await expect(panel).toBeVisible();
  await page.keyboard.press('Escape');

  // Not while editing: no marking there, and no menu to turn it off from.
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(panel).toHaveCount(0);
  await page.getByRole('button', { name: 'Discard' }).click();
  await expect(panel).toBeVisible();

  // Nor in cross-filter mode, which marks nothing (AC-120).
  await page.getByRole('button', { name: 'Dashboard settings' }).click();
  await page.getByRole('button', { name: /^Interactions/ }).click();
  await page.getByRole('radio', { name: /^Cross-filtering/ }).check();
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByTestId('dashboard-settings')).toHaveCount(0);
  await expect(panel).toHaveCount(0);
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
    return status.getByRole('menu', { name: /^Actions for / });
  };

  // Nothing marked: the whole tile's rows.
  await (await menu()).getByRole('menuitem', { name: 'View underlying rows' }).click();
  let dialog = page.getByRole('dialog', { name: 'Underlying rows: By status' });
  await expect(dialog.getByTestId('rows-count')).toHaveText('Showing 100 of 240 rows');
  await dialog.getByRole('button', { name: 'Close' }).click();

  // Shipped marked: only shipped rows, and 80 of them.
  await clickBar(page, status, 'shipped');
  const listed = await menu();
  // Offered in place of View underlying rows while something is marked.
  await expect(listed.getByRole('menuitem', { name: 'View underlying rows' })).toHaveCount(0);
  await listed
    .getByRole('group', { name: /marked$/ })
    .getByRole('menuitem', { name: 'View marked rows' })
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

  const marked = async (name: string) => {
    await (
      await menu()
    )
      .getByRole('group', { name: /marked$/ })
      .getByRole('menuitem', { name })
      .click();
  };
  // Mark all marks every row, so its rows are the whole tile's (T120's review).
  await marked('Mark all');
  await marked('View marked rows');
  await expect(dialog.getByTestId('rows-count')).toHaveText('Showing 100 of 240 rows');
  await dialog.getByRole('button', { name: 'Close' }).click();

  // Under a filter — here one made from a marking — the whole tile's rows are
  // the filtered ones: its query ungrouped *with its filters* (AC-239).
  await marked('Unmark');
  await clickBar(page, status, 'shipped');
  await marked('Filter to marked');
  await expect(page.getByTestId('mark-filter-chip')).toContainText('shipped');
  await (await menu()).getByRole('menuitem', { name: 'View underlying rows' }).click();
  dialog = page.getByRole('dialog', { name: 'Underlying rows: By status' });
  await expect(dialog.getByTestId('rows-count')).toHaveText('Showing 80 of 80 rows');
});

/**
 * AC-113 with AC-079 (T119's review): a filter made from a marking is a
 * dashboard filter, so a tile whose cube cannot reach the marked field is left
 * unfiltered and says so — as it does for any filter — rather than being asked
 * a query Cube would refuse, or passing for filtered.
 */
test('a filter made from a marking leaves a tile that cannot reach it unfiltered, and says so', async ({
  page,
  request,
}) => {
  const { id, title } = await markingDashboard(request, { apart: true });
  await open(page, id, title);
  const status = tile(page, 'tile-status');
  const apart = tile(page, 'tile-apart');
  await expect(apart.getByTestId('chart-canvas')).toBeVisible();

  await clickBar(page, status, 'shipped');
  await status.getByRole('button', { name: /^Actions for / }).click();
  await status
    .getByRole('menu', { name: /^Actions for / })
    .getByRole('group', { name: /marked$/ })
    .getByRole('menuitem', { name: 'Filter to marked' })
    .click();
  await expect(page.getByTestId('mark-filter-chip')).toContainText('shipped');

  await expect(apart.getByTestId('not-covered')).toContainText('Not filtered by Orders Status');
  await expect(apart.getByRole('alert')).toHaveCount(0);
  await expect(status.getByTestId('not-covered')).toHaveCount(0);
});

/**
 * T271 / AC-241, AC-242, AC-243: Copy › Marked values, Image and To
 * dashboard.
 * `Fails when: the clipboard text differs from the marked items, or has no
 * header row` (AC-241); `the clipboard holds no image, the image omits the
 * marking's drawing, …` (AC-242); `the chosen dashboard lacks the copy, the
 * copy is the source's chart rather than its own, or the source dashboard's
 * saved definition changes` (AC-243).
 *
 * What reaches the clipboard is recorded as the app hands it over — the
 * research's route (clipboard-and-image-export.md, "Reading an image back"):
 * reading the OS clipboard back is per engine, and four workers share one.
 * The wrapper calls the browser's own write at once, keeping Safari's
 * gesture rule.
 */
test('Copy puts the marked values and the chart’s image on the clipboard, and the chart on another dashboard', async ({
  page,
  request,
}) => {
  await page.addInitScript(() => {
    const texts: string[] = [];
    const images: Promise<Blob>[] = [];
    Object.assign(window, { __texts: texts, __images: images });
    const { writeText, write } = Clipboard.prototype;
    Clipboard.prototype.writeText = function (this: Clipboard, text: string) {
      texts.push(text);
      return writeText.call(this, text);
    };
    Clipboard.prototype.write = function (this: Clipboard, items: ClipboardItem[]) {
      for (const item of items)
        if (item.types.includes('image/png')) images.push(item.getType('image/png'));
      return write.call(this, items);
    };
  });
  const { id, title } = await markingDashboard(request);
  const unique = `${String(Date.now())}-${String(Math.round(Math.random() * 1e6))}`;
  const targetTitle = `Copy target ${unique}`;
  const target = (await (
    await request.post(`${API}/documents`, {
      data: { kind: 'dashboard', title: targetTitle, ...IN_MY_WORKSPACE },
    })
  ).json()) as { id: string };
  type Stored = { version: number; body: Record<string, unknown> };
  const read = async (kind: string, docId: string) =>
    (await (await request.get(`${API}/documents/${kind}/${docId}`)).json()) as Stored;
  const before = await read('dashboard', id);

  await open(page, id, title);
  const status = tile(page, 'tile-status');
  const note = status.locator('.tile-export-note');
  const copyMenu = async () => {
    await status.getByRole('button', { name: 'Actions for By status' }).click();
    await status.getByRole('menuitem', { name: 'Copy' }).click();
    return status.getByRole('menu', { name: 'Copy' });
  };
  await clickBar(page, status, 'shipped');
  await clickBar(page, status, 'completed', ['ControlOrMeta']);
  await expect(status.getByTestId('mark-badge')).toContainText('2 marked');

  // Marked values: a header of the member's title, a line per item.
  let menu = await copyMenu();
  await menu.getByRole('menuitem', { name: 'Marked values' }).click();
  await expect(note).toContainText('Copied 2 marked values.');
  expect(await page.evaluate(() => (window as unknown as { __texts: string[] }).__texts)).toEqual([
    'Orders Status\nshipped\ncompleted',
  ]);

  // Image: a PNG of the chart as drawn, the marked bars solid and the other
  // faded, at its size times the pixel ratio.
  menu = await copyMenu();
  await menu.getByRole('menuitem', { name: 'Image', exact: true }).click();
  await expect(note).toContainText('Copied the chart as an image.');
  const canvas = status.getByTestId('chart-canvas');
  const size = await canvas.evaluate((node) => ({
    width: Math.round(node.clientWidth * window.devicePixelRatio),
    height: Math.round(node.clientHeight * window.devicePixelRatio),
    ratio: window.devicePixelRatio,
  }));
  const inBar = (category: string) =>
    canvas
      .locator('svg text', { hasText: category })
      .first()
      .evaluate((text, ratio) => {
        const label = text.getBoundingClientRect();
        const box = (
          text.closest('[data-testid="chart-canvas"]') as Element
        ).getBoundingClientRect();
        return [
          Math.round((label.x + label.width / 2 - box.x) * ratio),
          Math.round((label.y - 12 - box.y) * ratio),
        ];
      }, size.ratio);
  const points = [await inBar('shipped'), await inBar('processing')];
  const image = await page.evaluate(async (at) => {
    const blob = await (window as unknown as { __images: Promise<Blob>[] }).__images[0];
    if (blob === undefined) return undefined;
    const bitmap = await createImageBitmap(blob);
    const drawing = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = drawing.getContext('2d') as OffscreenCanvasRenderingContext2D;
    context.drawImage(bitmap, 0, 0);
    return {
      type: blob.type,
      width: bitmap.width,
      height: bitmap.height,
      light: at.map(([x, y]) => {
        const [r = 0, g = 0, b = 0] = context.getImageData(x ?? 0, y ?? 0, 1, 1).data;
        return r + g + b;
      }),
    };
  }, points);
  expect(image?.type).toBe('image/png');
  expect([image?.width, image?.height]).toEqual([size.width, size.height]);
  const [marked = 0, faded = 0] = image?.light ?? [];
  expect(marked).toBeLessThan(faded);

  // After Mark all: every status the tile draws marked, each once — the two
  // clicked are in the whole tile too (T271's review).
  await status.getByRole('button', { name: 'Actions for By status' }).click();
  await status
    .getByRole('menu', { name: /^Actions for / })
    .getByRole('group', { name: /marked$/ })
    .getByRole('menuitem', { name: 'Mark all' })
    .click();
  menu = await copyMenu();
  await menu.getByRole('menuitem', { name: 'Marked values' }).click();
  await expect(note).toContainText('Copied 3 marked values.');
  const afterAll = await page.evaluate(
    () => (window as unknown as { __texts: string[] }).__texts.at(-1) ?? '',
  );
  const [head, ...values] = afterAll.split('\n');
  expect(head).toBe('Orders Status');
  expect(values.sort()).toEqual(['completed', 'processing', 'shipped']);

  // To dashboard: found by its title, and copied there as a chart of its own.
  menu = await copyMenu();
  await menu.getByRole('menuitem', { name: 'To dashboard…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Copy “By status” to a dashboard' });
  await dialog.getByLabel('Find a dashboard').fill(targetTitle);
  await dialog.getByRole('radio', { name: targetTitle }).check();
  await dialog.getByRole('button', { name: 'Copy', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText(`Copied to ${targetTitle}.`);

  const copied = await read('dashboard', target.id);
  const pages = copied.body['pages'] as { items: { kind: string; chartId?: string }[] }[];
  const copyTile = pages[0]?.items.find((item) => item.kind === 'chart');
  const sourceTile = (before.body['pages'] as { items: { id: string; chartId?: string }[] }[])
    .flatMap((each) => each.items)
    .find((item) => item.id === 'tile-status');
  expect(copyTile?.chartId).toBeDefined();
  expect(copyTile?.chartId).not.toBe(sourceTile?.chartId);
  const copyChart = await read('chart', copyTile?.chartId ?? '');
  const sourceChart = await read('chart', sourceTile?.chartId ?? '');
  expect(copyChart.body['localToDashboardId']).toBe(target.id);
  expect(copyChart.body['chart']).toEqual(sourceChart.body['chart']);
  // The source dashboard as it was saved.
  const after = await read('dashboard', id);
  expect(after.version).toBe(before.version);
  expect(after.body).toEqual(before.body);

  // And it draws there.
  await dialog.getByRole('link', { name: `Open ${targetTitle}` }).click();
  await expect(page.getByRole('heading', { name: targetTitle })).toBeVisible();
  await expect(page.getByTestId('chart-canvas')).toBeVisible();
});

/** AC-242's other half: a table is drawn as text, so it has no image to copy, and says why. */
test('Copy › Image is offered disabled on a table tile, saying why', async ({ page, request }) => {
  const { id, title } = await markingDashboard(request, { table: true });
  await open(page, id, title);
  const table = tile(page, 'tile-table');
  await table.getByRole('button', { name: /^Actions for / }).click();
  await table.getByRole('menuitem', { name: 'Copy' }).click();
  const image = table.getByRole('menu', { name: 'Copy' }).getByRole('menuitem', { name: 'Image' });
  await expect(image).toHaveAttribute('aria-disabled', 'true');
  await expect(image).toHaveAccessibleDescription(
    'A KPI, table or pivot is drawn as text, not as a chart image.',
  );
});

/**
 * T272 / AC-244: THE SYSTEM SHALL offer under a chart tile's Export the
 * tile's CSV, the marked rows' CSV while the marking holds items, and SVG and
 * PNG images of a chart ECharts draws, each downloading the chart as drawn.
 * `Fails when: one of those items is missing where it applies, or an image
 * file is not the chart as drawn.`
 *
 * The status tile draws three bars of 80 orders each (infra/sample-db/
 * init.sql), so a point just above the axis under a label is inside its bar.
 */
test('Export offers the tile’s CSV, its marked rows’ CSV while marked, and SVG and PNG of the chart as drawn', async ({
  page,
  request,
}) => {
  const { readFile } = await import('node:fs/promises');
  const { id, title } = await markingDashboard(request);
  await open(page, id, title);
  const status = tile(page, 'tile-status');
  const canvas = status.getByTestId('chart-canvas');
  const exportMenu = async () => {
    await status.getByRole('button', { name: 'Actions for By status' }).click();
    await status.getByRole('menuitem', { name: 'Export' }).click();
    return status.getByRole('menu', { name: 'Export' });
  };
  const download = async (menu: Locator, name: string) => {
    const [file] = await Promise.all([
      page.waitForEvent('download'),
      menu.getByRole('menuitem', { name, exact: true }).click(),
    ]);
    return { name: file.suggestedFilename(), path: await file.path() };
  };

  // Nothing marked: no marked rows to export.
  let menu = await exportMenu();
  await expect(menu.getByRole('menuitem')).toHaveText(['CSV', 'SVG image', 'PNG image']);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');

  await clickBar(page, status, 'shipped');
  await expect(status.getByTestId('mark-badge')).toContainText('1 marked');
  menu = await exportMenu();
  await expect(menu.getByRole('menuitem')).toHaveText([
    'CSV',
    'Marked rows CSV',
    'SVG image',
    'PNG image',
  ]);

  // The SVG: what the tile draws — its labels, and the marking's fade on the
  // unmarked bars — as ECharts drew it.
  const drawn = await canvas
    .locator('svg')
    .first()
    .evaluate((svg) => ({
      texts: [...svg.querySelectorAll('text')].map((text) => text.textContent),
      faded: [...svg.querySelectorAll('path[fill-opacity]')].map((path) =>
        path.getAttribute('fill-opacity'),
      ),
    }));
  const svgFile = await download(menu, 'SVG image');
  expect(svgFile.name).toBe('By status.svg');
  const inFile = await page.evaluate(
    (text) => {
      const svg = new DOMParser().parseFromString(text, 'image/svg+xml').documentElement;
      return {
        texts: [...svg.querySelectorAll('text')].map((each) => each.textContent),
        faded: [...svg.querySelectorAll('path[fill-opacity]')].map((path) =>
          path.getAttribute('fill-opacity'),
        ),
      };
    },
    await readFile(svgFile.path, 'utf8'),
  );
  expect(drawn.faded.length).toBeGreaterThan(0);
  expect(inFile).toEqual(drawn);

  // The PNG: the chart's size at the screen's pixel ratio, the marked bar
  // solid and the others faded, on the tile's surface.
  menu = await exportMenu();
  const pngFile = await download(menu, 'PNG image');
  expect(pngFile.name).toBe('By status.png');
  const png = await readFile(pngFile.path);
  expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  const size = await canvas.evaluate((node) => ({
    width: node.clientWidth,
    height: node.clientHeight,
    ratio: window.devicePixelRatio,
  }));
  expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([
    Math.round(size.width * size.ratio),
    Math.round(size.height * size.ratio),
  ]);
  const inBar = async (category: string) =>
    canvas
      .locator('svg text', { hasText: category })
      .first()
      .evaluate((text, ratio) => {
        const label = text.getBoundingClientRect();
        const box = (
          text.closest('[data-testid="chart-canvas"]') as Element
        ).getBoundingClientRect();
        return [
          Math.round((label.x + label.width / 2 - box.x) * ratio),
          Math.round((label.y - 12 - box.y) * ratio),
        ];
      }, size.ratio);
  const points = [await inBar('shipped'), await inBar('completed')];
  const [marked, faded] = await page.evaluate(
    async ({ bytes, at }) => {
      const bitmap = await createImageBitmap(
        new Blob([new Uint8Array(bytes)], { type: 'image/png' }),
      );
      const drawing = new OffscreenCanvas(bitmap.width, bitmap.height);
      const context = drawing.getContext('2d') as OffscreenCanvasRenderingContext2D;
      context.drawImage(bitmap, 0, 0);
      // How dark each point is, and how opaque: the surface is painted in.
      return at.map(([x, y]) => {
        const [r = 0, g = 0, b = 0, a = 0] = context.getImageData(x ?? 0, y ?? 0, 1, 1).data;
        return { light: r + g + b, a };
      });
    },
    { bytes: [...png], at: points },
  );
  expect(marked?.a).toBe(255);
  expect(faded?.a).toBe(255);
  expect(marked?.light ?? 0).toBeLessThan(faded?.light ?? 0);

  // The marked rows' CSV: the 80 shipped orders, as View marked rows has them.
  menu = await exportMenu();
  const rowsFile = await download(menu, 'Marked rows CSV');
  expect(rowsFile.name).toBe('By status - marked rows.csv');
  const read = await readFile(rowsFile.path, 'utf8');
  // Past the byte-order mark a spreadsheet reads it as UTF-8 by.
  const text = read.charCodeAt(0) === 0xfeff ? read.slice(1) : read;
  const lines = text.trim().split('\r\n');
  expect(lines).toHaveLength(81);
  expect(lines.slice(1).every((line) => line.includes('shipped'))).toBe(true);
  await expect(status.locator('.tile-export-note')).toContainText('Downloaded 80 rows');
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
      data: { kind: 'dashboard', title, ...IN_MY_WORKSPACE },
    })
  ).json()) as { id: string };
  const chart = (await (
    await request.post(`${API}/documents`, {
      data: { kind: 'chart', title: 'Every item', ...IN_MY_WORKSPACE },
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
        ...IN_MY_WORKSPACE,
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
    .getByRole('menu', { name: /^Actions for / })
    .getByRole('group', { name: /marked$/ })
    .getByRole('menuitem', { name: 'Mark all' })
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

/**
 * T386 / AC-093: WHILE a marking is in range mode, THE SYSTEM SHALL let the
 * user drag along an axis to mark a continuous range, show it as a coloured
 * stripe on that axis, and keep its bounds when filters change.
 * `Fails when: the stripe does not appear, or the bounds move when a filter
 * changes.`
 *
 * Orders by month, on a dashboard whose one marking is in range mode, with a
 * status filter to change afterwards.
 */
test('in range mode a drag along the time axis marks its buckets, striped on the axis, and the bounds hold when a filter changes', async ({
  page,
  request,
}) => {
  const unique = `${String(Date.now())}-${String(Math.round(Math.random() * 1e6))}`;
  const title = `Ranges ${unique}`;
  const dashboard = (await (
    await request.post(`${API}/documents`, {
      data: { kind: 'dashboard', title, ...IN_MY_WORKSPACE },
    })
  ).json()) as { id: string };
  const chart = (await (
    await request.post(`${API}/documents`, {
      data: { kind: 'chart', title: 'By month', ...IN_MY_WORKSPACE },
    })
  ).json()) as { id: string };
  await request.put(`${API}/documents/chart/${chart.id}`, {
    data: {
      version: 1,
      body: {
        schemaVersion: 1,
        title: 'By month',
        owner: 'admin',
        localToDashboardId: dashboard.id,
        chart: {
          source: { cube: 'orders' },
          wells: {
            measures: ['orders.count'],
            dimensions: [],
            timeDimensions: ['orders.ordered_at'],
          },
          granularities: { 'orders.ordered_at': 'month' },
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
        ...IN_MY_WORKSPACE,
        owner: 'admin',
        settings: { width: 'fixed', interactions: { mode: 'markings' } },
        markings: [{ id: 'm1', name: 'Periods', slot: 'mk1', isDefault: true, mode: 'range' }],
        filters: [{ id: 'f-status', widget: 'checkbox', member: 'orders.status' }],
        pages: [
          {
            id: 'only',
            title: 'Only',
            items: [{ id: 'tile-months', kind: 'chart', w: 12, h: 40, chartId: chart.id }],
          },
        ],
      },
    },
  });

  await page.goto(`/explore/dashboards/${dashboard.id}`);
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  const months = tile(page, 'tile-months');
  const canvas = months.getByTestId('chart-canvas');
  await expect(canvas.locator('svg text').first()).toBeVisible();
  // It takes a drag as a span of its axis, not a shape.
  await expect(canvas).toHaveAttribute('data-marks-range', 'true');
  const box = (await canvas.boundingBox())!;

  // Along the axis, left to right, across the middle of the plot.
  const y = box.y + box.height * 0.5;
  await page.mouse.move(box.x + box.width * 0.35, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.5, y, { steps: 5 });
  await page.mouse.move(box.x + box.width * 0.7, y, { steps: 5 });
  await page.mouse.up();

  // A stripe on the axis, over two months or more.
  const stripe = months.getByTestId('range-stripe');
  await expect(stripe).toBeVisible();
  const from = await stripe.getAttribute('data-from');
  const to = await stripe.getAttribute('data-to');
  expect(from).not.toBeNull();
  expect(from! < to!).toBe(true);
  const chip = page.getByTestId('mark-chip');
  await expect(chip).toBeVisible();
  const said = await chip.textContent();

  // A filter changes what the chart shows: the bounds stay where they were.
  const status = page.getByRole('region', { name: 'Filters' }).locator('[data-widget="checkbox"]');
  await status.locator('button[aria-expanded]').click();
  // The chart asked again with the filter, and drawn from that answer
  // (T386's review: not the render from before it).
  const refiltered = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/load') &&
      JSON.stringify(response.request().postDataJSON()).includes('orders.status'),
  );
  await page
    .getByRole('region', { name: 'Filters' })
    .getByRole('checkbox', { name: 'shipped' })
    .check();
  expect((await refiltered).status()).toBe(200);
  await page.keyboard.press('Escape');
  await expect(months.getByTestId('chart-tile')).not.toHaveAttribute('aria-busy', 'true');
  await expect(stripe).toBeVisible();
  expect(await stripe.getAttribute('data-from')).toBe(from);
  expect(await stripe.getAttribute('data-to')).toBe(to);
  await expect(chip).toHaveText(said!);
});
