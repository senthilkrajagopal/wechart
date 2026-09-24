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
