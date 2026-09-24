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

/** A dashboard of its own, in Markings mode, with two bar tiles on one page. */
async function markingDashboard(request: APIRequestContext) {
  const unique = `${String(Date.now())}-${String(Math.round(Math.random() * 1e6))}`;
  const title = `Markings ${unique}`;
  const dashboard = (await (
    await request.post(`${API}/documents`, {
      data: { kind: 'dashboard', title, folderId: 'root' },
    })
  ).json()) as { id: string };

  const chartOn = async (chartTitle: string, dimension: string) => {
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
            source: { cube: 'orders' },
            wells: { measures: ['orders.count'], dimensions: [dimension], timeDimensions: [] },
            chartType: 'bar',
          },
        },
      },
    });
    return chart.id;
  };

  const status = await chartOn('By status', 'orders.status');
  const category = await chartOn('By category', 'products.category');
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
            ],
          },
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
