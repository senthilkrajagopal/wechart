import { expect, test, type Page, type Route } from '@playwright/test';

import { chooseChartType, expectChartType } from './chartType';

/**
 * T032 / AC-034: WHEN the editor is opened from a dashboard tile, THE SYSTEM
 * SHALL offer a preview at the tile's own size and a preview that fills the
 * editor, and SHALL return to the dashboard with the tile updated.
 * Fails when: the preview ignores the tile's width and height, or the
 * dashboard tile does not reflect the applied changes.
 *
 * direction.md §2: the pencil "opens the chart editor as a full-viewport
 * overlay with '← Back to _dashboard_'"; "From view mode, the pencil switches
 * the dashboard into edit mode first"; "Esc = Back (keeps the changes)".
 *
 * The seeded chart on `tile-status` saves `bar`, with one measure and two
 * dimensions, so `stackedBar` is a change it can legally take.
 */
const DASHBOARD = '/explore/dashboards/seed-root-dashboard-1';
const TILE = '[data-tile="tile-status"]';

async function open(page: Page) {
  await page.goto(DASHBOARD);
  await expect(page.getByRole('heading', { name: 'Company dashboard 01' })).toBeVisible();
  await expect(page.locator(TILE).getByTestId('chart-canvas')).toHaveAttribute(
    'data-chart-type',
    'bar',
  );
}

async function openEditorFromPencil(page: Page) {
  await page.getByTestId('edit-chart-tile-status').click();
  await expect(page.getByTestId('chart-editor-overlay')).toBeVisible();
  // The chart it was opened on, loaded — not an empty editor, and not the
  // dashboard's other chart. Both seeded charts are `orders.count`, so the
  // measure alone could not tell them apart; only this one groups by category.
  await expect(page.getByTestId('in-dimensions-products.category')).toBeVisible();
}

const overlay = (page: Page) => page.getByTestId('chart-editor-overlay');
const discard = (page: Page) =>
  page.getByRole('toolbar', { name: 'Dashboard editing' }).getByRole('button', { name: /Discard/ });

test('the pencil opens the editor over the dashboard, in edit mode, with a way back', async ({
  page,
}) => {
  await open(page);

  await openEditorFromPencil(page);

  // Over the dashboard: the dashboard's own heading is gone, replaced by the
  // overlay's, and the way back names the dashboard.
  await expect(page.getByRole('heading', { name: 'Company dashboard 01' })).toBeHidden();
  await expect(overlay(page).getByRole('heading', { name: 'Chart editor' })).toBeVisible();
  await expect(page.getByTestId('editor-back')).toHaveText('← Back to Company dashboard 01');
  // The dashboard was not left for another page: the path is still the
  // dashboard's. (The path, not the whole URL, which names the tile in
  // `?edit=` so a reload and the browser's Back both work — T196, below.)
  expect(new URL(page.url()).pathname).toBe(DASHBOARD);

  await page.getByTestId('editor-back').click();

  // Back on the dashboard — and in edit mode, which the pencil entered.
  await expect(overlay(page)).toBeHidden();
  await expect(page.getByRole('toolbar', { name: 'Dashboard editing' })).toBeVisible();
});

/**
 * T196 / AC-002: WHEN the user opens a workspace, a dashboard, a chart or a
 * model file, THE SYSTEM SHALL change the URL so that reloading it restores the
 * same surface and the same selected object.
 *
 * The chart editor opened from a tile is a surface over the dashboard, so the
 * URL names it — `?edit=<tile>` — a reload restores it, and the browser's Back
 * closes it the way the editor's own Back does: keeping the change.
 */
test.describe('the chart editor in the URL (AC-002)', () => {
  const editUrl = (page: Page) => new URL(page.url()).searchParams.get('edit');

  test('opening it from a tile names the tile in the URL; going back removes it', async ({
    page,
  }) => {
    await open(page);
    await openEditorFromPencil(page);
    await expect.poll(() => editUrl(page)).toBe('tile-status');
    expect(new URL(page.url()).pathname).toBe(DASHBOARD);

    await page.getByTestId('editor-back').click();
    await expect(overlay(page)).toBeHidden();
    await expect.poll(() => editUrl(page)).toBeNull();
  });

  test('reloading it reopens the editor on that tile’s chart, in edit mode', async ({ page }) => {
    await open(page);
    await openEditorFromPencil(page);
    await expect.poll(() => editUrl(page)).toBe('tile-status');

    await page.reload();

    await expect(overlay(page)).toBeVisible();
    await expect(page.getByTestId('in-dimensions-products.category')).toBeVisible();
    await page.getByTestId('editor-back').click();
    await expect(page.getByRole('toolbar', { name: 'Dashboard editing' })).toBeVisible();
    await expect.poll(() => editUrl(page)).toBeNull();
  });

  test('the browser’s Back closes it and keeps the change, as its own Back does', async ({
    page,
  }) => {
    await open(page);
    await openEditorFromPencil(page);
    await expect.poll(() => editUrl(page)).toBe('tile-status');
    await chooseChartType(page, 'stackedBar');

    await page.goBack();

    await expect(overlay(page)).toBeHidden();
    expect(new URL(page.url()).pathname).toBe(DASHBOARD);
    await expect(page.locator(TILE).getByTestId('chart-canvas')).toHaveAttribute(
      'data-chart-type',
      'stackedBar',
    );
    // Still the same edit session, the change in it.
    await expect(discard(page)).toHaveText('Discard (1 change)');
  });

  test('the browser’s Back while the change is being applied stays on the dashboard', async ({
    page,
  }) => {
    /**
     * The editor's own Back on a changed chart draws it before closing
     * ("Applying the change…"). A browser Back in that moment has already taken
     * the tile out of the URL, so the editor closing afterwards must not step
     * back again — that step would leave the dashboard, and the session.
     */
    await open(page);
    await openEditorFromPencil(page);
    await expect.poll(() => editUrl(page)).toBe('tile-status');
    await chooseChartType(page, 'stackedBar');

    const held: Route[] = [];
    const hold = { on: true };
    await page.route('**/api/load', async (route) => {
      if (hold.on) held.push(route);
      else await route.continue();
    });
    await page.getByTestId('editor-back').click();
    await expect(overlay(page)).toContainText('Applying the change…');
    await expect.poll(() => held.length).toBeGreaterThan(0);

    await page.goBack();
    await expect.poll(() => editUrl(page)).toBeNull();
    hold.on = false;
    for (const route of held) await route.continue();

    await expect(overlay(page)).toBeHidden();
    await expect(page.locator(TILE).getByTestId('chart-canvas')).toHaveAttribute(
      'data-chart-type',
      'stackedBar',
    );
    await expect(discard(page)).toHaveText('Discard (1 change)');
    // Still here once the editor has closed, and nothing still to come: the
    // second step back, when it happens, happens as the editor closes.
    await page.waitForTimeout(500);
    expect(new URL(page.url()).pathname).toBe(DASHBOARD);
    await expect(discard(page)).toHaveText('Discard (1 change)');
  });
});

test('the preview starts at the tile’s own width and height', async ({ page }) => {
  await open(page);
  const tile = await page.locator(TILE).boundingBox();
  const tileChart = await page.locator(TILE).getByTestId('chart-canvas').boundingBox();
  expect(tile).not.toBeNull();

  await openEditorFromPencil(page);

  const frame = page.getByTestId('preview-frame');
  await expect(frame).toHaveAttribute('data-size', 'actual');
  const drawn = await frame.boundingBox();
  // The criterion's first failing state: "the preview ignores the tile's
  // width and height". Within a pixel, for sub-pixel rounding.
  expect(Math.abs((drawn?.width ?? 0) - (tile?.width ?? 0))).toBeLessThanOrEqual(1);
  expect(Math.abs((drawn?.height ?? 0) - (tile?.height ?? 0))).toBeLessThanOrEqual(1);

  // And the chart inside it, not only the box: the frame is handed the tile's
  // box outright, so comparing boxes alone could not see a chart drawn at the
  // wrong height within it.
  const previewChart = await frame.getByTestId('chart-canvas').boundingBox();
  expect(Math.abs((previewChart?.height ?? 0) - (tileChart?.height ?? 0))).toBeLessThanOrEqual(1);
});

test('a tile resized in this session is previewed at its new height', async ({ page }) => {
  /**
   * The chart's height used to come from the saved dashboard, not the
   * session's, so a tile made taller and then opened had a frame of the new
   * size with the chart drawn at the old height inside it.
   */
  await open(page);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.locator(TILE).focus();
  await page.keyboard.press('Shift+ArrowDown');
  await page.keyboard.press('Shift+ArrowDown');
  const tileChart = await page.locator(TILE).getByTestId('chart-canvas').boundingBox();

  await page.locator(TILE).focus();
  await page.keyboard.press('e');
  await expect(overlay(page)).toBeVisible();

  const previewChart = await page
    .getByTestId('preview-frame')
    .getByTestId('chart-canvas')
    .boundingBox();
  expect(Math.abs((previewChart?.height ?? 0) - (tileChart?.height ?? 0))).toBeLessThanOrEqual(1);
});

test('Fit fills the editor, and Actual size goes back to the tile', async ({ page }) => {
  // At AC-214's size: between the fields and the inspector (280 and 320 px),
  // a 1,280 px window leaves the preview barely wider than a half-width tile,
  // and the difference Fit makes would not show.
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page);
  const tile = await page.locator(TILE).boundingBox();
  await openEditorFromPencil(page);
  const frame = page.getByTestId('preview-frame');

  await page.getByRole('button', { name: 'Fit' }).click();
  await expect(frame).toHaveAttribute('data-size', 'fit');
  const fitted = await frame.boundingBox();
  const area = await page.getByTestId('editor-result').boundingBox();

  // Fills the preview area — not merely wider than a half-width tile, which a
  // frame filling half the editor would also be.
  expect(fitted?.width ?? 0).toBeGreaterThan((area?.width ?? 0) * 0.9);
  expect(fitted?.width ?? 0).toBeGreaterThan((tile?.width ?? 0) + 50);

  // The tile scaled, keeping its proportions — from the first frame painted,
  // not after a correction (the frame was measured once before the fix and
  // read 380 where 373 was right).
  const aspect = (tile?.height ?? 0) / (tile?.width ?? 1);
  expect(Math.abs((fitted?.height ?? 0) - (fitted?.width ?? 0) * aspect)).toBeLessThanOrEqual(2);

  // And settled. A frame whose height followed its own content could grow on
  // every measurement; one reading could not see that, two a second apart can.
  await page.waitForTimeout(1000);
  const later = await frame.boundingBox();
  expect(later?.height).toBe(fitted?.height);

  await page.getByRole('button', { name: 'Actual size' }).click();
  const actual = await frame.boundingBox();
  expect(Math.abs((actual?.width ?? 0) - (tile?.width ?? 0))).toBeLessThanOrEqual(1);
});

test('going back shows the change on the tile', async ({ page }) => {
  await open(page);
  await openEditorFromPencil(page);

  await chooseChartType(page, 'stackedBar');
  await page.getByTestId('editor-back').click();

  // The criterion's second failing state: "the dashboard tile does not
  // reflect the applied changes".
  await expect(page.locator(TILE).getByTestId('chart-canvas')).toHaveAttribute(
    'data-chart-type',
    'stackedBar',
  );
  // One change, held in the session like any other.
  await expect(discard(page)).toHaveText('Discard (1 change)');
});

test('Discard takes the chart back as well (AC-066)', async ({ page }) => {
  /**
   * AC-066: "restore the dashboard, its chart specs and its settings". The
   * chart-spec clause could not be exercised until now, because the editor
   * was a separate page and a chart edit never passed through the session.
   */
  await open(page);
  await openEditorFromPencil(page);
  await chooseChartType(page, 'stackedBar');
  await page.getByTestId('editor-back').click();
  await expect(page.locator(TILE).getByTestId('chart-canvas')).toHaveAttribute(
    'data-chart-type',
    'stackedBar',
  );

  await discard(page).click();

  await expect(page.locator(TILE).getByTestId('chart-canvas')).toHaveAttribute(
    'data-chart-type',
    'bar',
  );
});

test('Esc goes back and keeps the change', async ({ page }) => {
  await open(page);
  await openEditorFromPencil(page);
  await chooseChartType(page, 'stackedBar');

  await page.getByTestId('editor-back').focus();
  await page.keyboard.press('Escape');

  await expect(overlay(page)).toBeHidden();
  await expect(page.locator(TILE).getByTestId('chart-canvas')).toHaveAttribute(
    'data-chart-type',
    'stackedBar',
  );
});

test('going back without changing anything records nothing', async ({ page }) => {
  /**
   * An untouched editor is left, not saved. Recording it would put "Discard (1
   * change)" on a dashboard exactly as it was — and that count is the only
   * thing telling an editor they have unsaved work.
   */
  await open(page);
  await openEditorFromPencil(page);

  await page.getByTestId('editor-back').click();

  await expect(discard(page)).toHaveText('Discard');
});

test('a chart edited once opens on that edit the second time', async ({ page }) => {
  /**
   * Opened from the server again, the editor would start from the saved chart
   * and the second edit would silently replace the first.
   */
  await open(page);
  await openEditorFromPencil(page);
  await chooseChartType(page, 'stackedBar');
  await page.getByTestId('editor-back').click();
  await expect(overlay(page)).toBeHidden();

  await openEditorFromPencil(page);

  await expectChartType(page, 'stackedBar');
});

// Saving a chart edited from its tile — written with the dashboard for a
// chart local to it, held back for a shared one — is AC-183's, in
// chart-save.spec.ts. Those tests make their own dashboards, because saving
// here would change the seeded chart every other test in this file opens.

test('changing the chart and changing it back records nothing', async ({ page }) => {
  // A new state object with the same content is not a change to the chart.
  await open(page);
  await openEditorFromPencil(page);
  await chooseChartType(page, 'stackedBar');
  await chooseChartType(page, 'bar');

  await page.getByTestId('editor-back').click();

  await expect(discard(page)).toHaveText('Discard');
});

test('Esc straight after choosing a type goes back and keeps it', async ({ page }) => {
  // The realistic case: focus still on the list just used, not on Back.
  await open(page);
  await openEditorFromPencil(page);
  // Chosen from the gallery, which gives focus back to Change: Esc is pressed
  // from there, not from the Back button — the test above's case, not this
  // one's.
  await chooseChartType(page, 'stackedBar');
  await expect(page.getByTestId('chart-type-change')).toBeFocused();

  await page.keyboard.press('Escape');

  await expect(overlay(page)).toBeHidden();
  await expect(page.locator(TILE).getByTestId('chart-canvas')).toHaveAttribute(
    'data-chart-type',
    'stackedBar',
  );
});

test('Esc that closes the search palette leaves the editor open', async ({ page }) => {
  /**
   * The palette opens over the editor. Esc was heard by both, so closing the
   * palette also went back from the editor, applying the draft.
   */
  await open(page);
  await openEditorFromPencil(page);
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+k' : 'Control+k');
  await expect(page.getByRole('dialog', { name: /search/i })).toBeVisible();

  await page.keyboard.press('Escape');

  await expect(page.getByRole('dialog', { name: /search/i })).toBeHidden();
  await expect(overlay(page)).toBeVisible();
});

/**
 * T230's review: the type gallery opens inside the editor over a dashboard,
 * and Esc was heard by both — closing the gallery went back from the editor
 * too, applying the draft.
 */
test('Esc that closes the chart type gallery leaves the editor open, focus on Change', async ({
  page,
}) => {
  await open(page);
  await openEditorFromPencil(page);
  await overlay(page).getByTestId('chart-type-change').click();
  const gallery = page.getByRole('dialog', { name: 'Choose chart type' });
  await expect(gallery).toBeVisible();

  await page.keyboard.press('Escape');

  await expect(gallery).toHaveCount(0);
  await expect(overlay(page)).toBeVisible();
  await expect(overlay(page).getByTestId('chart-type-change')).toBeFocused();
});

test('going back returns focus to what opened the editor', async ({ page }) => {
  // The overlay replaces the dashboard, so its opener is gone by the time the
  // editor closes; focus fell to the page and a keyboard user lost their place.
  await open(page);
  await openEditorFromPencil(page);
  await page.getByTestId('editor-back').click();
  await expect(page.getByTestId('edit-chart-tile-status')).toBeFocused();

  await page.locator(TILE).focus();
  await page.keyboard.press('e');
  await expect(overlay(page)).toBeVisible();
  await page.getByTestId('editor-back').click();
  await expect(page.locator(TILE)).toBeFocused();
});

test('a tile on a later tab is still on screen, and focused, after going back', async ({
  page,
}) => {
  /**
   * A tab group's open tab is its own state. When the overlay replaced the
   * dashboard, that state went with it, so the group came back on its first
   * tab: the tile just edited was not on screen, and focus had nowhere to go.
   */
  await page.goto('/explore/dashboards/seed-dashboard-recommended');
  await page.getByRole('tab', { name: 'Chart', exact: true }).click();
  const tabbed = page.locator('[data-tile="tile-tabbed"]');
  await expect(tabbed.getByTestId('chart-canvas')).toBeVisible();

  await page.getByTestId('edit-chart-tile-tabbed').click();
  await expect(overlay(page)).toBeVisible();
  await page.getByTestId('editor-back').click();

  await expect(tabbed.getByTestId('chart-canvas')).toBeVisible();
  await expect(page.getByTestId('edit-chart-tile-tabbed')).toBeFocused();
});

test('the dashboard is where it was scrolled to, after going back', async ({ page }) => {
  // AC-067: "either scroll position resets after a re-render". An overlay that
  // unmounted the dashboard brought it back at the top.
  await open(page);
  // In edit mode first. The pencil enters it, and edit mode lays the canvas
  // out differently (the edit bar, the Add slots between tiles), so a scroll
  // position taken in view mode is not comparable with one taken after.
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  const canvas = page.getByTestId('canvas-scroll');
  await canvas.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  const before = await canvas.evaluate((element) => element.scrollTop);
  expect(before).toBeGreaterThan(0);

  await page.getByTestId('edit-chart-tile-region').click();
  await expect(overlay(page)).toBeVisible();
  await page.getByTestId('editor-back').click();
  await expect(overlay(page)).toBeHidden();

  expect(await canvas.evaluate((element) => element.scrollTop)).toBe(before);
});

test('a chart edited from its tile keeps its number format there', async ({ page }) => {
  /**
   * Formats were applied to the saved charts before a draft replaced one, so a
   * currency tile read "76,900" after Back where the preview had just shown
   * "$76,900.00".
   */
  await page.goto('/explore/dashboards/seed-dashboard-formats');
  const revenue = page.locator('[data-tile="tile-revenue"]');
  await expect(revenue.getByTestId('chart-canvas')).toBeVisible();

  await page.getByTestId('edit-chart-tile-revenue').click();
  await expect(overlay(page)).toBeVisible();
  await chooseChartType(page, 'hbar');
  await page.getByTestId('editor-back').click();
  await expect(revenue.getByTestId('chart-canvas')).toHaveAttribute('data-chart-type', 'hbar');

  await expect(
    revenue
      .locator('svg text')
      .filter({ hasText: /^\$[\d,.KMB]+$/ })
      .first(),
  ).toBeVisible();
});

test('the editor’s results drawer writes a value in its member’s format (AC-046, T201)', async ({
  page,
}) => {
  /**
   * T195's review: nothing showed the editor passes the model's formats to
   * its drawer. The seeded revenue chart sums a `currency` measure, which
   * Cube writes as `$,.2~f`.
   */
  await page.goto('/explore/dashboards/seed-dashboard-formats');
  await expect(
    page.locator('[data-tile="tile-revenue"]').getByTestId('chart-canvas'),
  ).toBeVisible();
  await page.getByTestId('edit-chart-tile-revenue').click();
  await expect(overlay(page)).toBeVisible();

  await overlay(page).getByRole('button', { name: 'Results' }).click();

  const cells = overlay(page).getByTestId('drawer-result-rows').locator('td');
  await expect(cells.filter({ hasText: /^\$[\d,]+(\.\d?[1-9])?$/ }).first()).toBeVisible();
});
