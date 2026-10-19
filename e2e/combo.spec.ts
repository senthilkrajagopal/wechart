import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

import { chooseChartType } from './chartType';
import { cubePicker } from './cubePicker';
import { wellPicker } from './wells';
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

test('a combo titles its two axes with their units, says "(right)", and a hovered series emphasises its axis', async ({
  page,
  request,
}) => {
  const { id, title } = await comboDashboard(request);
  await page.goto(`/explore/dashboards/${id}`);
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  const svg = page.locator('[data-tile="tile-combo"] svg').first();
  await expect(svg).toBeVisible();

  // The legend says which series is on the right; the left axis's title is
  // its unit alone, naming no measure (AC-500 as amended by R82).
  await expect.poll(async () => (await textsIn(page)).map((one) => one.text)).toContain('(right)');
  const texts = await textsIn(page);
  expect(texts.some((one) => one.text === '$')).toBe(true);
  expect(texts.some((one) => /\(\$\)$/.test(one.text))).toBe(false);

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

/**
 * The editor half of a combo of revenue and a count, by month (T855's
 * follow-up; AC-497, AC-506). Auto puts both on the left, so the count is
 * "not drawn · on another scale"; Customize › Series still lists it, so it
 * can be put on the right, where it's drawn; and the undrawn line offers
 * "Draw on a right axis" first, before Small multiples and Table.
 */
test.describe('a combo of revenue and a count, by month (T855 follow-up)', () => {
  async function comboOfRevenueAndCount(page: Page) {
    await page.goto('/explore/charts/seed-chart-empty/edit');
    await cubePicker(page).selectOption({ label: 'Orders' });
    await wellPicker(page, 'measures').selectOption('orders.total_amount');
    await wellPicker(page, 'measures').selectOption('orders.count');
    await wellPicker(page, 'timeDimensions').selectOption('orders.ordered_at');
    await chooseChartType(page, 'combo');
    await expect(page.getByTestId('in-measures-orders.count')).toContainText(
      'not drawn · on another scale',
    );
  }
  const axesOnCanvas = (page: Page) =>
    page
      .getByTestId('chart-canvas')
      .locator('svg text')
      .allTextContents()
      .then((texts) => texts.filter((text) => text.includes('Count')).length);

  test('lists the count in Customize › Series, and Right draws it', async ({ page }) => {
    await comboOfRevenueAndCount(page);

    await page.getByRole('tab', { name: 'Customize' }).click();
    await page.locator('summary', { hasText: /^Series/ }).click();
    const axis = page.getByRole('radiogroup', { name: 'Count axis' });
    await expect(axis).toBeVisible();
    await expect(page.getByRole('radiogroup', { name: 'Total Amount axis' })).toBeVisible();
    await axis.getByRole('radio', { name: 'Right' }).check();

    await page.getByRole('tab', { name: 'Data' }).click();
    await expect(page.getByTestId('in-measures-orders.count')).not.toContainText('not drawn');
    await expect(page.getByTestId('undrawn-metrics')).toHaveCount(0);
    // The right axis is titled by the count now drawn on it (AC-500).
    await expect.poll(() => axesOnCanvas(page)).toBeGreaterThan(0);
  });

  test('offers Draw on a right axis first in the undrawn line, and it draws the count there', async ({
    page,
  }) => {
    await comboOfRevenueAndCount(page);

    const line = page.getByTestId('undrawn-metrics');
    await expect(line.getByRole('button')).toHaveText([
      'Draw on a right axis',
      'Small multiples',
      'Table',
      'Remove Count',
    ]);
    // Its pill says left until the offer puts it on the right (T854, AC-506).
    const pill = page.getByTestId('in-measures-orders.count');
    await expect(pill.getByTestId('pill-axis')).toHaveText('L');
    await line.getByRole('button', { name: 'Draw on a right axis' }).click();
    await expect(line).toHaveCount(0);
    await expect(pill).not.toContainText('not drawn');
    await expect(pill.getByTestId('pill-axis')).toHaveText('R');
    await expect.poll(() => axesOnCanvas(page)).toBeGreaterThan(0);
  });

  test('puts the count on the right from its pill’s menu, which Customize › Series agrees with (T856)', async ({
    page,
  }) => {
    await comboOfRevenueAndCount(page);
    const pill = page.getByTestId('in-measures-orders.count');
    // The pill starts with its mark's glyph and ends with its axis, L.
    const glyph = pill.getByRole('button', { name: 'Count: line, left axis. Change mark or axis' });
    await expect(pill.getByTestId('pill-axis')).toHaveText('L');

    await glyph.click();
    const menu = page.getByRole('menu', { name: 'Count: line, left axis. Change mark or axis' });
    await expect(
      menu.getByRole('group', { name: 'Draw as' }).getByRole('menuitemradio'),
    ).toHaveText(['Bar', 'Line', 'Area', 'Point'].map((name) => new RegExp(`${name}$`)));
    await menu.getByRole('menuitemradio', { name: 'Right' }).click();

    await expect(pill.getByTestId('pill-axis')).toHaveText('R');
    await expect(pill).not.toContainText('not drawn');
    await expect.poll(() => axesOnCanvas(page)).toBeGreaterThan(0);
    await page.getByRole('tab', { name: 'Customize' }).click();
    await page.locator('summary', { hasText: /^Series/ }).click();
    await expect(
      page.getByRole('radiogroup', { name: 'Count axis' }).getByRole('radio', { name: 'Right' }),
    ).toBeChecked();

    // Esc gives focus back to the pill's glyph.
    await page.getByRole('tab', { name: 'Data' }).click();
    const moved = pill.getByRole('button', {
      name: 'Count: line, right axis. Change mark or axis',
    });
    await moved.click();
    await expect(page.getByRole('menu')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu')).toHaveCount(0);
    await expect(moved).toBeFocused();
  });
});
