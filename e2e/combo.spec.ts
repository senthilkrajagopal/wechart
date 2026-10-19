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

  test('keeps the recommendation as it was once the count is on the right, and says so in Why (T865, AC-510)', async ({
    page,
  }) => {
    await comboOfRevenueAndCount(page);
    const why = page.getByRole('button', { name: 'Why this recommendation?' });
    await why.click();
    const checklist = page.getByTestId('why-checklist');
    const picked = await page.getByTestId('picked-type').getAttribute('data-chart-type');
    const runners = await checklist.locator('[data-testid^="runner-up-"]').allTextContents();
    await expect(page.getByTestId('check-one-value-axis')).toHaveCount(0);

    await page
      .getByTestId('undrawn-metrics')
      .getByRole('button', { name: 'Draw on a right axis' })
      .click();

    await expect(page.getByTestId('check-one-value-axis')).toHaveText(
      'One value axis: You drew a second axis by hand; the recommender never does',
    );
    await expect(page.getByTestId('picked-type')).toHaveAttribute('data-chart-type', picked ?? '');
    expect(await checklist.locator('[data-testid^="runner-up-"]').allTextContents()).toEqual(
      runners,
    );
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

  /**
   * T857 (AC-497, AC-500; design 20 pin 11): in the editor, each legend
   * entry's glyph is a 20 px button opening the pill's menu, and a pointer
   * over it emphasises its series' axis.
   */
  test('makes each legend glyph a 20 px button opening the pill’s menu (T857)', async ({
    page,
  }) => {
    await comboOfRevenueAndCount(page);
    await page
      .getByTestId('undrawn-metrics')
      .getByRole('button', { name: 'Draw on a right axis' })
      .click();
    const canvas = page.getByTestId('chart-canvas');
    const glyph = canvas.getByRole('button', {
      name: 'Count: line, right axis. Change mark or axis',
    });
    await expect(glyph).toBeVisible();
    await expect(
      canvas.getByRole('button', { name: 'Total Amount: bar, left axis. Change mark or axis' }),
    ).toBeVisible();
    const box = (await glyph.boundingBox())!;
    expect(Math.round(box.width)).toBe(20);
    expect(Math.round(box.height)).toBe(20);

    // Centred on the legend's glyph: the entry's text starts 5 px past the
    // 12 px glyph, level with it.
    const label = (await canvas.locator('svg text').evaluateAll((nodes) =>
      nodes
        .filter((node) => node.textContent === 'Count ')
        .map((node) => {
          const rect = node.getBoundingClientRect();
          return { left: rect.left, middle: rect.top + rect.height / 2 };
        }),
    ))[0]!;
    expect(Math.abs(label.left - (box.x + box.width / 2 + 11))).toBeLessThanOrEqual(2);
    expect(Math.abs(label.middle - (box.y + box.height / 2))).toBeLessThanOrEqual(3);

    // Over it, the count's axis is emphasised: its ticks go to text-primary.
    const plot = (await canvas.boundingBox())!;
    const rightTicks = () =>
      canvas.locator('svg text').evaluateAll((nodes, edge) => {
        const right = nodes.filter((node) => {
          const rect = node.getBoundingClientRect();
          return /^\d/.test(node.textContent ?? '') && rect.left > edge;
        });
        return [...new Set(right.map((node) => node.getAttribute('fill')))];
      }, plot.x + plot.width * 0.85);
    await expect.poll(rightTicks).toEqual([TEXT_SECONDARY]);
    await glyph.hover();
    await expect.poll(rightTicks).toEqual([TEXT_PRIMARY]);

    // Its menu is the pill's: Point here draws the count as points everywhere.
    await glyph.click();
    const menu = page.getByRole('menu', { name: 'Count: line, right axis. Change mark or axis' });
    await expect(menu.getByRole('menuitem')).toHaveText([
      /^Back to Auto/,
      'Format…',
      'Remove',
    ]);
    await menu.getByRole('menuitemradio', { name: 'Point' }).click();
    await expect(
      page
        .getByTestId('in-measures-orders.count')
        .getByRole('button', { name: 'Count: point, right axis. Change mark or axis' }),
    ).toBeVisible();
    await expect(
      canvas.getByRole('button', { name: 'Count: point, right axis. Change mark or axis' }),
    ).toBeVisible();
  });
});

/** T857 (AC-497): a dashboard's combo legend has no glyph buttons, in view or edit mode. */
test('gives a combo tile’s legend no glyph buttons on a dashboard, in view or edit mode (T857)', async ({
  page,
  request,
}) => {
  const { id, title } = await comboDashboard(request);
  await page.goto(`/explore/dashboards/${id}`);
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  const tile = page.locator('[data-tile="tile-combo"]');
  await expect.poll(async () => (await textsIn(page)).map((one) => one.text)).toContain('(right)');
  const glyphButtons = tile.getByRole('button', { name: /Change mark or axis$/ });

  await expect(glyphButtons).toHaveCount(0);
  await expect(tile.getByTestId('legend-glyph')).toHaveCount(0);

  // Its legend entry still emphasises its series' axis under the pointer
  // (AC-500): the count's, on the right, goes to text-primary.
  const plot = (await tile.locator('svg').first().boundingBox())!;
  const rightTicks = async () =>
    new Set(
      (await textsIn(page))
        .filter((one) => /^\d/.test(one.text) && one.x > plot.x + plot.width * 0.85)
        .map((one) => one.fill),
    );
  await expect.poll(rightTicks).toEqual(new Set([TEXT_SECONDARY]));
  // The count's entry, on the right: the one saying "(right)".
  const entry = (await textsIn(page)).find((one) => one.text === '(right)')!;
  await page.mouse.move(entry.x, entry.y);
  await expect.poll(rightTicks).toEqual(new Set([TEXT_PRIMARY]));
  await page.mouse.move(plot.x - 40, plot.y - 40);
  await expect.poll(rightTicks).toEqual(new Set([TEXT_SECONDARY]));

  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByRole('toolbar', { name: 'Dashboard editing' })).toBeVisible();
  await expect.poll(async () => (await textsIn(page)).map((one) => one.text)).toContain('(right)');
  await expect(glyphButtons).toHaveCount(0);
  await expect(tile.getByTestId('legend-glyph')).toHaveCount(0);
});

/**
 * T859 (AC-503; design 20 pin 4): a combo's stacking, set once for the whole
 * chart under Customize › Series: Bars side by side or stacked, and Areas
 * only while a series is an area.
 */
test('stacks a combo’s bars chart-wide from Customize › Series, and offers Areas only with an area (T859)', async ({
  page,
}) => {
  await page.goto('/explore/charts/seed-chart-empty/edit');
  await cubePicker(page).selectOption({ label: 'Orders' });
  await wellPicker(page, 'measures').selectOption('orders.total_amount');
  await wellPicker(page, 'measures').selectOption('orders.average_amount');
  await wellPicker(page, 'timeDimensions').selectOption('orders.ordered_at');
  // By month: a few categories, so each bar is wide enough to be found.
  await page.getByRole('combobox', { name: 'Grain of Ordered at' }).selectOption('month');
  await chooseChartType(page, 'combo');
  await page.getByRole('tab', { name: 'Customize' }).click();
  await page.locator('summary', { hasText: /^Series/ }).click();
  // Both amounts as bars, on the left.
  await page
    .getByRole('radiogroup', { name: 'Average Amount mark' })
    .getByRole('radio', { name: 'Bar' })
    .check();

  /**
   * The bars standing on the zero line: both amounts' bars side by side, only
   * the lower segment of each month's stack once stacked.
   */
  const columns = () =>
    page
      .getByTestId('chart-canvas')
      .locator('svg path')
      .evaluateAll((nodes) => {
        const boxes = nodes
          .map((node) => node.getBoundingClientRect())
          .filter((box) => box.height > 0 && box.width >= 2 && box.width <= 40);
        const baseline = Math.max(...boxes.map((box) => box.bottom));
        return boxes.filter((box) => Math.abs(box.bottom - baseline) < 1.5).length;
      });
  const bars = page.getByRole('radiogroup', { name: 'Bars' });
  await expect(bars.getByRole('radio', { name: 'Side by side' })).toBeChecked();
  await expect(page.getByRole('radiogroup', { name: 'Areas' })).toHaveCount(0);
  await expect.poll(columns).toBeGreaterThan(1);
  const sideBySide = await columns();

  await bars.getByRole('radio', { name: 'Stacked' }).check();
  await expect.poll(columns).toBeLessThan(sideBySide);

  // An area brings its row, Overlap first.
  await page
    .getByRole('radiogroup', { name: 'Average Amount mark' })
    .getByRole('radio', { name: 'Area' })
    .check();
  await expect(
    page.getByRole('radiogroup', { name: 'Areas' }).getByRole('radio', { name: 'Overlap' }),
  ).toBeChecked();
});

/**
 * T860 (AC-504, AC-505; design 20 screen 2 pins 4 to 7, state G1): a
 * combo's Split by well, its count against 8, its fold to the top k + Other,
 * "Statuses shown", and a measure past 8 series not drawn, with its offers.
 */
test('splits a combo by one dimension, counts it against 8, folds it, and leaves a measure out past 8 (T860)', async ({
  page,
}) => {
  await page.goto('/explore/charts/seed-chart-empty/edit');
  await cubePicker(page).selectOption({ label: 'Orders' });
  await wellPicker(page, 'measures').selectOption('orders.total_amount');
  await wellPicker(page, 'measures').selectOption('orders.average_amount');
  await wellPicker(page, 'timeDimensions').selectOption('orders.ordered_at');
  await chooseChartType(page, 'combo');

  // The Split by well, after Time: one dimension, across every measure.
  const split = page.getByTestId('well-dimensions');
  await expect(page.locator('#well-dimensions-label')).toHaveText(
    'Split by · one dimension, across every measure',
  );
  await wellPicker(page, 'dimensions').selectOption('orders.status');
  const status = page.getByTestId('in-dimensions-orders.status');
  await expect(status.getByTestId('split-members')).toHaveText('3');
  await expect(page.getByTestId('split-count')).toHaveText(
    '2 measures × 3 statuses = 6 of 8 series',
  );

  // A third measure would make 9: Auto folds to the top 1 + Other.
  await wellPicker(page, 'measures').selectOption('orders.count');
  await page
    .getByTestId('in-measures-orders.count')
    .getByRole('button', { name: /Change mark or axis$/ })
    .click();
  await page.getByRole('menuitemradio', { name: 'Right' }).click();
  await expect(status.getByTestId('split-members')).toHaveText('top 1 + Other of 3');
  await expect(page.getByTestId('split-count')).toHaveText(
    '3 measures × 2 (1 status + Other) = 6 of 8 series',
  );
  await expect(page.getByTestId('undrawn-metrics')).toHaveCount(0);

  // All, chosen, folds nothing: the last added isn't drawn.
  await page.getByRole('combobox', { name: 'Statuses shown' }).selectOption('all');
  await expect(status.getByTestId('split-members')).toHaveText('3');
  await expect(page.getByTestId('in-measures-orders.count')).toContainText(
    'not drawn · over 8 series',
  );
  const line = page.getByTestId('undrawn-metrics');
  await expect(line).toContainText(
    "Count isn't drawn. 2 measures × 3 statuses already make 6 series, and another measure's 3 would pass the 8 a combo draws.",
  );
  await expect(line.getByRole('button')).toHaveText([
    'Small multiples by Status',
    'Table',
    'Remove Count',
  ]);

  // A second dimension replaces the first.
  await wellPicker(page, 'dimensions').selectOption('products.category');
  await expect(split.getByTestId('in-dimensions-orders.status')).toHaveCount(0);
  await expect(split.getByTestId('in-dimensions-products.category')).toBeVisible();
});

/**
 * T858 (AC-219, AC-499, AC-501, AC-502; design 20 pins 1, 5, 7, 8, 9):
 * Customize › Axes' Left and Right axis groups, include zero locked while
 * bars are drawn, Synchronize with its toast and Undo, log on both axes,
 * and the canvas line saying what's drawn.
 */
test('gives a combo its Left and Right axis groups, Synchronize, log on both and the canvas line (T858)', async ({
  page,
}) => {
  await page.goto('/explore/charts/seed-chart-empty/edit');
  await cubePicker(page).selectOption({ label: 'Orders' });
  await wellPicker(page, 'measures').selectOption('orders.total_amount');
  await wellPicker(page, 'measures').selectOption('orders.average_amount');
  await wellPicker(page, 'timeDimensions').selectOption('orders.ordered_at');
  await chooseChartType(page, 'combo');
  const status = page.getByTestId('preview-status');
  // The type is named as the gallery names it, "Combo (bar + line)".
  const SHOWING = 'Showing Combo (bar + line) · chosen manually';
  await expect(status).toHaveText(`${SHOWING} · 2 series on one value axis`);

  await page.getByRole('tab', { name: 'Customize' }).click();
  const axes = page.getByTestId('axes-section');
  // Each measure by its title, as Customize › Series names it.
  await expect(axes.getByRole('group', { name: /^Left axis/ })).toContainText(
    'Orders Total Amount · Orders Average Amount · $',
  );
  await expect(axes.getByRole('group', { name: /^Right axis/ })).toHaveCount(0);
  await expect(axes.getByRole('switch', { name: 'Synchronize axes' })).toHaveCount(0);

  await page.locator('summary', { hasText: /^Series/ }).click();
  await page
    .getByRole('radiogroup', { name: 'Average Amount axis' })
    .getByRole('radio', { name: 'Right' })
    .check();
  await expect(status).toHaveText(`${SHOWING} · 2 series on 2 value axes, aligned at zero`);
  const left = axes.getByRole('group', { name: /^Left axis/ });
  const right = axes.getByRole('group', { name: /^Right axis/ });
  await expect(right).toContainText('Right axis Orders Average Amount · $');
  await expect(right.getByRole('checkbox', { name: 'Gridlines' })).toHaveCount(0);
  for (const side of [left, right]) {
    const zero = side.getByRole('checkbox', {
      name: 'Include zero · on, because Orders Total Amount draws bars',
      exact: true,
    });
    await expect(zero).toBeChecked();
    await expect(zero).toBeDisabled();
    await expect(
      side.getByRole('checkbox', {
        name: 'Log scale · unavailable: Orders Total Amount draws bars, which need a zero baseline',
        exact: true,
      }),
    ).toBeDisabled();
  }

  // Synchronize clears the right's fixed maximum, and Undo brings it back.
  const maximum = right.getByRole('spinbutton', { name: 'Maximum' });
  await maximum.fill('500');
  await axes.getByRole('switch', { name: 'Synchronize axes' }).click();
  await expect(status).toHaveText(`${SHOWING} · 2 series on 2 axes, synchronized`);
  // One scale, labelled on both sides: the same ticks left and right (AC-501).
  const ticksBySide = () =>
    page
      .getByTestId('chart-canvas')
      .locator('svg text')
      .evaluateAll((nodes) => {
        const svg = nodes[0]?.closest('svg')?.getBoundingClientRect();
        const middle = (svg?.left ?? 0) + (svg?.width ?? 0) / 2;
        const ticks = nodes.filter((node) => /^\$/.test(node.textContent ?? ''));
        const side = (left: boolean) =>
          ticks
            .filter((node) => node.getBoundingClientRect().left < middle === left)
            .map((node) => node.textContent ?? '')
            .filter((text) => text !== '$');
        return { left: side(true), right: side(false) };
      });
  await expect
    .poll(async () => {
      const { left: onLeft, right: onRight } = await ticksBySide();
      return onLeft.length > 1 && onLeft.join() === onRight.join();
    })
    .toBe(true);
  await expect(maximum).toHaveValue('');
  await expect(maximum).toBeDisabled();
  const toast = axes.getByRole('status').filter({ hasText: 'Right axis now follows the left axis' });
  await toast.getByRole('button', { name: 'Undo' }).click();
  await expect(maximum).toHaveValue('500');
  await expect(status).toHaveText(`${SHOWING} · 2 series on 2 value axes, aligned at zero`);

  // With lines only, log on one axis is log on both, said on both.
  await maximum.fill('');
  await page
    .getByRole('radiogroup', { name: 'Total Amount mark' })
    .getByRole('radio', { name: 'Line' })
    .check();
  await left.getByRole('checkbox', { name: 'Logarithmic scale' }).check();
  for (const side of [left, right]) {
    await expect(
      side.getByRole('checkbox', { name: 'Log scale · on for both axes, so their ticks align' }),
    ).toBeChecked();
  }
  await expect(page.getByTestId('axes-announcement')).toHaveText('Log scale on for both axes');
});
