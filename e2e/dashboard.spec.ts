import { expect, test, type Page } from '@playwright/test';

/**
 * T023. The seeded dashboard, opened for real.
 *
 * AC-018: WHEN the user opens a dashboard from Explore, THE SYSTEM SHALL open
 * it in view mode with its saved page tabs, tiles and settings.
 * AC-053: WHEN the user activates Edit, THE SYSTEM SHALL show the edit bar
 * with Undo, Redo, Discard and Save, and the edit sidebar with Add, Outline
 * and Properties.
 * AC-054: WHILE editing, THE SYSTEM SHALL show a 12-column grid on the canvas.
 * AC-039: THE SYSTEM SHALL give a member the same colour in every tile.
 *
 * The components behind all four are unit-tested, but unit tests cannot show
 * that anything renders them, that the CSS paints, or that a mark comes out
 * the colour it was assigned. That is what this file is for — and it is why
 * these criteria were left unticked at T059 and T060.
 */
const DASHBOARD = '/explore/dashboards/seed-root-dashboard-1';

const open = async (page: Page) => {
  await page.goto(DASHBOARD);
  await expect(page.getByRole('heading', { name: 'Company dashboard 01' })).toBeVisible();
};

test('opens in view mode with its saved pages, tiles and settings', async ({ page }) => {
  await open(page);

  // View mode, not edit mode: the criterion fails if it opens ready to edit.
  await expect(page.getByRole('toolbar', { name: 'Dashboard editing' })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeVisible();

  // Both saved page tabs.
  const pages = page.getByRole('tablist', { name: 'Pages' });
  await expect(pages.getByRole('tab')).toHaveText(['Overview', 'Appendix']);

  // Every saved tile on the open page, the one inside the section included.
  // The section is a grid item too, taking a position on the page's grid the
  // way a tile does, so it is counted here.
  await expect(page.getByTestId('grid-item')).toHaveCount(4);
  await expect(page.getByText('Orders by status, this quarter.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Detail' })).toBeVisible();

  // And the saved setting, as painted rather than as an attribute: a setting
  // that is read back and then ignored is a setting that did not survive.
  const surface = page.getByTestId('dashboard-page');
  await expect(surface).toHaveAttribute('data-width', 'fixed');
  expect(await surface.evaluate((node) => getComputedStyle(node).maxWidth)).toBe('1440px');
});

/**
 * AC-042 (reopened 2026-09-24): WHEN a chart … fails, THE SYSTEM SHALL show an
 * error state offering Retry and the error details.
 * `Fails when: … the error state offers no Retry or no details.`
 *
 * The component always could; the dashboard never passed it `onRetry`, so on
 * a dashboard — where every chart a user sees is drawn — there was no Retry.
 */
test('a tile still loading shows a skeleton in the shape of its chart', async ({ page }) => {
  // AC-042's first half: "loading shows an empty tile" is its failing state.
  const held: import('@playwright/test').Route[] = [];
  let released = false;
  await page.route('**/api/load', async (route) => {
    if (released) await route.continue();
    else held.push(route);
  });
  await page.goto(DASHBOARD);

  const skeleton = page.getByTestId('tile-skeleton').first();
  await expect(skeleton).toBeVisible();
  // Shaped, not a generic spinner: the skeleton names the chart it stands for.
  await expect(skeleton).toHaveAttribute('data-shape', /\w+/);

  // Released, the skeleton gives way to the chart.
  released = true;
  for (const route of held.splice(0)) await route.continue();
  await expect(page.getByTestId('chart-canvas').first()).toBeVisible();
  await expect(page.getByTestId('tile-skeleton')).toHaveCount(0);
});

test('a tile whose query fails offers Retry and the error, and Retry draws it', async ({
  page,
}) => {
  // Every query refused, as a Cube that is down refuses it.
  await page.route('**/api/load', (route) =>
    route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: '{"error":"Cube is down"}',
    }),
  );
  await open(page);

  const failed = page.getByRole('alert').filter({ hasText: 'Could not load this chart' }).first();
  await expect(failed).toBeVisible();
  await expect(failed).toContainText('Cube is down');
  // The tile keeps its title, so the reader knows which chart failed.
  const tile = page
    .getByTestId('grid-item')
    .filter({ has: page.getByRole('alert') })
    .first();
  await expect(tile.getByRole('heading', { level: 3 })).not.toHaveText('');
  // The details the criterion names: the query that failed, one control away.
  await failed.getByRole('button', { name: 'Show query' }).click();
  await expect(failed.getByTestId('tile-error-query')).toContainText('measures');

  // Cube is back; Retry asks again, and the chart is drawn in its place.
  await page.unroute('**/api/load');
  await failed.getByRole('button', { name: 'Retry' }).click();
  await expect(page.getByTestId('chart-canvas').first()).toBeVisible();
});

test('a chart that cannot be read for a network failure is not called missing', async ({
  page,
}) => {
  /**
   * "This chart is no longer available" is for a chart that is gone. A
   * request that never reached the server says nothing about whether it is,
   * and telling someone their chart was deleted when their network dropped
   * sends them looking for who deleted it.
   */
  await open(page);
  await expect(page.getByTestId('chart-canvas').first()).toBeVisible();

  // The network drops, then the reader refreshes a tile — the path that
  // reads the chart again, and where the dropped request was taken for a
  // deleted chart.
  await page.route('**/api/documents/chart/**', (route) => route.abort('internetdisconnected'));
  await page
    .getByRole('button', { name: /^Refresh / })
    .first()
    .click();

  const failed = page.getByRole('alert').filter({ hasText: 'Could not load this chart' }).first();
  await expect(failed).toBeVisible();
  // Not its sentence inside the error: the critique found "Could not load
  // this chart / This chart is no longer available." for a request that
  // never reached the server.
  await expect(failed).not.toContainText('no longer available');

  // The network is back; Retry reads the chart again and draws it.
  await page.unroute('**/api/documents/chart/**');
  await failed.getByRole('button', { name: 'Retry' }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Could not load this chart' }),
  ).toHaveCount(0);
});

test('a chart that is gone says so, and offers no Retry that could only fail', async ({ page }) => {
  await open(page);
  await expect(page.getByTestId('chart-canvas').first()).toBeVisible();

  // The server says the chart does not exist.
  await page.route('**/api/documents/chart/**', (route) =>
    route.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"Not found"}' }),
  );
  await page
    .getByRole('button', { name: /^Refresh / })
    .first()
    .click();

  const missing = page.getByTestId('tile-missing-chart').first();
  await expect(missing).toHaveText(/no longer available/);
  await expect(page.getByRole('button', { name: 'Retry' })).toHaveCount(0);
});

test('opens the other saved page tab', async ({ page }) => {
  await open(page);
  await page.getByRole('tablist', { name: 'Pages' }).getByRole('tab', { name: 'Appendix' }).click();

  await expect(page.getByRole('heading', { name: 'Definitions' })).toBeVisible();
  // The heading, the section holding the tab group, the group itself, and the
  // one tile in its open tab.
  await expect(page.getByTestId('grid-item')).toHaveCount(4);
});

test('activating Edit reveals the edit bar and the sidebar', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();

  const bar = page.getByRole('toolbar', { name: 'Dashboard editing' });
  // By name: Undo and Redo are icon buttons, named by aria-label (AC-187).
  const names = ['Undo', 'Redo', 'Discard', 'Save'];
  await expect(bar.getByRole('button')).toHaveCount(names.length);
  for (const [index, name] of names.entries())
    await expect(bar.getByRole('button').nth(index)).toHaveAccessibleName(name);

  const sidebar = page.getByRole('complementary', { name: 'Edit sidebar' });
  await expect(sidebar.getByRole('tab')).toHaveText(['Add', 'Outline', 'Properties']);
});

/**
 * AC-053 (reopened 2026-09-24): the Outline tab was a panel with nothing in
 * it. It is the dashboard's tree — page tabs, then their elements, sections
 * and tab groups nested — and a row selects its element, as the prototype's
 * `outline()` does.
 */
test('the Outline shows the dashboard as a tree, and a row selects its element', async ({
  page,
}) => {
  await open(page);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  const sidebar = page.getByRole('complementary', { name: 'Edit sidebar' });
  await sidebar.getByRole('tab', { name: 'Outline' }).click();

  const outline = sidebar.getByRole('navigation', { name: 'Dashboard outline' });
  // Every element the seed saves, each by what a reader knows it by — its
  // chart's title, its text — and never by an id.
  await expect(outline.getByRole('button')).toHaveText([
    /Chart: Orders by category and status$/,
    /Markdown: Orders by status, this quarter\.$/,
    /Section: Detail$/,
    /Chart: Orders over time by status$/,
    /Header: Definitions$/,
    /Section: Terms$/,
    /Tab group: Measures, Dimensions$/,
    /Markdown: Count is the number of orders\.$/,
  ]);
  await expect(outline).toContainText('Page: Overview');
  await expect(outline).toContainText('Page: Appendix');
  // Nesting is structural: the section's chart is inside the section's item.
  const detail = outline
    .getByRole('listitem')
    .filter({ has: page.getByRole('button', { name: /Section: Detail$/ }) });
  await expect(detail.getByRole('button', { name: /Chart: Orders over time/ })).toBeVisible();

  // A row selects its element on the canvas, and brings it into view.
  await outline.getByRole('button', { name: /Chart: Orders over time/ }).click();
  const region = page.locator('[data-tile="tile-region"]');
  await expect(region).toHaveAttribute('data-selected', 'true');
  await expect(region).toBeInViewport();

  // One on the page tab that is not open opens that page to select it.
  await outline.getByRole('button', { name: /Header: Definitions$/ }).click();
  await expect(
    page.getByRole('tablist', { name: 'Pages' }).getByRole('tab', { name: 'Appendix' }),
  ).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('[data-tile="tile-heading"]')).toHaveAttribute('data-selected', 'true');

  // And one in a tab group's tab that is not showing shows that tab — else
  // the element has no box on the canvas to select (T209's review).
  const group = page.locator('[data-tab-group="group-terms"]');
  await group.getByRole('tab', { name: 'Dimensions' }).click();
  await outline.getByRole('button', { name: /Markdown: Count is the number/ }).click();
  await expect(group.getByRole('tab', { name: 'Measures' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.locator('[data-tile="tile-measures"]')).toHaveAttribute(
    'data-selected',
    'true',
  );
});

test('the canvas is actually painted with a 12-column grid while editing', async ({ page }) => {
  await open(page);
  const canvas = page.getByTestId('grid-canvas').first();

  const before = await canvas.evaluate((node) => getComputedStyle(node).backgroundImage);
  // In view mode the gridlines would be chrome over the data.
  expect(before).toBe('none');

  await page.getByRole('button', { name: 'Edit', exact: true }).click();

  const painted = await canvas.evaluate((node) => getComputedStyle(node).backgroundImage);
  // The data- attribute is the switch; this is the painting. A rule that was
  // deleted or whose selector stopped matching leaves the attribute set and
  // the canvas blank, which is the failure a unit test cannot see.
  expect(painted).toContain('repeating-linear-gradient');

  // And the lines have to fall on the real tracks. The period is one column
  // pitch: a track plus its gutter, which for 12 columns and 11 gutters of
  // 16px is (width + 16) / 12.
  const { period, width } = await canvas.evaluate((node) => ({
    period: getComputedStyle(node).backgroundImage,
    width: node.getBoundingClientRect().width,
  }));
  // The browser keeps the period as a calc of a percentage and a length —
  // `calc(8.33333% + 1.33333px)` — because a percentage of the element cannot
  // be resolved until it is laid out. Resolve it here against the measured
  // width and compare with the pitch the tiles are actually on.
  const calc = /calc\(([\d.]+)%\s*\+\s*([\d.]+)px\)/.exec(period);
  expect(calc).not.toBeNull();

  const found = (Number(calc?.[1]) / 100) * width + Number(calc?.[2]);
  const expected = (width + 16) / 12;

  expect(found).toBeGreaterThan(1);
  expect(Math.abs(found - expected)).toBeLessThan(0.5);
});

test('dragging a tile edge resizes it and shows the live readout', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();

  const tile = page.locator('[data-tile="tile-status"]');
  const before = (await tile.boundingBox())?.width ?? 0;
  expect(before).toBeGreaterThan(0);

  const handle = page.getByTestId('resize-tile-status-e');
  const box = await handle.boundingBox();
  expect(box).not.toBeNull();

  const canvas = page.getByTestId('grid-canvas').first();
  const faint = await canvas.evaluate((node) => getComputedStyle(node).backgroundImage);

  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  // Moved in steps, so the readout is live rather than something drawn once
  // at the end — and far enough to cross at least one column pitch.
  await page.mouse.move(box!.x + 120, box!.y, { steps: 8 });

  // direction.md asks for a stronger grid during a resize, not merely a
  // different attribute.
  const strong = await canvas.evaluate((node) => getComputedStyle(node).backgroundImage);
  expect(strong).not.toBe(faint);
  expect(strong).toContain('repeating-linear-gradient');

  const readout = page.getByTestId('resize-readout');
  await expect(readout).toBeVisible();

  // All three parts rule 36 names, in the shape direction.md writes them.
  await expect(readout).toHaveText(/^\d+ \/ 12 cols · \d+% · \d+ px$/);
  const during = await readout.textContent();

  await page.mouse.up();
  await expect(readout).toBeHidden();

  // And the tile actually changed, which is the other half of the criterion.
  const after = (await tile.boundingBox())?.width ?? 0;
  expect(after).toBeGreaterThan(before);

  /**
   * The readout said how many columns, and the tile ended up spanning exactly
   * that many. Compared against the grid span rather than against a column
   * count recomputed from pixels: sub-pixel widths round differently between
   * engines, so pixel arithmetic here fails on Firefox for reasons that have
   * nothing to do with the criterion.
   */
  const span = await tile.evaluate((node) => (node as HTMLElement).style.gridColumn);
  expect(during).toContain(`${span.replace('span ', '')} / 12 cols`);
});

test('dragging a tile by its grip shows a drop marker and moves it', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();

  const page1 = page.locator('[data-container="page:overview"]');
  const idsOnPage = () =>
    page1.evaluate((node) =>
      [...node.children]
        .filter((child) => child.hasAttribute('data-tile'))
        .map((child) => child.getAttribute('data-tile')),
    );

  expect(await idsOnPage()).toEqual(['tile-status', 'tile-notes', 'section-detail']);

  const grip = page.getByTestId('grip-tile-status');
  const from = await grip.boundingBox();
  const onto = await page.locator('[data-tile="tile-notes"]').boundingBox();

  await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2);
  await page.mouse.down();
  // Past the far half of the neighbouring tile, so the insertion point is
  // after it rather than before.
  await page.mouse.move(onto!.x + onto!.width * 0.8, onto!.y + onto!.height / 2, { steps: 10 });

  // "Fails when: no drop marker appears" — so it has to be on screen, and
  // somewhere, not a zero-sized element that technically exists.
  const marker = page.getByTestId('drop-marker');
  await expect(marker).toBeVisible();
  const markerBox = await marker.boundingBox();
  expect(markerBox!.height).toBeGreaterThan(0);

  await page.mouse.up();
  await expect(marker).toBeHidden();

  expect(await idsOnPage()).toEqual(['tile-notes', 'tile-status', 'section-detail']);
});

test('dropping a tile on a page tab moves it to that page', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();

  const grip = page.getByTestId('grip-tile-notes');
  const from = await grip.boundingBox();
  const tab = page.getByRole('tablist', { name: 'Pages' }).getByRole('tab', { name: 'Appendix' });
  const onto = await tab.boundingBox();

  await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2);
  await page.mouse.down();
  await page.mouse.move(onto!.x + onto!.width / 2, onto!.y + onto!.height / 2, { steps: 10 });

  await expect(page.getByTestId('drop-marker')).toBeVisible();
  await page.mouse.up();

  // The criterion's own failing state: "a drop on a tab label leaves the tile
  // in its original container".
  await expect(page.locator('[data-tile="tile-notes"]')).toHaveCount(0);

  await tab.click();
  await expect(page.locator('[data-tile="tile-notes"]')).toHaveCount(1);
});

test('dropping a tile on a tab-group label moves it into that tab', async ({ page }) => {
  // The criterion names two kinds of label — a page tab and a tab-group label
  // — and they are different code paths reaching different containers. The
  // page tab is covered above; this is the other one.
  await open(page);
  await page.getByRole('tablist', { name: 'Pages' }).getByRole('tab', { name: 'Appendix' }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();

  const group = page.getByRole('tablist', { name: /Tabs in/ });
  const dimensions = group.getByRole('tab', { name: 'Dimensions' });
  await expect(dimensions).toBeVisible();

  const grip = page.getByTestId('grip-tile-heading');
  const from = await grip.boundingBox();
  const onto = await dimensions.boundingBox();

  await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2);
  await page.mouse.down();
  await page.mouse.move(onto!.x + onto!.width / 2, onto!.y + onto!.height / 2, { steps: 10 });

  await expect(page.getByTestId('drop-marker')).toBeVisible();
  await page.mouse.up();

  // The tile has left the page's own items...
  await expect(page.locator('[data-tile="tile-heading"]')).toHaveCount(0);

  // ...and is in the Dimensions tab, which was empty before.
  await dimensions.click();
  await expect(page.locator('[data-tile="tile-heading"]')).toHaveCount(1);
});

test('a focused tile answers all four keys the criterion names', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();

  const tile = page.locator('[data-tile="tile-status"]');
  const page1 = page.locator('[data-container="page:overview"]');
  const idsOnPage = () =>
    page1.evaluate((node) =>
      [...node.children]
        .filter((child) => child.hasAttribute('data-tile'))
        .map((child) => child.getAttribute('data-tile')),
    );

  await tile.focus();
  await expect(tile).toBeFocused();

  // Move.
  expect(await idsOnPage()).toEqual(['tile-status', 'tile-notes', 'section-detail']);
  await page.keyboard.press('ArrowRight');
  expect(await idsOnPage()).toEqual(['tile-notes', 'tile-status', 'section-detail']);

  // Focus has to survive a change, or the second of two presses goes
  // nowhere — so this one does not re-focus in between.
  await page.keyboard.press('ArrowLeft');
  expect(await idsOnPage()).toEqual(['tile-status', 'tile-notes', 'section-detail']);

  // Resize, both axes: the criterion says Shift and the arrow keys, and
  // width alone would leave half of that untried in a browser.
  const sizeOf = () =>
    tile.evaluate((node) => ({
      columns: (node as HTMLElement).style.gridColumn,
      height: (node as HTMLElement).style.height,
    }));

  const before = await sizeOf();
  await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('Shift+ArrowDown');
  const after = await sizeOf();

  expect(after.columns).not.toBe(before.columns);
  expect(Number.parseInt(after.height, 10)).toBe(Number.parseInt(before.height, 10) + 8);

  // Delete. Undo brings it back, which is what makes the key safe to press.
  await page.keyboard.press('Delete');
  await expect(page.locator('[data-tile="tile-status"]')).toHaveCount(0);

  // The edit bar's Undo specifically: since AC-060 there is a second one in
  // the toast, which is the point of that criterion.
  await page
    .getByRole('toolbar', { name: 'Dashboard editing' })
    .getByRole('button', { name: 'Undo' })
    .click();
  await expect(page.locator('[data-tile="tile-status"]')).toHaveCount(1);
});

test('E on a focused tile opens its chart editor', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();

  await page.locator('[data-tile="tile-status"]').focus();
  await page.keyboard.press('e');

  // The fourth key. Where it lands is AC-034's business; that it opens the
  // chart editor is this criterion's — so the editor has to have rendered.
  //
  // Since T032 it opens over the dashboard rather than navigating away: the
  // path stays the dashboard's and, since T196, `?edit=` names the tile. What
  // matters more is that the editor is open on *this tile's* chart. Both
  // seeded charts count orders, so the measure could not tell them apart; only
  // this one groups by category. Until T191 the editor opened blank whichever
  // chart it came from.
  await expect(page.getByTestId('chart-editor-overlay')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Chart editor' })).toBeVisible();
  await expect(page.getByLabel('Cube or view')).toHaveValue('orders');
  await expect(page.getByTestId('in-measures-orders.count')).toBeVisible();
  await expect(page.getByTestId('in-dimensions-products.category')).toBeVisible();
  await expect.poll(() => new URL(page.url()).searchParams.get('edit')).toBe('tile-status');
});

test('the Add panel offers every element type and inserts one', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();

  const sidebar = page.getByRole('complementary', { name: 'Edit sidebar' });
  await sidebar.getByRole('tab', { name: 'Add' }).click();

  // All ten the criterion lists, by the names a user reads, in order. The
  // labels alone: the hints beside them are explanatory copy, and pinning
  // their wording here would make this fail for a reworded sentence rather
  // than for a missing element type.
  const palette = sidebar.getByRole('list', { name: 'Elements to add' });
  await expect(palette.locator('.add-panel__label')).toHaveText([
    'Chart',
    'Chart from folders',
    'Section',
    'Tabs',
    'Markdown',
    'Header',
    'Divider',
    'Image',
    'Link / button',
    'Filter',
  ]);

  const before = await page.getByTestId('grid-item').count();
  await page.getByTestId('add-header').click();

  await expect(page.getByTestId('grid-item')).toHaveCount(before + 1);
  await expect(page.getByRole('heading', { name: 'New heading' })).toBeVisible();

  // And the panel now aims at what was just added, so a second insert follows
  // the first rather than stacking in front of it.
  await expect(page.getByTestId('add-destination')).toHaveText(
    'Adds to Overview, after header: New heading.',
  );
});

/**
 * T075. Not AC-069's own clause — the defect its cold review found.
 *
 * Reading a dashboard rebuilt the body as four named fields, and a save sends
 * the document it was given, so `folderId` and `owner` were dropped on the way
 * out. `folder_id` is a column derived from `body->>'folderId'`, so the
 * dashboard left its folder with nobody moving it: AC-017's failing state
 * reached by saving. T075 is what made it reachable without editing anything —
 * gear, Save settings, gone.
 *
 * Asserted against the stored body rather than the browser, because that is
 * where the loss happened and where a future rebuild would happen again.
 */
test('saving a dashboard keeps the fields the editor never shows', async ({ page, request }) => {
  const unique = `keeps-${String(Date.now())}-${String(Math.round(Math.random() * 1e6))}`;
  const created = await request.post('http://localhost:4100/api/documents', {
    data: { kind: 'dashboard', title: `Keeper ${unique}`, folderId: 'root' },
  });
  const { id } = (await created.json()) as { id: string };

  await request.put(`http://localhost:4100/api/documents/dashboard/${id}`, {
    data: {
      version: 1,
      body: {
        schemaVersion: 1,
        title: `Keeper ${unique}`,
        folderId: 'root',
        owner: 'admin',
        settings: { width: 'fixed' },
        pages: [{ id: 'only', title: 'Only', items: [{ id: 't1', kind: 'chart', w: 6, h: 40 }] }],
      },
    },
  });

  await page.goto(`/explore/dashboards/${id}`);
  await expect(page.getByRole('heading', { name: `Keeper ${unique}` })).toBeVisible();

  // The shortest path to a save there is: no edit, just the gear.
  await page.getByRole('button', { name: 'Dashboard settings' }).click();
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByRole('heading', { name: `Keeper ${unique}` })).toBeVisible();

  const after = await request.get(`http://localhost:4100/api/documents/dashboard/${id}`);
  const stored = (await after.json()) as { body: { folderId?: string; owner?: string } };
  expect(stored.body.folderId).toBe('root');
  expect(stored.body.owner).toBe('admin');
});

/**
 * T081 / AC-075: WHEN the page width setting changes, THE SYSTEM SHALL render
 * the dashboard centred at 1,440 pixels or across the full width, according to
 * the setting.
 * `Fails when: the rendered canvas width does not follow the setting.`
 *
 * "Rendered" is the word, so this measures painted pixels rather than the
 * attribute the stylesheet keys off — a `data-width` that changed while the
 * CSS did not would satisfy the jsdom tests and fail the criterion. Both
 * positions are measured, because a rule that never constrains anything
 * satisfies "full width" perfectly.
 */
test('the dashboard is painted at the width the setting asks for', async ({ page, request }) => {
  // Wide enough that 1,440px is a real constraint rather than the same thing
  // as full width.
  await page.setViewportSize({ width: 1800, height: 900 });

  const unique = `width-${String(Date.now())}-${String(Math.round(Math.random() * 1e6))}`;
  const created = await request.post('http://localhost:4100/api/documents', {
    data: { kind: 'dashboard', title: `Wide ${unique}`, folderId: 'root' },
  });
  const { id } = (await created.json()) as { id: string };

  await page.goto(`/explore/dashboards/${id}`);
  await expect(page.getByRole('heading', { name: `Wide ${unique}` })).toBeVisible();

  const surface = page.getByTestId('dashboard-page');
  const paintedWidth = async () =>
    surface.evaluate((node) => Math.round(node.getBoundingClientRect().width));

  // A new dashboard starts fixed (AC-072's body), so it is constrained.
  await expect(surface).toHaveAttribute('data-width', 'fixed');
  expect(await paintedWidth()).toBe(1440);

  await page.getByRole('button', { name: 'Dashboard settings' }).click();
  await page.getByRole('button', { name: 'Layout' }).click();
  await page.getByRole('radio', { name: /Full width/ }).click();
  await page.getByRole('button', { name: 'Save settings' }).click();

  await expect(surface).toHaveAttribute('data-width', 'full');
  // Wider than the fixed cap, and the whole pane: full width means the canvas,
  // not the window, because the canvas is what the dashboard lives in.
  const full = await paintedWidth();
  expect(full).toBeGreaterThan(1440);
  const canvas = await page
    .getByTestId('canvas-scroll')
    .evaluate((node) => Math.round(node.clientWidth));
  expect(full).toBe(canvas);
});

/**
 * T215 / AC-197: WHEN the user opens a dashboard's settings, THE SYSTEM SHALL
 * let the user change its name, its folder and its description under General,
 * and Explore SHALL show that description beneath the dashboard's name.
 * `Fails when: the folder or the description cannot be changed there, or a
 * saved description does not appear in Explore.`
 */
test('General settings move a dashboard and describe it, and Explore shows both', async ({
  page,
  request,
}) => {
  const created = (await (
    await request.post('http://localhost:4100/api/documents', {
      data: { kind: 'dashboard', title: `Settled ${String(Date.now())}`, folderId: 'root' },
    })
  ).json()) as { id: string };
  await page.goto(`/explore/dashboards/${created.id}`);
  await page.getByRole('button', { name: 'Dashboard settings' }).click();

  const panel = page.getByRole('region', { name: 'General settings' });
  await panel.getByLabel('Folder').selectOption({ label: 'Finance' });
  await panel.getByLabel('Description').fill('Revenue and orders since July 1996');
  await page.getByRole('button', { name: 'Save settings' }).click();
  // Saved before leaving: the page closes once the save has landed, and
  // navigating while it is still out could cancel it.
  await expect(page.getByTestId('dashboard-settings')).toBeHidden();

  // In Finance now, not at the root, with its description beneath its name.
  await page.goto('/explore');
  await page.getByRole('tree').getByRole('button', { name: 'Finance' }).click();
  await expect(page.getByTestId(`item-${created.id}`)).toContainText(
    'Revenue and orders since July 1996',
  );
});

/**
 * T075 / AC-069. The page itself is plain DOM and jsdom covers it; what jsdom
 * cannot show is that the gear is reachable in the assembled app at all, and
 * that a full-viewport page really does take the dashboard's place rather than
 * leaving it visible behind.
 */
test('the gear opens a settings page with its five sections and a way back', async ({ page }) => {
  await open(page);

  await page.getByRole('button', { name: 'Dashboard settings' }).click();

  const nav = page.getByRole('navigation', { name: 'Settings sections' });
  /**
   * Anchored patterns rather than exact strings, because each mode section's
   * visible text also carries its Active/Inactive label (AC-070). This keeps
   * what `toHaveText` gives and a `dataset` read does not: it retries until
   * the overlay has committed, and it asserts the names are actually *visible*
   * — against attributes alone, a nav of unlabelled buttons would pass.
   */
  await expect(nav.getByRole('button')).toHaveText([
    /^General/,
    /^Interactions/,
    /^Markings/,
    /^Cross-filtering/,
    /^Layout/,
  ]);

  // T076 / AC-070: exactly one mode active, the other labelled, in the real
  // app. A dashboard saved before interactions existed — which the seeded one
  // is — has to read as Markings rather than as neither.
  await expect(nav.locator('[data-section="Markings"]')).toContainText('Active');
  await expect(nav.locator('[data-section="Cross-filtering"]')).toContainText('Inactive');

  // The dashboard is out of sight and out of reach — full-viewport, as
  // direction.md and AC-069 ask. Changed at T032: this used to assert the
  // tiles were gone from the page, because the page replaced the dashboard.
  // That unmounted it, so every tab group reopened on its first tab and both
  // panes came back at the top (AC-067). It now stays mounted beneath, hidden
  // and inert; what the user can see and reach is what is asserted.
  await expect(page.getByTestId('grid-item')).not.toHaveCount(0);
  await expect(page.getByTestId('grid-item').filter({ visible: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0);

  await page.getByRole('button', { name: 'Cancel' }).click();

  await expect(page.getByRole('heading', { name: 'Company dashboard 01' })).toBeVisible();
  await expect(page.getByTestId('grid-item')).toHaveCount(4);
});

/**
 * T074 / AC-068. The model tests hold what a template inserts; this holds that
 * a user can reach one in the running app and that what lands on the canvas is
 * visibly empty and says so.
 *
 * The seeded dashboard is only read here, never saved, so this does not write
 * to the shared database the way the save tests have to.
 */
test('a section template lays out empty charts that say what they need', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();

  const sidebar = page.getByRole('complementary', { name: 'Edit sidebar' });
  await sidebar.getByRole('tab', { name: 'Add' }).click();

  const templates = sidebar.getByRole('list', { name: 'Section templates' });
  await expect(templates.locator('.add-panel__label')).toHaveText([
    'KPI row',
    'Two charts',
    'Chart with notes',
  ]);

  const before = await page.getByTestId('grid-item').count();
  await page.getByTestId('template-kpis').click();

  await expect(page.getByTestId('grid-item')).toHaveCount(before + 4);

  // Four empty tiles, each naming the well and the member type it still wants
  // — not "This chart is no longer available", which is what a tile bound to
  // nothing said before this task.
  const empty = page.getByTestId('tile-empty-chart');
  await expect(empty).toHaveCount(4);
  await expect(empty.first()).toContainText('needs a measure in Measures');
  await expect(page.getByTestId('tile-missing-chart')).toHaveCount(0);

  // One change for the whole layout, not one per tile.
  await expect(page.getByRole('button', { name: /^Discard/ })).toHaveText('Discard (1 change)');
});

test('a tab group added to a page is wrapped in a section, and says so', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page
    .getByRole('complementary', { name: 'Edit sidebar' })
    .getByRole('tab', { name: 'Add' })
    .click();

  const sectionsBefore = await page.locator('.dashboard-section').count();
  await page.getByTestId('add-tabs').click();

  // direction.md rule 37: a tab group can exist only inside a section. The
  // criterion's failing state is one created directly on a page tab.
  await expect(page.locator('.dashboard-section')).toHaveCount(sectionsBefore + 1);
  await expect(page.getByRole('tablist', { name: /Tabs in/ })).toHaveCount(1);

  // And the other half: nothing explaining it.
  await expect(page.getByTestId('add-message')).toContainText(/section/i);
});

test('a delete offers an undo in a toast, restoring the contents too', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();

  const idsOn = () =>
    page
      .getByTestId('grid-item')
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-tile')));
  const before = await idsOn();

  // The section holds a chart, and "restoring the element and its contents"
  // is the criterion. It goes through the ⋯ menu because the Delete key acts
  // on tiles alone — a container taken with no prompt would pre-empt AC-061.
  await page.getByTestId('tile-menu-section-detail').click();
  await page.getByTestId('delete-section-detail').click();
  // A section holding something asks which of two things to do (AC-061);
  // this is the answer that takes the contents with it.
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await page.getByTestId('delete-contents').click();

  expect(await idsOn()).not.toContain('tile-region');
  const toast = page.getByTestId('undo-toast');
  await expect(toast).toContainText('Detail');
  await expect(toast).toContainText('items in it');

  await toast.getByRole('button', { name: 'Undo' }).click();

  expect(await idsOn()).toEqual(before);
  await expect(toast).toBeHidden();
});

test('deleting a section asks, and "keep" loses nothing', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();

  const idsOn = () =>
    page
      .getByTestId('grid-item')
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-tile')));
  const before = await idsOn();

  await page.getByTestId('tile-menu-section-detail').click();
  await page.getByTestId('delete-section-detail').click();

  // Nothing may have gone yet: "the contents are deleted without asking" is
  // the criterion's first failing state.
  await expect(page.getByRole('alertdialog')).toBeVisible();
  expect(await idsOn()).toEqual(before);

  await page.getByTestId('keep-contents').click();

  // The section is gone; the chart that was inside it is not. "Keep" losing
  // a tile is the other failing state, and the worse of the two.
  const after = await idsOn();
  expect(after).not.toContain('section-detail');
  expect(after).toContain('tile-region');
  expect(after).toHaveLength(before.length - 1);
});

test('a saved dashboard comes back the way it was left', async ({ page, request }) => {
  /**
   * Its own dashboard, not the seeded one.
   *
   * This is the only test here that *writes*, and the suite shares one
   * database across three browsers running in parallel. Saving over the
   * seeded dashboard changed it for everybody else — four other specs began
   * failing on a tile that was suddenly wider and a heading that was
   * suddenly there.
   */
  const unique = `save-${String(Date.now())}`;
  const created = await request.post('http://localhost:4100/api/documents', {
    data: { kind: 'dashboard', title: `Saveable ${unique}`, folderId: 'root' },
  });
  const { id } = (await created.json()) as { id: string };

  await request.put(`http://localhost:4100/api/documents/dashboard/${id}`, {
    data: {
      version: 1,
      body: {
        schemaVersion: 1,
        title: `Saveable ${unique}`,
        folderId: 'root',
        owner: 'admin',
        settings: { width: 'fixed' },
        pages: [
          {
            id: 'only',
            title: 'Only',
            items: [{ id: 'tile-status', kind: 'chart', w: 6, h: 40 }],
          },
        ],
      },
    },
  });

  await page.goto(`/explore/dashboards/${id}`);
  await expect(page.getByRole('heading', { name: `Saveable ${unique}` })).toBeVisible();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();

  const idsOn = () =>
    page
      .getByTestId('grid-item')
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-tile')));

  // A change to the layout, and one to a tile's size — two of the four
  // things AC-065 names.
  await page
    .getByRole('complementary', { name: 'Edit sidebar' })
    .getByRole('tab', { name: 'Add' })
    .click();
  await page.getByTestId('add-header').click();

  const tile = page.locator('[data-tile="tile-status"]');
  await tile.focus();
  await page.keyboard.press('Shift+ArrowRight');
  const widened = await tile.evaluate((node) => (node as HTMLElement).style.gridColumn);

  const before = await idsOn();
  await page.getByRole('button', { name: 'Save' }).click();

  // Leaving edit mode is the criterion's other half.
  await expect(page.getByRole('toolbar', { name: 'Dashboard editing' })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeVisible();

  // And the real test: reopen it from scratch. "Fails when: any of those is
  // missing after reopening the dashboard" — so this reloads rather than
  // trusting what is already on screen.
  await page.reload();
  await expect(page.getByRole('heading', { name: `Saveable ${unique}` })).toBeVisible();

  expect(await idsOn()).toEqual(before);
  await expect(page.getByRole('heading', { name: 'New heading' })).toBeVisible();
  expect(await tile.evaluate((node) => (node as HTMLElement).style.gridColumn)).toBe(widened);
});

test('a member keeps one colour across two tiles', async ({ page }) => {
  await open(page);

  // Both seeded charts split by orders.status, so the same members are drawn
  // in both tiles. Colour by rank would give them different colours, because
  // the two charts return their statuses in a different order.
  // Named rather than counted: the two charts sit at different depths — one
  // on the page, one inside a section — so a positional index says nothing
  // about which chart is which.
  const byStatus = page.locator('[data-tile="tile-status"]');
  const byCountry = page.locator('[data-tile="tile-region"]');
  await expect(byStatus.locator('svg')).toBeVisible();
  await expect(byCountry.locator('svg')).toBeVisible();

  /**
   * Which colour each member was drawn in, read off the legend, so the
   * comparison is member-to-member. Comparing two lists of fills by position
   * is precisely the bug the criterion is about, and would pass whatever the
   * colours meant.
   *
   * The marker is located by geometry rather than by structure: zrender emits
   * a flat SVG with no group per legend entry, so there is no parent to ask.
   * A legend marker is the nearest filled shape immediately left of its label
   * on the same line.
   */
  const legendOf = (tileLocator: typeof byStatus) =>
    tileLocator.evaluate((tile) => {
      const marks = [...tile.querySelectorAll('svg path[fill]')]
        .filter((path) => {
          const fill = path.getAttribute('fill');
          if (fill === null || fill === 'none' || fill === 'transparent') return false;
          // Legend icons are small. This drops the bars themselves and the
          // legend's full-width hit area, either of which could otherwise sit
          // to the left of some label.
          const box = path.getBoundingClientRect();
          return box.height <= 24 && box.width <= 60;
        })
        .map((path) => ({
          fill: path.getAttribute('fill') ?? '',
          box: path.getBoundingClientRect(),
        }));

      const found: Record<string, string> = {};
      for (const text of tile.querySelectorAll('svg text')) {
        const name = (text.textContent ?? '').trim();
        if (name === '') continue;

        const label = text.getBoundingClientRect();
        const middle = label.top + label.height / 2;
        const marker = marks
          .filter(
            (mark) =>
              mark.box.right <= label.left + 2 &&
              Math.abs(mark.box.top + mark.box.height / 2 - middle) < 8,
          )
          .sort((a, b) => b.box.right - a.box.right)[0];

        if (marker !== undefined && label.left - marker.box.right < 24) found[name] = marker.fill;
      }
      return found;
    });

  // The legend is drawn after the SVG appears, so wait for it rather than
  // reading an empty one and concluding the two tiles agree about nothing.
  for (const tileLocator of [byStatus, byCountry]) {
    await expect
      .poll(async () => Object.keys(await legendOf(tileLocator)).length, { timeout: 10_000 })
      .toBeGreaterThan(1);
  }

  const [first, third] = [await legendOf(byStatus), await legendOf(byCountry)];
  const shared = Object.keys(first).filter((member) => member in third);

  // Both charts split by orders.status, so they share members to disagree
  // about.
  expect(shared.length).toBeGreaterThan(1);

  /**
   * The premise, asserted rather than assumed. Colour falls back to position
   * when a tile chooses for itself, so two charts that happened to reach their
   * members in the same order would paint identically whether or not the
   * dashboard's assignment reached them — and every assertion below would hold
   * while proving nothing.
   *
   * The seeded pair is built to differ: one chart groups by category, the
   * other runs over time, and the sample orders cycle through the statuses day
   * by day. If that ever stops being true this fails here, loudly, instead of
   * quietly going hollow.
   */
  expect(Object.keys(third)).not.toEqual(Object.keys(first));

  for (const member of shared) expect(third[member]).toBe(first[member]);

  // And the shared members are not all one colour, which would make the
  // assertion above true and meaningless.
  expect(new Set(shared.map((member) => first[member])).size).toBe(shared.length);
});

/**
 * T073 / AC-067, the half jsdom cannot reach.
 *
 * `scroll.test.tsx` proves the panes are not remounted, but scrolling is a
 * layout fact and jsdom has no layout: there, `scrollTop` is a number anyone
 * can assign to any element, so the unit tests would pass just as happily with
 * the window doing all the scrolling and rule 40 unmet. Only a real browser
 * can say whether the canvas overflows itself rather than the page.
 *
 * The viewport is made short rather than the seed made taller, because a short
 * window is the condition the rule is about and the seeded dashboard is shared
 * with every other test in this file.
 */
test('the canvas and the sidebar scroll themselves, and hold position across an edit', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 420 });
  await open(page);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();

  const canvas = page.getByTestId('canvas-scroll');
  const sidebar = page.getByTestId('sidebar-scroll');

  const overflows = (node: HTMLElement) => node.scrollHeight > node.clientHeight;
  expect(await canvas.evaluate(overflows)).toBe(true);
  expect(await sidebar.evaluate(overflows)).toBe(true);

  /**
   * The tile is focused before the panes are scrolled, not after. Playwright
   * brings an element into view to act on it, so focusing a tile that is
   * currently scrolled out of sight would move the canvas and the test would
   * be reading its own scrolling rather than the app's. Focus first, scroll
   * second, and the later keypress touches neither.
   */
  const tile = page.getByTestId('grid-item').first();
  await tile.focus();

  await canvas.evaluate((node) => {
    node.scrollTop = 120;
  });
  await sidebar.evaluate((node) => {
    node.scrollTop = 40;
  });

  const top = (node: HTMLElement) => node.scrollTop;
  expect(await canvas.evaluate(top)).toBe(120);
  expect(await sidebar.evaluate(top)).toBe(40);

  /**
   * The panes scrolled, and the page did not — it cannot, because it has
   * nothing to scroll. Both halves are asserted: without the second, a page
   * that quietly grew a scrollbar of its own would still pass, and that is the
   * state this criterion replaced.
   */
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  expect(
    await page.evaluate(() => {
      const root = document.scrollingElement as HTMLElement;
      return root.scrollHeight - root.clientHeight;
    }),
  ).toBe(0);

  /**
   * The edit is made with the keyboard, on the already-focused tile, rather
   * than by clicking a palette entry. Clicking one scrolls the sidebar for the
   * same reason: Divider is the seventh of ten entries, so the click would
   * move that pane to about 308 all by itself.
   */
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('button', { name: /^Discard \(1 change/ })).toBeVisible();

  expect(await canvas.evaluate(top)).toBe(120);
  expect(await sidebar.evaluate(top)).toBe(40);
});

/**
 * T073 / AC-067, the case that nearly shipped broken.
 *
 * The dashboard is not the only thing on the surface: DashboardPage renders
 * the save-failure alert beside it. Sizing the dashboard itself against the
 * viewport assumed it was alone there, so an alert pushed the surface past the
 * viewport, the window took the scrollbar back, and the canvas lost the bottom
 * of the dashboard — in the one moment a user most needs to see their work.
 *
 * The alert is provoked with a real stale save (AC-065's 409), not by
 * injecting markup, so the test breaks if the alert ever moves somewhere that
 * reintroduces the problem.
 */
test('a save failure does not hand the scrollbar back to the window', async ({ page, request }) => {
  await page.setViewportSize({ width: 1280, height: 420 });

  // Its own dashboard: this test saves, and the seeded one is shared with
  // every other spec in this file and across the three browser projects.
  const unique = `alert-${String(Date.now())}-${String(Math.round(Math.random() * 1e6))}`;
  const created = await request.post('http://localhost:4100/api/documents', {
    data: { kind: 'dashboard', title: `Alerted ${unique}`, folderId: 'root' },
  });
  const { id } = (await created.json()) as { id: string };

  const body = {
    schemaVersion: 1,
    title: `Alerted ${unique}`,
    folderId: 'root',
    owner: 'admin',
    settings: { width: 'fixed' },
    pages: [
      {
        id: 'only',
        title: 'Only',
        items: [
          { id: 'tall-a', kind: 'chart', w: 12, h: 40 },
          { id: 'tall-b', kind: 'chart', w: 12, h: 40 },
        ],
      },
    ],
  };
  await request.put(`http://localhost:4100/api/documents/dashboard/${id}`, {
    data: { version: 1, body },
  });

  await page.goto(`/explore/dashboards/${id}`);
  await expect(page.getByRole('heading', { name: `Alerted ${unique}` })).toBeVisible();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByTestId('add-header').click();

  // Someone else saves first, so ours is the stale one that 409s (AC-065).
  await request.put(`http://localhost:4100/api/documents/dashboard/${id}`, {
    data: { version: 2, body },
  });

  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByTestId('save-failed')).toBeVisible();

  const overflow = await page.evaluate(() => {
    const root = document.scrollingElement as HTMLElement;
    return root.scrollHeight - root.clientHeight;
  });
  expect(overflow).toBe(0);
});

/**
 * T194 / AC-046: THE SYSTEM SHALL format every value with its member's format
 * from the Cube model … in axes, labels, tooltips and tables.
 * Fails when: a value renders without its declared format in any of those
 * places.
 *
 * Proven in the editor at T052, and never on a dashboard, where the model's
 * formats were not supplied: the same currency measure read "$…" where it was
 * built and a bare number on every tile.
 */
/** The first row's value in the named column of a tile's table view. */
async function tableValue(tile: import('@playwright/test').Locator, member: string) {
  await tile.getByTestId('toggle-table-view').click();
  const headers = await tile.locator('thead th').allTextContents();
  const column = headers.indexOf(member);
  expect(column).toBeGreaterThanOrEqual(0);
  return tile.getByTestId('table-row').first().locator('td').nth(column);
}

test('a dashboard tile writes a currency measure as money, on its axis and in its table', async ({
  page,
}) => {
  await page.goto('/explore/dashboards/seed-dashboard-formats');
  const tile = page.locator('[data-tile="tile-revenue"]');
  await expect(tile.getByTestId('chart-canvas')).toBeVisible();

  // The axis — drawn as SVG text, so read as it is drawn.
  await expect(
    tile
      .locator('svg text')
      .filter({ hasText: /^\$[\d,.KMB]+$/ })
      .first(),
  ).toBeVisible();

  // The table, by the measure's own column rather than by position: Cube
  // decides the order of the columns it returns.
  // Cube's own currency format, `$,.2~f`: up to two decimals, trailing zeros
  // trimmed — the user chose Cube's formats over fixed pennies (T201).
  // Exactly Cube's: a last decimal is never a trimmed zero, so "$1,234.50"
  // (the old fixed pennies) does not pass (T201's review).
  await expect(await tableValue(tile, 'orders.total_amount')).toHaveText(/^\$[\d,]+(\.\d?[1-9])?$/);
});

test('a dashboard tile’s tooltip writes a currency measure as money (AC-046, T201)', async ({
  page,
}) => {
  await page.goto('/explore/dashboards/seed-dashboard-formats');
  const tile = page.locator('[data-tile="tile-revenue"]');
  const canvas = tile.getByTestId('chart-canvas');
  await expect(canvas.locator('svg text').first()).toBeVisible();

  // A mark to hover: the largest filled shape the chart drew.
  const marks = await canvas.locator('svg path').evaluateAll((paths) =>
    paths
      .map((path) => {
        const box = path.getBoundingClientRect();
        const fill = path.getAttribute('fill') ?? 'none';
        return {
          x: box.x + box.width / 2,
          y: box.y + box.height / 2,
          area: box.width * box.height,
          fill,
        };
      })
      .filter((mark) => mark.fill !== 'none' && mark.fill !== 'transparent' && mark.area > 50)
      .sort((a, b) => b.area - a.area),
  );
  const mark = marks[0];
  expect(mark).toBeDefined();

  // The tooltip's line is "<series>: <value>"; no axis label has the colon.
  const line = tile.locator('div').filter({ hasText: /: \$[\d,]+(\.\d?[1-9])?(?![\d.])/ });
  await expect(line).toHaveCount(0);
  await page.mouse.move(mark?.x ?? 0, mark?.y ?? 0);

  await expect(line.last()).toBeVisible();
});

test('a measure with no declared format stays a plain number on a tile', async ({ page }) => {
  /**
   * The other half. A change that wrote *every* measure as money would pass
   * the test above; a count has no format in the model and must be left as
   * it is.
   */
  await page.goto('/explore/dashboards/seed-dashboard-formats');
  const tile = page.locator('[data-tile="tile-count"]');
  await expect(tile.getByTestId('chart-canvas')).toBeVisible();

  await expect(tile.locator('svg text').filter({ hasText: /^\$/ })).toHaveCount(0);
  await expect(await tableValue(tile, 'orders.count')).toHaveText(/^[\d,]+$/);
});

/**
 * T193 / AC-034 ("Fails when … the dashboard tile does not reflect the applied
 * changes"): a chart saved without a type — "follow the recommender" — has to
 * draw on a dashboard, and with the type the editor gives it.
 *
 * Until T193 every such chart showed "This chart has no chart type yet" on a
 * dashboard while drawing normally in the editor. The test does not name a
 * type: it reads the one the editor shows and requires the tile to draw that
 * one, because agreement between the two is the rule — "a chart has to look
 * the same on a dashboard as it did where it was built".
 */
test('a chart following its recommendation draws on the dashboard as it does in the editor', async ({
  page,
}) => {
  await page.goto('/explore/charts/seed-chart-recommended/edit');
  // Recommended from the rows, so wait for them before reading the type —
  // before the query settles the editor is recommending from none.
  await expect(page.getByTestId('result-row-count')).not.toHaveText('0 rows');
  const inEditor = await page.getByTestId('chart-type').textContent();
  expect(inEditor).toMatch(/\S/);
  /**
   * A guard on the fixture, not on the recommender: the chart is seeded over
   * time so that its pick differs from `bar`, the type every other seeded
   * chart saves. If a change to either ever made it `bar`, this test would
   * stop telling a recommending dashboard from one that defaults to `bar` —
   * so it says so instead of passing quietly.
   */
  expect(inEditor).not.toBe('bar');

  await page.goto('/explore/dashboards/seed-dashboard-recommended');
  const tile = page.locator('[data-tile="tile-recommended"]');

  await expect(tile.getByTestId('chart-canvas')).toHaveAttribute('data-chart-type', inEditor ?? '');
});

/**
 * T206 / AC-188: THE SYSTEM SHALL write a time dimension's values by their
 * granularity … in axes, labels, tooltips and tables.
 * Fails when: a time value shows as a raw timestamp such as
 * "2026-01-02T00:00:00.000".
 *
 * The seeded "Orders over time by status" asks Cube for days, and its axis
 * read `2026-01-02T00:00:00.000` until T206. Its SVG's text is read as
 * drawn, and so is its table view.
 */
test('a time axis and a time column are written by their granularity, never as a timestamp', async ({
  page,
}) => {
  await open(page);
  const tile = page.locator('[data-tile="tile-region"]');
  const canvas = tile.getByTestId('chart-canvas');
  await expect(canvas.locator('svg text').first()).toBeVisible();

  const RAW = /\d{4}-\d{2}-\d{2}T\d{2}/;
  const DAY = /^[A-Z][a-z]{2} \d{1,2}, \d{4}$/;
  const drawn = await canvas.locator('svg text').allTextContents();
  expect(drawn.filter((text) => RAW.test(text))).toEqual([]);
  expect(drawn.some((text) => DAY.test(text))).toBe(true);

  await tile.getByTestId('toggle-table-view').click();
  await expect(tile.getByTestId('table-row').first()).toBeVisible();
  // The time's column, found by its header rather than by its place.
  const headers = await tile.locator('thead th').allTextContents();
  const at = headers.findIndex((header) => header === 'orders.ordered_at');
  expect(at).toBeGreaterThanOrEqual(0);
  const times = await tile
    .getByTestId('table-row')
    .locator(`td:nth-child(${String(at + 1)})`)
    .allTextContents();
  expect(times.length).toBeGreaterThan(0);
  expect(times.every((text) => DAY.test(text))).toBe(true);
  // And no cell anywhere in the table is a raw timestamp.
  const cells = await tile.getByTestId('table-row').locator('td').allTextContents();
  expect(cells.filter((text) => RAW.test(text))).toEqual([]);
});

/**
 * T199 / AC-185: WHEN the user saves the dashboard settings page in view
 * mode, THE SYSTEM SHALL keep the page open until the save has gone through,
 * and IF the save fails, keep the settings as entered on the page and show
 * the reason.
 * `Fails when: the page closes before the save answers, or a failed save
 * loses what was entered.`
 *
 * Provoked with a real stale save (AC-065's 409), so what the page reports is
 * what the service said.
 */
test('a settings save that fails keeps the page, the entry and the reason', async ({
  page,
  request,
}) => {
  const unique = `settings-${String(Date.now())}-${String(Math.round(Math.random() * 1e6))}`;
  const created = await request.post('http://localhost:4100/api/documents', {
    data: { kind: 'dashboard', title: `Settings ${unique}`, folderId: 'root' },
  });
  const { id } = (await created.json()) as { id: string };
  const body = {
    schemaVersion: 1,
    title: `Settings ${unique}`,
    folderId: 'root',
    owner: 'admin',
    settings: { width: 'fixed' },
    pages: [{ id: 'only', title: 'Only', items: [] }],
  };
  await request.put(`http://localhost:4100/api/documents/dashboard/${id}`, {
    data: { version: 1, body },
  });

  await page.goto(`/explore/dashboards/${id}`);
  await expect(page.getByRole('heading', { name: `Settings ${unique}` })).toBeVisible();
  await page.getByRole('button', { name: 'Dashboard settings' }).click();
  const name = page.getByLabel('Name');
  await name.fill(`Renamed ${unique}`);

  // Someone else saves first, so ours is the stale one that 409s.
  await request.put(`http://localhost:4100/api/documents/dashboard/${id}`, {
    data: { version: 2, body },
  });

  await page.getByRole('button', { name: /^Save settings|^Saving/ }).click();

  // Open, with what was typed, and the reason the service gave.
  await expect(page.getByTestId('settings-save-failed')).toBeVisible();
  await expect(page.getByTestId('dashboard-settings')).toBeVisible();
  await expect(name).toHaveValue(`Renamed ${unique}`);
});

/**
 * T217 / AC-196: WHILE a dashboard is open, THE SYSTEM SHALL keep its header,
 * page tabs and filter bar fixed above the scrolling tiles, and show the
 * filter bar at all times, with a one-line hint on how to mark or filter while
 * nothing is set.
 * `Fails when: the page tabs or the filter bar scroll out of view with the
 * tiles, or the filter bar appears only once something is set.`
 */
test('the page tabs and filter bar stay above the tiles as they scroll, the bar hinting how to mark', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 520 });
  await open(page);
  const tabs = page.getByRole('tablist', { name: 'Pages' });
  const bar = page.getByRole('region', { name: 'Filters' });
  // Nothing set, and the bar is there, saying how to mark.
  await expect(bar).toContainText(
    'Click, drag or Alt+drag to mark · Ctrl/⌘ adds or toggles · Esc unmarks',
  );

  const canvas = page.getByTestId('canvas-scroll');
  await expect(page.getByTestId('chart-canvas').first()).toBeVisible();
  const scrolled = await canvas.evaluate((node) => {
    node.scrollTop = node.scrollHeight;
    return node.scrollTop;
  });
  // The tiles really scrolled, and the tabs and the bar did not go with them.
  expect(scrolled).toBeGreaterThan(100);
  await expect(tabs).toBeInViewport({ ratio: 1 });
  await expect(bar).toBeInViewport({ ratio: 1 });
  const barTop = (await bar.boundingBox())?.y ?? 0;
  expect(barTop).toBeGreaterThanOrEqual(48);
  // A tile scrolled into view stops below the band, not under it.
  const [padding, band] = await canvas.evaluate((node) => [
    getComputedStyle(node).scrollPaddingTop,
    `${String((node.querySelector('.dashboard__fixed') as HTMLElement).offsetHeight)}px`,
  ]);
  expect(padding).toBe(band);
});

/**
 * T217 / AC-207: WHEN a dashboard or one of its page tabs has no tiles, THE
 * SYSTEM SHALL show a sentence saying so with a way to start editing, and
 * SHALL show the page-tab strip.
 * `Fails when: an empty dashboard or tab renders a blank canvas, or the tab
 * strip is hidden.`
 */
test('an empty dashboard says so, with its tab strip and a way to start editing', async ({
  page,
  request,
}) => {
  const unique = String(Date.now());
  const created = (await (
    await request.post('http://localhost:4100/api/documents', {
      data: { kind: 'dashboard', title: `Empty ${unique}`, folderId: 'root' },
    })
  ).json()) as { id: string };
  await page.goto(`/explore/dashboards/${created.id}`);
  await expect(page.getByRole('heading', { name: `Empty ${unique}` })).toBeVisible();

  await expect(page.getByRole('tablist', { name: 'Pages' }).getByRole('tab')).toHaveCount(1);
  const empty = page.getByTestId('dashboard-page');
  await expect(empty).toContainText('Nothing here yet. Edit the dashboard to add charts.');
  await empty.getByRole('button', { name: 'Start editing' }).click();
  await expect(page.getByRole('toolbar', { name: 'Dashboard editing' })).toBeVisible();
});

/**
 * T221 / AC-202: THE SYSTEM SHALL draw a section as a band with a header
 * holding a collapse control, its title and its number of items, and SHALL
 * collapse and expand it in view and edit mode.
 * `Fails when: a section has no collapse control, or cannot be collapsed in
 * view mode.`
 */
test('a section is a band that says how many items it holds, and collapses in view and edit mode', async ({
  page,
}) => {
  await open(page);
  const section = page.getByRole('region', { name: 'Detail' });
  await expect(section.locator('.dashboard-section__count')).toHaveText('1 item');
  const inside = page.locator('[data-tile="tile-region"]');
  await expect(inside).toBeVisible();

  // View mode.
  const collapse = section.getByRole('button', { name: 'Collapse Detail' });
  await expect(collapse).toHaveAttribute('aria-expanded', 'true');
  await collapse.click();
  await expect(inside).toBeHidden();
  const expand = section.getByRole('button', { name: 'Expand Detail' });
  await expect(expand).toHaveAttribute('aria-expanded', 'false');
  await expand.click();
  await expect(inside).toBeVisible();

  // Edit mode.
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByRole('toolbar', { name: 'Dashboard editing' })).toBeVisible();
  await section.getByRole('button', { name: 'Collapse Detail' }).click();
  await expect(inside).toBeHidden();
  await section.getByRole('button', { name: 'Expand Detail' }).click();
  await expect(inside).toBeVisible();

  // Collapsed, and a tile inside it chosen in the Outline: it opens, so the
  // tile has a box to show (T221's review).
  await section.getByRole('button', { name: 'Collapse Detail' }).click();
  await expect(inside).toBeHidden();
  const sidebar = page.getByRole('complementary', { name: 'Edit sidebar' });
  await sidebar.getByRole('tab', { name: 'Outline' }).click();
  await sidebar
    .getByRole('navigation', { name: 'Dashboard outline' })
    .getByRole('button', { name: /Chart: Orders over time/ })
    .click();
  await expect(inside).toBeVisible();
});

/**
 * T221 / AC-208: THE SYSTEM SHALL render a markdown tile's headings, emphasis,
 * lists and line breaks, and no raw HTML (`[R7]`).
 * `Fails when: a heading marker such as "##" or an emphasis marker is shown as
 * text, or an HTML tag in the text renders as HTML.`
 */
test('a markdown tile renders its headings, emphasis, lists and breaks, and no raw HTML', async ({
  page,
  request,
}) => {
  const unique = String(Date.now());
  const API = 'http://localhost:4100/api';
  const created = (await (
    await request.post(`${API}/documents`, {
      data: { kind: 'dashboard', title: `Markdown ${unique}`, folderId: 'root' },
    })
  ).json()) as { id: string };
  const stored = (await (await request.get(`${API}/documents/dashboard/${created.id}`)).json()) as {
    version: number;
    body: Record<string, unknown>;
  };
  const text = [
    '## What this shows',
    'Orders **by status** and *this quarter*,',
    'on two lines.',
    '',
    '- shipped',
    '- completed',
    '',
    '<b>not bold</b>',
  ].join('\n');
  await request.put(`${API}/documents/dashboard/${created.id}`, {
    data: {
      version: stored.version,
      body: {
        ...stored.body,
        pages: [
          {
            id: 'p',
            title: 'Page 1',
            items: [{ id: 'notes', kind: 'markdown', w: 6, h: 20, text }],
          },
        ],
      },
    },
  });
  await page.goto(`/explore/dashboards/${created.id}`);
  const tile = page.locator('[data-tile="notes"]');

  await expect(tile.getByRole('heading', { name: 'What this shows' })).toBeVisible();
  await expect(tile.locator('strong')).toHaveText('by status');
  await expect(tile.locator('em')).toHaveText('this quarter');
  await expect(tile.getByRole('listitem')).toHaveText(['shipped', 'completed']);
  await expect(tile.locator('br')).toHaveCount(1);
  // The markers are gone; the tag is text, never markup.
  await expect(tile).not.toContainText('##');
  await expect(tile).not.toContainText('**');
  await expect(tile).toContainText('<b>not bold</b>');
  await expect(tile.locator('b')).toHaveCount(0);
});
