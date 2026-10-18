import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

import { IN_MY_WORKSPACE } from './workspace';

/**
 * Combo charts on a dashboard (F44): each measure with its own mark on its
 * own value axis, the axes titled with their glyphs, and a hovered series
 * emphasising its axis.
 */
const API = 'http://localhost:4100/api';

/** direction.md §5's light text tokens (`packages/ui/src/tokens.ts`). */
const TEXT_PRIMARY = '#1f1f1e';
const TEXT_SECONDARY = '#5c5b57';

/** A dashboard of one combo: total amount as bars on the left, the count as points on the right. */
async function comboDashboard(request: APIRequestContext) {
  const title = `Combo ${String(Date.now())}-${String(Math.round(Math.random() * 1e6))}`;
  const dashboard = (await (
    await request.post(`${API}/documents`, {
      data: { kind: 'dashboard', title, ...IN_MY_WORKSPACE },
    })
  ).json()) as { id: string };
  const chart = (await (
    await request.post(`${API}/documents`, {
      data: { kind: 'chart', title: 'Amount and orders', ...IN_MY_WORKSPACE },
    })
  ).json()) as { id: string };
  const saved = await request.put(`${API}/documents/chart/${chart.id}`, {
    data: {
      version: 1,
      body: {
        schemaVersion: 1,
        title: 'Amount and orders',
        owner: 'admin',
        localToDashboardId: dashboard.id,
        chart: {
          source: { cube: 'orders' },
          wells: {
            measures: ['orders.total_amount', 'orders.count'],
            dimensions: ['products.category'],
            timeDimensions: [],
          },
          chartType: 'combo',
          options: { series: { 'orders.count': { mark: 'point', axis: 'right' } } },
        },
      },
    },
  });
  expect(saved.ok(), await saved.text()).toBe(true);
  const placed = await request.put(`${API}/documents/dashboard/${dashboard.id}`, {
    data: {
      version: 1,
      body: {
        schemaVersion: 1,
        title,
        ...IN_MY_WORKSPACE,
        owner: 'admin',
        settings: { width: 'fixed' },
        pages: [
          {
            id: 'only',
            title: 'Only',
            items: [{ id: 'tile-combo', kind: 'chart', w: 12, h: 60, chartId: chart.id }],
          },
        ],
      },
    },
  });
  expect(placed.ok(), await placed.text()).toBe(true);
  return { id: dashboard.id, title };
}

/** The tile's text, each with where it is and its fill. */
async function textsIn(page: Page) {
  return page.locator('[data-tile="tile-combo"] svg text').evaluateAll((nodes) =>
    nodes.map((node) => {
      const box = node.getBoundingClientRect();
      return {
        text: node.textContent ?? '',
        x: box.x + box.width / 2,
        y: box.y + box.height / 2,
        fill: node.getAttribute('fill') ?? '',
      };
    }),
  );
}

test('a combo titles its two axes with their glyphs, says "(right)", and a hovered series emphasises its axis', async ({
  page,
  request,
}) => {
  const { id, title } = await comboDashboard(request);
  await page.goto(`/explore/dashboards/${id}`);
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  const svg = page.locator('[data-tile="tile-combo"] svg').first();
  await expect(svg).toBeVisible();

  // The legend says which series is on the right; the left axis's title
  // ends in its unit (AC-500).
  await expect.poll(async () => (await textsIn(page)).map((one) => one.text)).toContain('(right)');
  const texts = await textsIn(page);
  expect(texts.some((one) => /\(\$\)$/.test(one.text))).toBe(true);

  // The right axis's ticks: numbers right of the plot.
  const box = (await svg.boundingBox())!;
  const ticks = (await textsIn(page)).filter(
    (one) => /^\d/.test(one.text) && one.x > box.x + box.width * 0.85,
  );
  expect(ticks.length).toBeGreaterThan(1);
  // Those ticks, as drawn now: not the pointer's own label on the axis.
  const rightTicks = async () =>
    (await textsIn(page)).filter((one) =>
      ticks.some((tick) => tick.text === one.text && Math.abs(tick.y - one.y) < 1),
    );
  expect(new Set((await rightTicks()).map((one) => one.fill))).toEqual(new Set([TEXT_SECONDARY]));

  // The left axis's bars: tall shapes with a bar's 4 px data-end corners
  // (not the pointer's 3 px labels), each at its drawn strength. A hovered
  // bar takes ECharts' emphasis colour, so its fill isn't matched.
  const bars = () =>
    page.locator('[data-tile="tile-combo"] svg path').evaluateAll((nodes) =>
      nodes
        .filter(
          (node) =>
            (node.getAttribute('d') ?? '').includes('A4 4 0 0 1') &&
            node.getBoundingClientRect().height > 20,
        )
        .map(
          (node) =>
            Number(node.getAttribute('opacity') ?? 1) *
            Number(node.getAttribute('fill-opacity') ?? 1),
        ),
    );
  expect((await bars()).length).toBeGreaterThan(0);
  expect(new Set(await bars())).toEqual(new Set([1]));

  // Hover a point of the right axis's series: its axis's ticks go to
  // text-primary, and the left axis's bars fade to 0.28 (AC-500).
  const point = page.locator('[data-tile="tile-combo"] svg path[d^="M1 0A"]').first();
  const at = (await point.boundingBox())!;
  await page.mouse.move(at.x + at.width / 2, at.y + at.height / 2);
  await expect
    .poll(async () => new Set((await rightTicks()).map((one) => one.fill)))
    .toEqual(new Set([TEXT_PRIMARY]));
  await expect
    .poll(async () => (await bars()).map((strength) => Math.round(strength * 100) / 100))
    .toEqual((await bars()).map(() => 0.28));

  // Away from the chart, it's back as it was.
  await page.mouse.move(box.x - 40, box.y - 40);
  await expect
    .poll(async () => new Set((await rightTicks()).map((one) => one.fill)))
    .toEqual(new Set([TEXT_SECONDARY]));
  await expect.poll(async () => new Set(await bars())).toEqual(new Set([1]));
});
