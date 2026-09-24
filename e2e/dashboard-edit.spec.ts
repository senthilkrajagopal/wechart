import { expect, test, type Locator, type Page } from '@playwright/test';

/**
 * The dashboard's edit mode, against the prototype (F22).
 */
const DASHBOARD = '/explore/dashboards/seed-root-dashboard-1';

const edit = async (page: Page) => {
  await page.goto(DASHBOARD);
  await expect(page.getByRole('heading', { name: 'Company dashboard 01' })).toBeVisible();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByRole('toolbar', { name: 'Dashboard editing' })).toBeVisible();
};

/** How far inside `outer` the start of `inner` sits, in px. */
const insetOf = async (inner: Locator, outer: Locator) => {
  const [a, b] = await Promise.all([inner.boundingBox(), outer.boundingBox()]);
  return (a?.x ?? 0) - (b?.x ?? 0);
};

/**
 * T222 / AC-203: WHEN the user selects a tile in edit mode, THE SYSTEM SHALL
 * open Properties, showing for a chart tile its title, chart type and source,
 * an Edit chart action, its ownership, its Marking settings and its layout.
 * `Fails when: selecting a tile leaves another sidebar tab open, or one of
 * those parts is missing for a chart tile.`
 *
 * With AC-187: each section at the prototype's 12 px inset
 * (docs/design/prototype/index.html, `.section`).
 */
test('selecting a chart tile opens its Properties: chart, ownership, marking and layout', async ({
  page,
}) => {
  await edit(page);
  const sidebar = page.getByRole('complementary', { name: 'Edit sidebar' });
  await expect(sidebar.getByRole('tab', { name: 'Add' })).toHaveAttribute('aria-selected', 'true');

  // One of the tile's own controls is using it, not choosing it: Add stays.
  const tile = page.locator('[data-tile="tile-status"]');
  await tile.getByRole('button', { name: /^Actions for / }).click();
  await page.keyboard.press('Escape');
  await expect(sidebar.getByRole('tab', { name: 'Add' })).toHaveAttribute('aria-selected', 'true');

  // A click on the tile's body chooses it, and leaves it the focus.
  await tile.getByTestId('chart-canvas').click({ position: { x: 8, y: 8 } });
  await expect(tile).toHaveAttribute('data-selected', 'true');
  await expect(tile).toBeFocused();
  await expect(sidebar.getByRole('tab', { name: 'Properties' })).toHaveAttribute(
    'aria-selected',
    'true',
  );

  const panel = sidebar.getByRole('tabpanel', { name: 'Properties' });
  const chart = panel.getByRole('region', { name: 'Chart' });
  await expect(chart.getByTestId('properties-chart-title')).toHaveText(
    'Orders by category and status',
  );
  // Its type, as saved, and its cube.
  await expect(chart.getByTestId('properties-chart-type')).toHaveText('Bar · orders');
  await expect(chart.getByRole('button', { name: 'Edit chart' })).toBeVisible();
  await expect(panel.getByRole('region', { name: 'Ownership' })).toBeVisible();
  const marking = panel
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'Marking' }) });
  await expect(marking.getByLabel('Marking', { exact: true })).toBeVisible();
  const layout = panel.locator('details').filter({ hasText: /^Layout/ });
  await layout.getByText('Layout', { exact: true }).click();
  await expect(layout).toContainText('6 / 12 columns · 320 px tall');

  // Each section at the prototype's inset.
  for (const heading of [
    chart.getByRole('heading', { name: 'Chart' }),
    panel.getByRole('region', { name: 'Ownership' }).getByRole('heading'),
    marking.getByRole('heading', { name: 'Marking' }),
    layout.getByText('Layout', { exact: true }),
  ]) {
    expect(Math.abs((await insetOf(heading, panel)) - 12)).toBeLessThanOrEqual(0.5);
  }

  // Edit chart opens the chart editor on it.
  await chart.getByRole('button', { name: 'Edit chart' }).click();
  await expect(page.getByLabel('Cube or view')).toBeVisible();
});

/**
 * Selecting from the Outline is selecting too: its Properties open.
 */
test('selecting a tile from the Outline opens its Properties', async ({ page }) => {
  await edit(page);
  const sidebar = page.getByRole('complementary', { name: 'Edit sidebar' });
  await sidebar.getByRole('tab', { name: 'Outline' }).click();
  await sidebar
    .getByRole('navigation', { name: 'Dashboard outline' })
    .getByRole('button', { name: /Chart: Orders over time/ })
    .click();
  await expect(sidebar.getByRole('tab', { name: 'Properties' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(
    sidebar.getByRole('tabpanel', { name: 'Properties' }).getByTestId('properties-chart-title'),
  ).toHaveText('Orders over time by status');
});

/**
 * T223 / AC-204: WHEN the user chooses Discard in edit mode, THE SYSTEM SHALL
 * restore the dashboard as it was when editing began and return to view mode,
 * whether or not anything was changed.
 * `Fails when: Discard leaves the dashboard in edit mode, or is unavailable
 * with no changes.`
 */
test('Discard puts the dashboard back and leaves edit mode, changes or none', async ({ page }) => {
  await edit(page);
  const bar = page.getByRole('toolbar', { name: 'Dashboard editing' });
  const tiles = page.getByTestId('grid-item');
  const before = await tiles.count();

  // With nothing changed: still the way out.
  await bar.getByRole('button', { name: 'Discard', exact: true }).click();
  await expect(bar).toBeHidden();
  await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeVisible();

  // With a change: undone on the way out.
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page
    .getByRole('complementary', { name: 'Edit sidebar' })
    .getByTestId('add-divider')
    .click();
  await expect(tiles).toHaveCount(before + 1);
  await bar.getByRole('button', { name: /^Discard \(1 change\)/ }).click();
  await expect(bar).toBeHidden();
  await expect(tiles).toHaveCount(before);
});

/**
 * T223 / AC-205: WHEN the user opens a tile's menu in edit mode, THE SYSTEM
 * SHALL list Duplicate first and Delete last, with Save to folders… or Make a
 * local copy, and Move to with its targets between them, every item reachable
 * without scrolling the menu except the Move to targets.
 * `Fails when: Duplicate or Delete must be scrolled to, or an item is missing.`
 */
test('a tile’s edit menu runs Duplicate, ownership, Move to, then Delete, none scrolled to', async ({
  page,
}) => {
  await edit(page);
  // Enough places to move to that the targets outgrow the menu: the case the
  // criterion's "must be scrolled to" is about.
  for (let added = 0; added < 10; added += 1)
    await page.getByRole('button', { name: '+ Page tab' }).click();
  await page.getByRole('tablist', { name: 'Pages' }).getByRole('tab', { name: 'Overview' }).click();
  const tile = page.locator('[data-tile="tile-status"]');
  await tile.getByTestId('tile-menu-tile-status').click();
  const menu = tile.getByRole('list', { name: /^Actions for / });
  const items = menu.locator(':scope > li');
  await expect(items.first()).toContainText('Duplicate');
  await expect(items.nth(1)).toHaveText('Save to folders…');
  await expect(items.nth(2)).toContainText('Move to');
  await expect(items.last()).toHaveText('Delete');
  await expect(
    menu.getByRole('list', { name: /^Move .* to$/ }).getByRole('button'),
  ).not.toHaveCount(0);

  // Duplicate and Delete in the menu's own box, with the menu unscrolled.
  const box = await menu.boundingBox();
  for (const name of ['Duplicate', 'Delete']) {
    const item = await menu.getByRole('button', { name, exact: true }).boundingBox();
    expect(item?.y ?? -1).toBeGreaterThanOrEqual(box?.y ?? 0);
    expect((item?.y ?? 0) + (item?.height ?? 0)).toBeLessThanOrEqual(
      (box?.y ?? 0) + (box?.height ?? 0) + 0.5,
    );
  }
  expect(await menu.evaluate((node) => node.scrollTop)).toBe(0);
  expect(await menu.evaluate((node) => node.scrollHeight <= node.clientHeight + 1)).toBe(true);
  // What scrolls is the targets, and only they.
  const targets = menu.getByRole('list', { name: /^Move .* to$/ });
  expect(await targets.evaluate((node) => node.scrollHeight > node.clientHeight)).toBe(true);

  // "Save to folders…" opens its Properties on the folder to choose.
  await menu.getByRole('button', { name: 'Save to folders…' }).click();
  const properties = page
    .getByRole('complementary', { name: 'Edit sidebar' })
    .getByRole('tabpanel', { name: 'Properties' });
  await expect(properties.getByLabel('Folder')).toBeVisible();
});

/**
 * T223 / AC-206: WHILE a dashboard is in edit mode, THE SYSTEM SHALL mark
 * every tile as editable at rest — its drag grip visible and its outline
 * dashed — title the page "Editing ‹name›", and offer "+ Page tab" in the tab
 * row.
 * `Fails when: a tile's grip is visible only on hover, or either the title or
 * "+ Page tab" is missing.`
 */
test('in edit mode every tile shows its grip and a dashed outline at rest; the title and + Page tab', async ({
  page,
}) => {
  await edit(page);
  // The pointer away from every tile.
  await page.mouse.move(2, 2);
  const tiles = page.locator('.dashboard-page [data-testid="grid-item"]:visible');
  const count = await tiles.count();
  expect(count).toBeGreaterThan(1);
  for (let index = 0; index < count; index += 1) {
    const tile = tiles.nth(index);
    expect(await tile.evaluate((node) => getComputedStyle(node).outlineStyle)).toBe('dashed');
    // A tile's grip, shown without hovering it. Sections and tab groups are
    // containers, not tiles, and are moved from their menus.
    const id = (await tile.getAttribute('data-tile')) ?? '';
    if (!id.startsWith('tile-')) continue;
    const grip = page.getByTestId(`grip-${id}`);
    await expect(grip).toBeVisible();
    expect(await grip.evaluate((node) => getComputedStyle(node).opacity)).toBe('1');
  }

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Editing Company dashboard 01');

  const pages = page.getByRole('tablist', { name: 'Pages' });
  await page.getByRole('button', { name: '+ Page tab' }).click();
  await expect(pages.getByRole('tab')).toHaveText(['Overview', 'Appendix', 'Page 3']);
  await expect(pages.getByRole('tab', { name: 'Page 3' })).toHaveAttribute('aria-selected', 'true');
});
