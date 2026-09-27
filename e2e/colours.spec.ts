import { expect, test, type APIRequestContext, type Locator } from '@playwright/test';

const API = 'http://localhost:4100/api';

/**
 * T465 (AC-039; UX-103, UX-113): colour on a dashboard.
 *
 * - A single-series chart colours by no member: it is drawn in the palette's
 *   first colour and claims no slot — never in the neutral direction.md §5
 *   keeps for "Other" and null, which it fell to once other tiles had taken
 *   every slot.
 * - A colour a tile's Customize tab chose for a member is that member's on
 *   every tile, so a category is one colour everywhere.
 * - A donut's data labels are in the theme's text in dark, not ECharts' own
 *   `#333` with a white outline.
 */

const FIRST = '#2a78d6';
const OTHER = '#b3b1ab';

interface Tile {
  readonly id: string;
  readonly chartType: string;
  readonly dimensions: readonly string[];
  readonly options?: Record<string, unknown>;
  readonly w?: number;
}

/** A dashboard of these tiles, each with a chart of its own on orders.count. */
async function dashboardOf(request: APIRequestContext, tiles: readonly Tile[]): Promise<string> {
  const stamp = `${String(Date.now())}-${String(Math.round(Math.random() * 1e6))}`;
  const created = async (kind: string, title: string) =>
    (
      (await (
        await request.post(`${API}/documents`, { data: { kind, title, folderId: 'root' } })
      ).json()) as { id: string }
    ).id;
  const id = await created('dashboard', `Colours ${stamp}`);
  const items = [];
  for (const tile of tiles) {
    const chartId = await created('chart', `${tile.id} ${stamp}`);
    const [x, color] = tile.dimensions;
    const stored = await request.put(`${API}/documents/chart/${chartId}`, {
      data: {
        version: 1,
        body: {
          schemaVersion: 1,
          title: `${tile.id} ${stamp}`,
          owner: 'admin',
          localToDashboardId: id,
          chart: {
            source: { cube: 'orders' },
            wells: {
              measures: ['orders.count'],
              dimensions: [x, color].filter((member) => member !== undefined),
              timeDimensions: [],
            },
            chartType: tile.chartType,
            ...(tile.options === undefined ? {} : { options: tile.options }),
          },
        },
      },
    });
    expect(stored.status()).toBe(200);
    items.push({ id: tile.id, kind: 'chart', w: tile.w ?? 4, h: 40, chartId });
  }
  const dashboard = await request.put(`${API}/documents/dashboard/${id}`, {
    data: {
      version: 1,
      body: {
        schemaVersion: 1,
        title: `Colours ${stamp}`,
        folderId: 'root',
        owner: 'admin',
        settings: { width: 'fixed' },
        pages: [{ id: 'only', title: 'Only', items }],
      },
    },
  });
  expect(dashboard.status()).toBe(200);
  return id;
}

/** The fills of a tile's drawn marks: every filled path larger than a legend icon. */
const markFills = (tile: Locator) =>
  tile.evaluate((element) =>
    [...element.querySelectorAll('svg path[fill]')]
      .filter((path) => {
        const box = path.getBoundingClientRect();
        return box.width > 12 && box.height > 12;
      })
      .map((path) => (path.getAttribute('fill') ?? '').toLowerCase()),
  );

/** Each legend entry's swatch colour, by its name. */
const legendColoursOf = (tile: Locator) =>
  tile.evaluate((element) => {
    const swatches = [...element.querySelectorAll('svg path[fill]')]
      .map((path) => ({
        fill: (path.getAttribute('fill') ?? '').toLowerCase(),
        box: path.getBoundingClientRect(),
      }))
      .filter(({ fill, box }) => fill !== 'none' && box.height <= 24 && box.width <= 60);
    const found: Record<string, string> = {};
    for (const text of element.querySelectorAll('svg text')) {
      const name = (text.textContent ?? '').trim();
      if (name === '') continue;
      const label = text.getBoundingClientRect();
      const middle = label.top + label.height / 2;
      const swatch = swatches
        .filter(
          ({ box }) =>
            box.right <= label.left + 2 && Math.abs(box.top + box.height / 2 - middle) < 8,
        )
        .sort((a, b) => b.box.right - a.box.right)[0];
      if (swatch !== undefined && label.left - swatch.box.right < 24) found[name] = swatch.fill;
    }
    return found;
  });

test('a single-series bar is drawn in the palette’s first colour after other tiles took every slot', async ({
  page,
  request,
}) => {
  // Four customers and four products: all eight slots, before the bar.
  const id = await dashboardOf(request, [
    { id: 'customers', chartType: 'donut', dimensions: ['customers.name'] },
    { id: 'products', chartType: 'donut', dimensions: ['products.name'] },
    { id: 'single', chartType: 'bar', dimensions: ['orders.status'] },
  ]);
  await page.goto(`/explore/dashboards/${id}`);
  const single = page.locator('[data-tile="single"]');
  await expect(single.getByTestId('chart-canvas')).toHaveAttribute('data-chart-type', 'bar');

  await expect.poll(async () => (await markFills(single)).length).toBeGreaterThan(2);
  const fills = await markFills(single);
  expect(fills).not.toContain(OTHER);
  expect(new Set(fills)).toEqual(new Set([FIRST]));
});

test('a colour one tile chose for a category is that category’s on every tile', async ({
  page,
  request,
}) => {
  const id = await dashboardOf(request, [
    {
      id: 'chosen',
      chartType: 'bar',
      dimensions: ['customers.country', 'orders.status'],
      options: { series: { completed: { colour: '#1fa8c9' } } },
      w: 6,
    },
    { id: 'donut', chartType: 'donut', dimensions: ['orders.status'], w: 6 },
  ]);
  await page.goto(`/explore/dashboards/${id}`);
  const chosen = page.locator('[data-tile="chosen"]');
  const donut = page.locator('[data-tile="donut"]');
  for (const tile of [chosen, donut])
    await expect.poll(async () => Object.keys(await legendColoursOf(tile)).length).toBe(3);

  const [inChosen, inDonut] = [await legendColoursOf(chosen), await legendColoursOf(donut)];
  expect(inChosen['completed']).toBe('#1fa8c9');
  expect(inDonut['completed']).toBe('#1fa8c9');
  for (const status of ['shipped', 'processing']) expect(inDonut[status]).toBe(inChosen[status]);
});

test('a donut’s data labels are in the dark theme’s text, not an outlined #333', async ({
  page,
  request,
}) => {
  const id = await dashboardOf(request, [
    {
      id: 'labelled',
      chartType: 'donut',
      dimensions: ['orders.status'],
      options: { dataLabels: true },
      w: 6,
    },
  ]);
  await page.goto(`/explore/dashboards/${id}`);
  await page.getByRole('button', { name: /theme/i }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const tile = page.locator('[data-tile="labelled"]');
  await expect(tile.getByTestId('chart-canvas')).toHaveAttribute('data-chart-type', 'donut');

  const texts = async () =>
    tile.evaluate((element) =>
      [...element.querySelectorAll('svg text')].map((text) => ({
        words: (text.textContent ?? '').trim(),
        fill: (text.getAttribute('fill') ?? '').toLowerCase(),
        outline:
          Number(text.getAttribute('stroke-width') ?? 0) > 0 &&
          text.getAttribute('stroke') !== 'none',
      })),
    );
  await expect
    .poll(async () => (await texts()).filter((text) => /\d/.test(text.words)).length)
    .toBeGreaterThan(0);
  for (const text of await texts()) {
    expect(text.fill, text.words).not.toBe('#333');
    expect(text.outline, text.words).toBe(false);
  }
  // The data labels — the values — in the dark theme's secondary text itself.
  for (const text of (await texts()).filter((each) => /\d/.test(each.words)))
    expect(text.fill, text.words).toBe('#b4b3ab');
});
