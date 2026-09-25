import { expect, test, type APIRequestContext, type Locator, type Page } from '@playwright/test';

/**
 * T123 / AC-117: WHILE a dashboard is in cross-filter mode, WHEN the user
 * clicks a mark, THE SYSTEM SHALL apply the action set for that source and
 * target pair: filter the target, highlight it, or leave it unchanged.
 * `Fails when: a pair set to None changes, or a pair set to Filter only
 * highlights.`
 *
 * On the real surface, because the criterion is about clicking a mark: the
 * bars are SVG paths a pointer lands on, and what a click does to the other
 * tiles is the whole point. The unit tests decide the pair's action
 * (`crossfilter/apply.test.ts`) and draw it (`crossfilter/highlight.test.ts`).
 */
const API = 'http://localhost:4100/api';

type Pairs = Record<string, 'filter' | 'highlight' | 'none'>;

/**
 * A dashboard of its own, in cross-filter mode, with two bar tiles: orders by
 * status ("tile-status"), and orders by category ("tile-category").
 */
async function crossFilterDashboard(
  request: APIRequestContext,
  {
    defaultAction = 'filter',
    pairs,
    unreachable = false,
    markings = false,
  }: { defaultAction?: string; pairs?: Pairs; unreachable?: boolean; markings?: boolean } = {},
) {
  const unique = `${String(Date.now())}-${String(Math.round(Math.random() * 1e6))}`;
  const title = `Cross ${unique}`;
  const dashboard = (await (
    await request.post(`${API}/documents`, {
      data: { kind: 'dashboard', title, folderId: 'root' },
    })
  ).json()) as { id: string };

  const chartOn = async (chartTitle: string, dimension: string, cube = 'orders') => {
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
            wells: { measures: [`${cube}.count`], dimensions: [dimension], timeDimensions: [] },
            chartType: 'bar',
          },
        },
      },
    });
    return chart.id;
  };

  const status = await chartOn('By status', 'orders.status');
  const category = await chartOn('By category', 'products.category');
  /**
   * A tile on a cube with no joins at all (`infra/cube/model/cubes/
   * monthly_orders.yml`), so nothing on the dashboard can be asked about
   * `orders.status` on its behalf.
   */
  const apart = unreachable
    ? await chartOn('Apart', 'monthly_orders.status', 'monthly_orders')
    : undefined;
  await request.put(`${API}/documents/dashboard/${dashboard.id}`, {
    data: {
      version: 1,
      body: {
        schemaVersion: 1,
        title,
        folderId: 'root',
        owner: 'admin',
        settings: {
          width: 'fixed',
          interactions: {
            mode: 'crossFilter',
            crossFilter: { defaultAction, ...(pairs === undefined ? {} : { pairs }) },
          },
        },
        // A marking kept from Markings mode: configured, and not in use here.
        ...(markings
          ? { markings: [{ id: 'm1', name: 'Marking', slot: 'mk1', isDefault: true }] }
          : {}),
        pages: [
          {
            id: 'only',
            title: 'Only',
            items: [
              { id: 'tile-status', kind: 'chart', w: 6, h: 40, chartId: status },
              { id: 'tile-category', kind: 'chart', w: 6, h: 40, chartId: category },
              ...(apart === undefined
                ? []
                : [{ id: 'tile-apart', kind: 'chart', w: 6, h: 40, chartId: apart }]),
            ],
          },
        ],
      },
    },
  });
  return { id: dashboard.id, title };
}

const tile = (page: Page, id: string) => page.locator(`[data-tile="${id}"]`);

/** The values a tile's table view shows, which is what it drew. */
async function valuesIn(target: Locator) {
  const toggle = target.getByTestId('toggle-table-view');
  await toggle.click();
  await expect(target.getByTestId('table-row').first()).toBeVisible();
  const rows = await target.getByTestId('table-row').allInnerTexts();
  // Back to the chart, which is what the highlight is drawn on.
  await toggle.click();
  await expect(target.getByTestId('chart-canvas')).toBeVisible();
  return rows;
}

/**
 * Clicks the bar over a category's axis label: on a bar chart the mark sits
 * directly above the name it is drawn for, so a point just above the label is
 * inside it whatever the scale.
 */
async function clickBar(page: Page, target: Locator, category: string) {
  const label = target.locator('svg text', { hasText: category }).first();
  await expect(label).toBeVisible();
  // Laid out, not merely present: a chart redrawn a moment ago — after a
  // save, say — has its labels in the DOM before WebKit has placed them.
  // Its own client rect: Playwright's boundingBox() puts a middle-anchored
  // SVG text half its width to the right in WebKit (found in T254's run).
  let box: { x: number; y: number; width: number } | null = null;
  // And where it has come to rest, the same box twice running, as the
  // markings helper waits (T254's review).
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
  await page.mouse.click(at.x + at.width / 2, at.y - 10);
}

async function open(page: Page, id: string, title: string) {
  await page.goto(`/explore/dashboards/${id}`);
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  await expect(tile(page, 'tile-status').getByTestId('chart-canvas')).toBeVisible();
  await expect(tile(page, 'tile-category').getByTestId('chart-canvas')).toBeVisible();
}

test('a pair set to Filter filters the other tile', async ({ page, request }) => {
  const { id, title } = await crossFilterDashboard(request, { defaultAction: 'filter' });
  await open(page, id, title);

  const category = tile(page, 'tile-category');
  const before = await valuesIn(category);
  expect(before.length).toBeGreaterThan(0);

  await clickBar(page, tile(page, 'tile-status'), 'shipped');

  // Filtered: the same categories, counting only the shipped orders, so the
  // numbers are lower. "Only highlights" is the criterion's failing state.
  await expect.poll(async () => (await valuesIn(category)).join('|')).not.toBe(before.join('|'));
  await expect(category.getByTestId('chart-canvas')).not.toHaveAttribute('data-highlight', /./);

  // The same bar again takes the selection back, as clicking a selected point
  // does in Power BI and Superset (`docs/research/cross-highlight.md` §4).
  await clickBar(page, tile(page, 'tile-status'), 'shipped');
  await expect.poll(async () => (await valuesIn(category)).join('|')).toBe(before.join('|'));
});

test('a pair set to Highlight keeps the tile’s own rows and draws the selection', async ({
  page,
  request,
}) => {
  const { id, title } = await crossFilterDashboard(request, {
    defaultAction: 'filter',
    pairs: { 'tile-status>tile-category': 'highlight' },
  });
  await open(page, id, title);

  const category = tile(page, 'tile-category');
  const before = await valuesIn(category);

  await clickBar(page, tile(page, 'tile-status'), 'shipped');

  // Its own answer, with the selection drawn over it: not filtered away.
  await expect(category.getByTestId('chart-canvas')).toHaveAttribute(
    'data-highlight',
    'share:orders.status=shipped',
  );
  expect(await valuesIn(category)).toEqual(before);
});

test('a tile the selection cannot reach is left unfiltered, and says so', async ({
  page,
  request,
}) => {
  // The user's decision, 2026-09-22: the same answer dashboard filters give
  // (AC-079). `monthly_orders` has no joins, so nothing can ask it about
  // `orders.status` on another cube's behalf.
  const { id, title } = await crossFilterDashboard(request, { unreachable: true });
  await open(page, id, title);

  const apart = tile(page, 'tile-apart');
  const before = await valuesIn(apart);

  await clickBar(page, tile(page, 'tile-status'), 'shipped');

  await expect(apart.getByTestId('not-covered')).toContainText('Not filtered by');
  expect(await valuesIn(apart)).toEqual(before);
});

test('a tile set to Highlight that cannot reach the field says so too', async ({
  page,
  request,
}) => {
  // The highlight is asked of Cube as well, so it answers to the same rule:
  // without this it drew as though nothing had been clicked, with no note
  // and nothing to explain it (T123's review).
  const { id, title } = await crossFilterDashboard(request, {
    unreachable: true,
    pairs: { 'tile-status>tile-apart': 'highlight' },
  });
  await open(page, id, title);

  const apart = tile(page, 'tile-apart');
  const before = await valuesIn(apart);

  await clickBar(page, tile(page, 'tile-status'), 'shipped');

  await expect(apart.getByTestId('not-covered')).toContainText('Not filtered by');
  await expect(apart.getByTestId('chart-canvas')).not.toHaveAttribute('data-highlight', /./);
  expect(await valuesIn(apart)).toEqual(before);
});

test('clicking a mark while editing selects the tile instead of cross-filtering', async ({
  page,
  request,
}) => {
  const { id, title } = await crossFilterDashboard(request, { defaultAction: 'filter' });
  await open(page, id, title);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByRole('toolbar', { name: 'Dashboard editing' })).toBeVisible();

  const category = tile(page, 'tile-category');
  const before = await valuesIn(category);

  await clickBar(page, tile(page, 'tile-status'), 'shipped');

  // Editing is arranging, not reading: a click picks the tile up.
  await expect(tile(page, 'tile-status')).toHaveAttribute('data-selected', 'true');
  await page.waitForLoadState('networkidle');
  expect(await valuesIn(category)).toEqual(before);
});

/**
 * T124 / AC-118: THE SYSTEM SHALL apply the dashboard's default pair action
 * to pairs the author has not set, and show that default in the settings page.
 * `Fails when: an unset pair behaves differently from the stated default.`
 */
test('the settings page shows the default, and a pair set there is what a click obeys', async ({
  page,
  request,
}) => {
  const { id, title } = await crossFilterDashboard(request, { defaultAction: 'filter' });
  await open(page, id, title);

  await page.getByRole('button', { name: 'Dashboard settings' }).click();
  await page.getByRole('button', { name: /^Cross-filtering/ }).click();

  // The default this dashboard was saved with, shown as the one in effect.
  const chosen = page.getByRole('group', { name: 'Default for tile pairs' });
  await expect(chosen.getByRole('button', { name: 'Filter' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  // And every pair nobody has set showing it.
  const pair = page.getByRole('combobox', { name: 'By status to By category' });
  await expect(pair).toHaveValue('filter');

  // The default chosen here, not through the API: every unset pair follows.
  await chosen.getByRole('button', { name: 'None' }).click();
  await expect(pair).toHaveValue('none');
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByTestId('dashboard-settings')).toHaveCount(0);

  const category = tile(page, 'tile-category');
  const before = await valuesIn(category);
  await clickBar(page, tile(page, 'tile-status'), 'shipped');

  // What the page said is what the click does.
  await page.waitForLoadState('networkidle');
  expect(await valuesIn(category)).toEqual(before);

  // And the other way, so "unchanged" above cannot be a click that missed:
  // with the pair set to Filter, a click does change the tile. A different
  // bar, because the same one again would take the selection back.
  await page.getByRole('button', { name: 'Dashboard settings' }).click();
  await page.getByRole('button', { name: /^Cross-filtering/ }).click();
  await page.getByRole('combobox', { name: 'By status to By category' }).selectOption('filter');
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByTestId('dashboard-settings')).toHaveCount(0);

  await clickBar(page, tile(page, 'tile-status'), 'completed');
  await expect.poll(async () => (await valuesIn(category)).join('|')).not.toBe(before.join('|'));
});

/**
 * T125 / AC-119: WHEN a cross-filter is active, THE SYSTEM SHALL show a chip
 * naming the member and value and the source tile, and clear it when the chip
 * is dismissed or Escape is pressed.
 * `Fails when: the chip omits the source tile, or dismissing it leaves a tile
 * filtered.`
 */
test('a chip names the cross-filter, and dismissing it leaves nothing filtered', async ({
  page,
  request,
}) => {
  const { id, title } = await crossFilterDashboard(request, { defaultAction: 'filter' });
  await open(page, id, title);

  const category = tile(page, 'tile-category');
  const before = await valuesIn(category);
  await clickBar(page, tile(page, 'tile-status'), 'shipped');
  await expect.poll(async () => (await valuesIn(category)).join('|')).not.toBe(before.join('|'));

  const chip = page.getByTestId('cross-filter-chip');
  await expect(chip).toContainText('shipped');
  // The field as the model names it, and the tile the click came from.
  await expect(chip).toContainText('Orders Status');
  await expect(chip).toContainText('By status');

  await chip.getByRole('button', { name: /^Clear / }).click();

  await expect(chip).toHaveCount(0);
  await expect.poll(async () => (await valuesIn(category)).join('|')).toBe(before.join('|'));
});

test('Escape clears the cross-filters, as the bar says it does', async ({ page, request }) => {
  const { id, title } = await crossFilterDashboard(request, { defaultAction: 'filter' });
  await open(page, id, title);

  const category = tile(page, 'tile-category');
  const before = await valuesIn(category);
  await clickBar(page, tile(page, 'tile-status'), 'shipped');
  await expect(page.getByTestId('cross-filter-chip')).toHaveCount(1);
  await expect(page.getByTestId('clear-cross-filters')).toContainText('Esc');

  await page.keyboard.press('Escape');

  await expect(page.getByTestId('cross-filter-chip')).toHaveCount(0);
  await expect.poll(async () => (await valuesIn(category)).join('|')).toBe(before.join('|'));
});

/**
 * T077 / AC-071, the cross-filter half: WHEN the interaction mode changes and
 * the settings are saved, THE SYSTEM SHALL clear current marks and
 * cross-filters. The marks half is `e2e/markings.spec.ts`, "switching the
 * interaction mode and back leaves no mark behind".
 */
test('switching the interaction mode and back leaves no cross-filter behind', async ({
  page,
  request,
}) => {
  const { id, title } = await crossFilterDashboard(request, { defaultAction: 'filter' });
  await open(page, id, title);
  await clickBar(page, tile(page, 'tile-status'), 'shipped');
  await expect(page.getByTestId('cross-filter-chip')).toHaveCount(1);

  const setMode = async (label: string | RegExp) => {
    await page.getByRole('button', { name: 'Dashboard settings' }).click();
    await page.getByRole('button', { name: /^Interactions/ }).click();
    await page.getByRole('radio', { name: label }).check();
    await page.getByRole('button', { name: 'Save settings' }).click();
    await expect(page.getByTestId('dashboard-settings')).toHaveCount(0);
  };

  await setMode('Markings');
  await setMode(/^Cross-filtering/);

  // Back in cross-filter mode with nothing selected: what was clicked before
  // the dashboard changed mode does not come back with it.
  await expect(page.getByTestId('cross-filter-chip')).toHaveCount(0);
});

/**
 * T126 / AC-120: WHILE a dashboard is in cross-filter mode, THE SYSTEM SHALL
 * offer no marking controls, chips or badges anywhere in that dashboard.
 * `Fails when: a marking control appears in cross-filter mode.`
 *
 * Marked in Markings mode first, then switched: there is a marking to show,
 * with something in it, and nothing shows it — in view mode, from the
 * keyboard, in a tile's menu, or in edit mode's Properties.
 */
test('a cross-filtering dashboard shows no marking control, chip or badge', async ({
  page,
  request,
}) => {
  const { id, title } = await crossFilterDashboard(request, { markings: true });
  await open(page, id, title);
  const status = tile(page, 'tile-status');
  const setMode = async (label: string | RegExp) => {
    await page.getByRole('button', { name: 'Dashboard settings' }).click();
    await page.getByRole('button', { name: /^Interactions/ }).click();
    await page.getByRole('radio', { name: label }).check();
    await page.getByRole('button', { name: 'Save settings' }).click();
    await expect(page.getByTestId('dashboard-settings')).toHaveCount(0);
  };

  // Marked, and said, in Markings mode.
  await setMode('Markings');
  await clickBar(page, status, 'shipped');
  await expect(status.getByTestId('mark-badge')).toContainText('1 marked');
  await expect(page.getByTestId('mark-chip')).toContainText('shipped');
  await expect(page.getByTestId('marking-announcer')).toContainText('1');

  // Cross-filtering: none of it left, and a click cross-filters.
  await setMode(/^Cross-filtering/);
  for (const affordance of ['mark-badge', 'mark-chip'])
    await expect(page.getByTestId(affordance)).toHaveCount(0);
  await expect(page.getByTestId('marking-announcer')).toHaveText('');
  await clickBar(page, status, 'completed');
  await expect(page.getByTestId('cross-filter-chip')).toContainText('completed');
  // The keyboard marks nothing either.
  await status.focus();
  await page.keyboard.press('Space');
  for (const affordance of ['mark-badge', 'mark-chip'])
    await expect(page.getByTestId(affordance)).toHaveCount(0);
  await expect(page.getByTestId('marking-announcer')).toHaveText('');

  // Nor in a tile's menu: no marking group, no Unmark.
  await status.getByRole('button', { name: /^Actions for / }).click();
  const menu = status.getByRole('menu', { name: /^Actions for / });
  await expect(menu).toBeVisible();
  await expect(menu).not.toContainText('marked');
  await expect(menu.getByRole('menuitem', { name: 'Unmark' })).toHaveCount(0);
  await page.keyboard.press('Escape');

  // Nor in edit mode's Properties: where the clicks are set, instead.
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await status.getByTestId('chart-canvas').click({ position: { x: 8, y: 8 } });
  const panel = page.getByRole('tabpanel', { name: 'Properties' });
  await expect(panel.getByRole('heading', { name: 'Interactions' })).toBeVisible();
  await expect(panel.getByLabel('Marking', { exact: true })).toHaveCount(0);
  await expect(panel.getByRole('heading', { name: 'Marking' })).toHaveCount(0);
  await panel.getByRole('button', { name: 'Dashboard settings › Cross-filtering' }).click();
  // Opened on the section the link names.
  const settings = page.getByTestId('dashboard-settings');
  await expect(settings.getByRole('button', { name: /^Cross-filtering/ })).toHaveAttribute(
    'aria-current',
    'true',
  );
});

test('a pair set to None leaves the other tile untouched', async ({ page, request }) => {
  const { id, title } = await crossFilterDashboard(request, {
    defaultAction: 'filter',
    pairs: { 'tile-status>tile-category': 'none' },
  });
  await open(page, id, title);

  const category = tile(page, 'tile-category');
  const before = await valuesIn(category);

  await clickBar(page, tile(page, 'tile-status'), 'shipped');

  // Nothing at all: the criterion's first failing state. Once the page has
  // gone quiet, so a query on its way cannot pass for "unchanged".
  await page.waitForLoadState('networkidle');
  expect(await valuesIn(category)).toEqual(before);
  await expect(category.getByTestId('chart-canvas')).not.toHaveAttribute('data-highlight', /./);
});
