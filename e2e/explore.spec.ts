import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

import { chooseTarget, madeIn, sharedIn } from './workspace';

/**
 * AC-017: WHEN the user opens Explore, THE SYSTEM SHALL show a folder tree and
 * the contents of the selected folder, listing dashboards and library charts
 * with their type, owner and last-updated time.
 *
 * Against the real API and the real database, seeded by the service in e2e
 * mode — the repository test covers the query, the component test covers the
 * markup, and this covers the two meeting.
 */
test('shows the folder tree and the selected folder’s contents', async ({ page }) => {
  await page.goto('/explore');

  const tree = page.getByRole('tree', { name: /folders/i });
  await expect(tree).toBeVisible();
  await expect(tree.getByRole('button', { name: 'Finance' })).toBeVisible();

  const contents = page.getByTestId('explore-contents');
  await expect(contents.getByRole('table')).toBeVisible();
  await expect(contents.getByRole('row').nth(1)).toBeVisible();
});

test('lists each item with its type, owner and last-updated time', async ({ page }) => {
  await page.goto('/explore');

  // A dashboard's row: AC-017 lists dashboards and charts with these, and a
  // folder, listed first, has no date or owner, as the prototype's (T244).
  const firstItem = page
    .getByTestId('explore-contents')
    .getByRole('row')
    .filter({ has: page.getByRole('cell', { name: 'Dashboard', exact: true }) })
    .first();
  const cells = firstItem.getByRole('cell');

  await expect(cells.nth(0)).toContainText(/dashboard|chart|folder/i);
  await expect(cells.nth(1)).not.toBeEmpty();
  await expect(cells.nth(2)).not.toBeEmpty();
  // Owner too, which the test is named for (T244's review).
  await expect(cells.nth(3)).not.toBeEmpty();
});

test('selecting a folder shows that folder’s contents', async ({ page }) => {
  await page.goto('/explore');
  const contents = page.getByTestId('explore-contents');
  await expect(contents.getByRole('table')).toBeVisible();

  // Scoped to the tree: "Finance" is also a row in the contents list, and an
  // unscoped query matches both.
  await page.getByRole('tree').getByRole('button', { name: 'Finance' }).click();

  // Its first dashboard: subfolders come first (AC-193), and other tests add
  // folders of their own to Finance.
  await expect(contents.locator('tbody tr').filter({ hasText: 'Dashboard' }).first()).toContainText(
    /Finance/,
  );
});

/**
 * AC-003, the half T007 could not demonstrate: switching the theme must not
 * lose scroll position. This is the first surface long enough to scroll.
 */
test('switching theme keeps the scroll position (AC-003)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 600 });
  await page.goto('/explore');
  const table = page.getByTestId('explore-contents').getByRole('table');
  await expect(table).toBeVisible();

  // The list scrolls, not the page, since T244 docked Explore as the
  // prototype does: the scroll position kept is the list's.
  const scroller = table.locator('..');
  await scroller.evaluate((element) => {
    element.scrollTop = 400;
  });
  const before = await scroller.evaluate((element) => element.scrollTop);
  // The assertion is worthless unless the list really scrolled.
  expect(before).toBeGreaterThan(0);

  await page.getByRole('button', { name: /theme/i }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  expect(await scroller.evaluate((element) => element.scrollTop)).toBe(before);
});

/**
 * T212 / AC-192: WHEN the user opens a folder in Explore, THE SYSTEM SHALL show
 * a breadcrumb of its ancestors, the folder's name as the page heading with
 * Rename beside it, the Explore search box, and a single "New" menu offering
 * Dashboard, Chart and Folder.
 * `Fails when: the folder's name is not the page heading, a breadcrumb
 * ancestor does not open that folder, or creating is offered other than
 * through the New menu.`
 *
 * From the prototype (`docs/design/prototype/explore.js`, `browse()`), which
 * the user accepted for structure (R7) and asked to follow now (R9), after
 * comparing it with the running app themselves.
 */
const API = 'http://localhost:4100/api';

async function folderIn(request: APIRequestContext, parent: string, title: string) {
  const created = (await (
    await request.post(`${API}/documents`, { data: { kind: 'folder', title, folderId: parent } })
  ).json()) as { id: string };
  return created.id;
}

const contentsOf = (page: Page) => page.getByTestId('explore-contents');
const heading = (page: Page) => contentsOf(page).getByRole('heading', { level: 1 });
const crumbs = (page: Page) => contentsOf(page).getByRole('navigation', { name: 'Breadcrumb' });

async function openFinance(page: Page) {
  await page.goto('/explore');
  await page.getByRole('tree').getByRole('button', { name: 'Finance' }).click();
  await expect(heading(page)).toHaveText('Finance');
}

test('a folder is named by its heading, under a breadcrumb of its ancestors', async ({
  page,
  request,
}) => {
  const unique = String(Date.now());
  const inner = await folderIn(request, 'seed-folder-0', `Crumbs ${unique}`);
  await openFinance(page);

  // Into the subfolder from its row.
  await contentsOf(page).getByTestId(`item-${inner}`).getByRole('button').first().click();
  await expect(heading(page)).toHaveText(`Crumbs ${unique}`);
  await expect(crumbs(page)).toContainText('Finance');

  // An ancestor in the breadcrumb opens that folder.
  await crumbs(page).getByRole('button', { name: 'Finance' }).click();
  await expect(heading(page)).toHaveText('Finance');
});

test('creating is offered through one New menu: Dashboard, Chart and Folder', async ({ page }) => {
  // In My workspace, where the single user makes all three: a shared
  // folder's New makes a folder alone, as with sign-in on (T331; T359, AC-254).
  await page.goto('/explore?folder=mine');
  await expect(heading(page)).toHaveText('My workspace');

  // No separate create buttons beside it. Scoped to the header row: folders
  // called "New folder", which other tests make, are buttons in the tree.
  const header = heading(page).locator('xpath=..');
  for (const old of ['New folder', 'New dashboard', 'New chart'])
    await expect(header.getByRole('button', { name: old, exact: true })).toHaveCount(0);

  // Exact: a row for a folder called "New folder …" also contains the word.
  await contentsOf(page).getByRole('button', { name: 'New', exact: true }).click();
  const menu = page.getByRole('menu', { name: 'New' });
  // By label: each item leads with its type's icon chip, which is decorative.
  // My workspace's New offers a data source and an import as well (T363;
  // AC-192), and a model, previewed through the workspace's overlay (T347,
  // AC-282).
  await expect(menu.getByRole('menuitem')).toHaveText([
    /Dashboard$/,
    /Chart$/,
    /Model$/,
    /Data source$/,
    // The one kind with no target, as design 13 state G marks it (T692).
    /Folderno target$/,
    /Import a dashboard…from a file$/,
  ]);

  // Escape puts it away without creating anything.
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
});

test('Rename beside the heading renames the folder in place', async ({ page, request }) => {
  const unique = String(Date.now());
  const id = await folderIn(request, 'seed-folder-0', `Before ${unique}`);
  await openFinance(page);
  await contentsOf(page).getByTestId(`item-${id}`).getByRole('button').first().click();
  await expect(heading(page)).toHaveText(`Before ${unique}`);

  // The heading's own Rename: scoped to the header row, since a row's Rename
  // in the table below shares the name.
  await heading(page)
    .locator('xpath=..')
    .getByRole('button', { name: 'Rename', exact: true })
    .click();
  const name = contentsOf(page).getByRole('textbox', { name: 'Folder name' });
  await name.fill(`After ${unique}`);
  await name.press('Enter');

  await expect(heading(page)).toHaveText(`After ${unique}`);
  await expect(page.getByRole('treeitem', { name: `After ${unique}` })).toBeVisible();
});

/**
 * T213 / AC-193: THE SYSTEM SHALL list a folder's contents under the columns
 * Name, Type, Built on, Updated and Owner — subfolders first, then dashboards,
 * then charts — showing a dashboard's description beneath its name and its
 * number of page tabs, a chart's chart type and the cube or view it is built
 * on, and a subfolder's item count, and SHALL offer rename and move through a
 * menu on each row.
 * `Fails when: a column is missing, a chart's type reads only "Chart", a row
 * shows a rename or move control before its menu is opened, or a move offers
 * the item's own folder or, for a folder, itself or a folder inside it.`
 *
 * The prototype's `browse()` table (docs/design/prototype/explore.js).
 *
 * A shared folder's dashboards and charts are put there as the single user
 * puts them, through My workspace and a proposal they approve (T359, AC-254).
 */
async function listed(request: APIRequestContext) {
  const unique = String(Date.now());
  const home = await folderIn(request, 'root', `Listed ${unique}`);
  const sub = await folderIn(request, home, `Sub ${unique}`);
  const inner = await folderIn(request, sub, `Inner ${unique}`);
  await sharedIn(request, 'dashboard', sub, { title: `In sub ${unique}` });
  await sharedIn(request, 'chart', inner, { title: `In inner ${unique}` });
  const dashboard = await sharedIn(request, 'dashboard', home, {
    title: `Board ${unique}`,
    description: 'What the board is for',
    pages: [
      { id: 'a', title: 'A', items: [] },
      { id: 'b', title: 'B', items: [] },
      { id: 'c', title: 'C', items: [] },
    ],
  });
  const wells = { measures: ['orders.count'], dimensions: ['orders.status'], timeDimensions: [] };
  const typed = await sharedIn(request, 'chart', home, {
    title: `A typed ${unique}`,
    chart: { source: { cube: 'orders' }, wells, chartType: 'hbar' },
  });
  const auto = await sharedIn(request, 'chart', home, {
    title: `B auto ${unique}`,
    chart: {
      source: { cube: 'order_summary' },
      wells: { measures: ['order_summary.count'], dimensions: [], timeDimensions: [] },
    },
  });
  return { unique, home, sub, inner, dashboard, typed, auto };
}

async function openListed(page: Page, title: string) {
  await page.goto('/explore');
  await page.getByRole('tree').getByRole('button', { name: title }).click();
  await expect(heading(page)).toHaveText(title);
}

test('the contents are listed under Name, Type, Built on, Updated and Owner, subfolders first', async ({
  page,
  request,
}) => {
  const made = await listed(request);
  await openListed(page, `Listed ${made.unique}`);
  const table = contentsOf(page).getByRole('table');

  await expect(table.getByRole('columnheader')).toHaveText([
    'Name',
    'Type',
    'Built on',
    'Updated',
    'Owner',
    'Actions',
  ]);
  // Subfolders, then dashboards, then charts.
  await expect(table.getByRole('row')).toHaveCount(5);
  const rows = table.locator('tbody tr');
  await expect(rows.nth(0)).toHaveAttribute('data-testid', `item-${made.sub}`);
  await expect(rows.nth(1)).toHaveAttribute('data-testid', `item-${made.dashboard}`);
  await expect(rows.nth(2)).toHaveAttribute('data-testid', `item-${made.typed}`);
  await expect(rows.nth(3)).toHaveAttribute('data-testid', `item-${made.auto}`);

  const cells = (id: string) => page.getByTestId(`item-${id}`).getByRole('cell');
  // A subfolder: its items, counting those in the folder inside it.
  await expect(cells(made.sub).nth(0)).toHaveText('Folder');
  await expect(cells(made.sub).nth(1)).toHaveText('2 items');
  // A dashboard: its description beneath its name, and its page tabs.
  await expect(page.getByTestId(`item-${made.dashboard}`).getByRole('rowheader')).toContainText(
    'What the board is for',
  );
  await expect(cells(made.dashboard).nth(1)).toHaveText('3 tabs');
  // A chart: its type, never only "Chart", and what it is built on.
  await expect(cells(made.typed).nth(0)).toHaveText('Bar, horizontal');
  await expect(cells(made.typed).nth(1)).toHaveText('cube: orders');
  await expect(cells(made.auto).nth(0)).toHaveText('Automatic');
  await expect(cells(made.auto).nth(1)).toHaveText('view: order_summary');
  await expect(cells(made.auto).nth(3)).toHaveText('admin');
});

/**
 * T334, AC-269, AC-131: a folder's models are listed beside its dashboards
 * and charts, each a model file labelled Model and built on its cubes and
 * views, and one opens in the model editor. The root holds the model here.
 */
test('the root lists its model files as models, after its charts, and one opens in the model editor', async ({
  page,
  request,
}) => {
  const { files } = (await (await request.get('/api/model/files?folder=root')).json()) as {
    files: { path: string; objects: { kind: string; name: string }[] }[];
  };
  const orders = files.find((file) => file.path === 'cubes/orders.yml');
  expect(orders?.objects.filter((object) => object.kind === 'cube').map((o) => o.name)).toEqual([
    'orders',
  ]);

  await page.goto('/explore');
  // Each file the root held when asked is a row, labelled Model; other tests
  // may add files meanwhile, so the rows aren't counted (T334's review).
  for (const file of files)
    await expect(page.getByTestId(`item-${file.path}`).getByRole('cell').nth(0)).toHaveText(
      'Model',
    );
  // After its dashboards and charts: only models follow one, then any data
  // sources the folder holds (T335).
  const kinds = await contentsOf(page)
    .locator('tbody tr')
    .locator('td:nth-of-type(1)')
    .allTextContents();
  const firstModel = kinds.indexOf('Model');
  expect(firstModel).toBeGreaterThan(-1);
  const after = kinds.slice(firstModel);
  const models = after.filter((kind) => kind === 'Model').length;
  expect(after).toEqual([
    ...Array<string>(models).fill('Model'),
    ...Array<string>(after.length - models).fill('Data source'),
  ]);

  const row = page.getByTestId('item-cubes/orders.yml');
  await expect(row.getByRole('cell').nth(0)).toHaveText('Model');
  await expect(row.getByRole('cell').nth(1)).toHaveText('1 cube · 0 views');
  // Its ⋯ holds Open and Delete…, never Rename or Move (T526; design 14, pin 9).
  await row.getByRole('button', { name: 'Actions for orders.yml' }).click();
  await expect(page.getByRole('menu').getByRole('menuitem')).toHaveText(['Open', 'Delete…']);
  await page.keyboard.press('Escape');

  await row.getByRole('button', { name: 'orders.yml', exact: true }).click();
  // In its folder, the root, named in the address beside the file (T342, AC-222).
  await expect(page).toHaveURL(/\/explore\/folders\/root\/models\/cubes%2Forders\.yml$/);
  await expect(page.getByRole('textbox', { name: 'cubes/orders.yml, as YAML' })).toContainText(
    'name: orders',
  );
});

/**
 * T243 / AC-193 (recheck-shell-explore N1, N11, F19): a chart that follows
 * the recommendation is listed by what it was drawn as when saved — as its
 * own page names it — not "Automatic"; a row opens from any of its cells;
 * the date is the prototype's short one.
 */
test('a saved automatic chart is listed by its drawn type, and its row opens from any cell', async ({
  page,
  request,
}) => {
  const unique = String(Date.now());
  // In My workspace, where the single user saves a chart (T359, AC-254).
  const home = await folderIn(request, 'mine', `Drawn ${unique}`);
  const chart = await madeIn(request, 'chart', home, {
    title: `Drawn ${unique}`,
    chart: {
      source: { cube: 'orders' },
      wells: { measures: ['orders.count'], dimensions: ['orders.status'], timeDimensions: [] },
    },
  });

  await page.goto(`/explore/charts/${chart}/edit`);
  const head = page.getByTestId('editor-bar');
  await expect(head.getByTestId('result-row-count')).toHaveText('3 rows');
  const title = head.getByLabel('Chart title');
  await title.fill(`Drawn ${unique}, saved`);
  await title.press('Enter');
  await head.getByRole('button', { name: 'Save chart' }).click();
  await expect(page).toHaveURL(new RegExp(`/explore/charts/${chart}$`));
  // Once drawn, the page names its type as the recommender's.
  await expect(page.getByTestId('chart-type')).toHaveText(/ · auto$/);
  const drawnAs = (await page.getByTestId('chart-type').textContent())?.trim() ?? '';

  await page.goto(`/explore?folder=${home}`);
  const row = page.getByTestId(`item-${chart}`);
  const cells = row.getByRole('cell');
  await expect(cells.nth(0)).toHaveText(drawnAs);
  // Day first, as every day is written (T477, Q6): "19 Sep", "30 Dec 2025".
  await expect(cells.nth(2)).toHaveText(/^\d{1,2} [A-Z][a-z]{2}( \d{4})?$/);

  // Any cell opens it, as the prototype's rows do.
  await cells.nth(1).click();
  await expect(page).toHaveURL(new RegExp(`/explore/charts/${chart}$`));
});

test("rename and move are in each row's menu, and a move never offers where the item already is", async ({
  page,
  request,
}) => {
  const made = await listed(request);
  // Sub's sibling: a folder may move into one (recheck-shell-explore N17).
  await folderIn(request, made.home, `Sibling ${made.unique}`);
  await openListed(page, `Listed ${made.unique}`);

  const chartRow = page.getByTestId(`item-${made.typed}`);
  await expect(chartRow).toBeVisible();
  // Nothing to rename or move with until the row's menu is opened.
  await expect(chartRow.getByRole('button', { name: 'Rename', exact: true })).toHaveCount(0);
  await expect(chartRow.getByRole('combobox')).toHaveCount(0);
  const typeColumn = contentsOf(page).getByRole('columnheader', { name: 'Type' });
  const before = [(await chartRow.boundingBox())?.height, (await typeColumn.boundingBox())?.x];

  await chartRow.getByRole('button', { name: `Actions for A typed ${made.unique}` }).click();
  const menu = page.getByRole('menu', { name: `Actions for A typed ${made.unique}` });
  // Delete… last, set apart (T517; design 14, pin 8); Open first, then the
  // copy it landed from, still in My workspace (T694; design 14, B1).
  await expect(menu.getByRole('menuitem')).toHaveText([
    'Open',
    'Open my copy',
    'Rename',
    'Move to…',
    'Delete…',
  ]);
  await menu.getByRole('menuitem', { name: 'Move to…' }).click();
  const chartTargets = chartRow.getByRole('combobox', { name: `Move A typed ${made.unique} to` });
  await expect(chartTargets).toBeFocused();
  // Its own folder is not a place to move it to; the others are — each by
  // its path, as two folders may share a name (recheck-shell-explore F16).
  const exactly = (name: string) => ({ name, exact: true });
  const listedPath = `Shared / Listed ${made.unique}`;
  await expect(chartTargets.getByRole('option', exactly(listedPath))).toHaveCount(0);
  await expect(
    chartTargets.getByRole('option', exactly(`${listedPath} / Sub ${made.unique}`)),
  ).toHaveCount(1);
  // Over the row, not in its place: the row keeps its height and the columns
  // stay where they were (N14).
  await expect(chartRow.getByRole('button', { name: /^Actions for / })).toBeVisible();
  expect([(await chartRow.boundingBox())?.height, (await typeColumn.boundingBox())?.x]).toEqual(
    before,
  );

  // A folder: never itself, nor a folder inside it.
  const folderRow = page.getByTestId(`item-${made.sub}`);
  await folderRow.getByRole('button', { name: `Actions for Sub ${made.unique}` }).click();
  await page
    .getByRole('menu', { name: `Actions for Sub ${made.unique}` })
    .getByRole('menuitem', { name: 'Move to…' })
    .click();
  const folderTargets = folderRow.getByRole('combobox', { name: `Move Sub ${made.unique} to` });
  for (const excluded of [
    listedPath,
    `${listedPath} / Sub ${made.unique}`,
    `${listedPath} / Sub ${made.unique} / Inner ${made.unique}`,
  ])
    await expect(folderTargets.getByRole('option', exactly(excluded))).toHaveCount(0);
  // Its sibling is somewhere it can go — the old rule left every sibling out
  // (N17) — and so is the top.
  await expect(
    folderTargets.getByRole('option', exactly(`${listedPath} / Sibling ${made.unique}`)),
  ).toHaveCount(1);
  await expect(folderTargets.getByRole('option', { name: 'Shared', exact: true })).toHaveCount(1);
  await expect(folderTargets.getByRole('option', exactly('My workspace'))).toHaveCount(1);

  // Rename, from the menu, renames in place.
  await chartRow.getByRole('button', { name: `Actions for A typed ${made.unique}` }).click();
  await page
    .getByRole('menu', { name: `Actions for A typed ${made.unique}` })
    .getByRole('menuitem', { name: 'Rename' })
    .click();
  const field = chartRow.getByRole('textbox', { name: `New name for A typed ${made.unique}` });
  await expect(field).toBeFocused();
  await field.fill(`Renamed ${made.unique}`);
  await field.press('Enter');
  await expect(chartRow.getByRole('rowheader')).toHaveText(`Renamed ${made.unique}`);
});

/**
 * T214 / AC-194: THE SYSTEM SHALL show the folder tree as a full-height pane
 * headed "Folders" with a "+ Folder" action, holding a shared root and a
 * personal "My workspace" root, each folder showing the number of items it
 * holds including those in its subfolders.
 * `Fails when: "My workspace" is missing, a count leaves out items in
 * subfolders, or the tree scrolls away with the contents.`
 */
const pane = (page: Page) => page.getByRole('complementary', { name: 'Folders' });

test('the tree is a pane headed Folders, with the shared root and My workspace, each counted', async ({
  page,
  request,
}) => {
  const unique = String(Date.now());
  const drafts = await folderIn(request, 'mine', `Drafts ${unique}`);
  const deeper = await folderIn(request, drafts, `Deeper ${unique}`);
  await madeIn(request, 'dashboard', drafts, { title: `Draft board ${unique}` });
  await madeIn(request, 'chart', deeper, { title: `Draft chart ${unique}` });

  await page.goto('/explore');
  await expect(pane(page).getByRole('heading', { level: 2 })).toHaveText('Folders');
  const tree = pane(page).getByRole('tree');
  // Two roots, the personal one among them.
  await expect(tree.locator('[role="treeitem"][aria-level="1"]')).toHaveCount(2);
  await expect(tree.getByRole('treeitem', { name: 'Shared', exact: true })).toHaveAttribute(
    'aria-level',
    '1',
  );
  const mine = tree.getByRole('treeitem', { name: 'My workspace', exact: true });
  await expect(mine).toHaveAttribute('aria-level', '1');
  // Drafts counts the chart in the folder beneath it, as well as its own dashboard.
  const draftsCount = tree
    .getByRole('treeitem', { name: `Drafts ${unique}`, exact: true })
    .locator('.folder-tree__count')
    .first();
  await expect(draftsCount).toHaveText('2');

  // My workspace opens like any folder, and holds Drafts.
  await mine.getByRole('button').first().click();
  await expect(heading(page)).toHaveText('My workspace');
  await expect(page.getByTestId(`item-${drafts}`)).toBeVisible();
});

test('+ Folder in the pane makes a folder in the open one', async ({ page }) => {
  await openFinance(page);
  await pane(page).getByRole('button', { name: '+ Folder' }).click();
  // Opened, named in the heading ready to type, and beneath Finance.
  const name = contentsOf(page).getByRole('textbox', { name: 'Folder name' });
  await expect(name).toBeFocused();
  await expect(crumbs(page).getByRole('button')).toContainText(['Shared', 'Finance']);
  // Named, so no "New folder" is left behind for other tests to trip on.
  const unique = `Plus folder ${String(Date.now())}`;
  await name.fill(unique);
  await name.press('Enter');
  await expect(heading(page)).toHaveText(unique);
});

/**
 * A shared dashboard no longer moves into My workspace, with sign-in off as
 * with it on (T359, AC-254: workspace-only), so the move is between two
 * shared folders, and the count that follows it is the folder's it went to.
 */
test("a root's count is shown, and a folder's follows a move into it", async ({
  page,
  request,
}) => {
  const unique = String(Date.now());
  const home = await folderIn(request, 'root', `Counted home ${unique}`);
  const there = await folderIn(request, 'root', `Counted there ${unique}`);
  const board = await sharedIn(request, 'dashboard', home, { title: `Counted ${unique}` });
  await sharedIn(request, 'dashboard', there, { title: `Already there ${unique}` });

  await page.goto('/explore');
  const mine = pane(page).getByRole('treeitem', { name: 'My workspace', exact: true });
  const before = (
    (await (await request.get(`${API}/folder-roots`)).json()) as Record<string, number>
  )['mine'];
  await expect(mine.locator('.folder-tree__count').first()).toHaveText(String(before));

  const count = pane(page)
    .getByRole('treeitem', { name: `Counted there ${unique}`, exact: true })
    .locator('.folder-tree__count')
    .first();
  await expect(count).toHaveText('1');

  // Moved there from the row's menu: its count goes up by one.
  await page
    .getByRole('tree')
    .getByRole('button', { name: `Counted home ${unique}` })
    .click();
  await page
    .getByTestId(`item-${board}`)
    .getByRole('button', { name: /^Actions for / })
    .click();
  await page.getByRole('menuitem', { name: 'Move to…' }).click();
  await page
    .getByTestId(`item-${board}`)
    .getByRole('combobox')
    .selectOption({ label: `Shared / Counted there ${unique}` });
  await expect(count).toHaveText('2');
});

test('the tree is a full-height pane that stays put while the contents scroll', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 600 });
  await page.goto('/explore');
  const aside = pane(page);
  const shared = aside.getByRole('treeitem', { name: 'Shared', exact: true });
  await expect(shared).toBeVisible();
  // The contents loaded, so the page is long enough to scroll: the seed alone
  // puts thirty dashboards at the top.
  await expect(contentsOf(page).getByRole('row').nth(20)).toBeVisible();

  // Full height: from below the app bar to the bottom of the viewport.
  const box = await aside.boundingBox();
  expect((box?.y ?? 0) + (box?.height ?? 0)).toBeGreaterThan(600 - 24);

  // The list scrolls beside it (T244: the page itself no longer does).
  const before = (await aside.boundingBox())?.y ?? 0;
  const scroller = contentsOf(page).getByRole('table').locator('..');
  await scroller.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  // Scrolled well down the list, and the pane did not move with it.
  expect(await scroller.evaluate((element) => element.scrollTop)).toBeGreaterThan(200);
  expect((await aside.boundingBox())?.y).toBeCloseTo(before, 0);
  await expect(shared).toBeInViewport();
});

/**
 * T216 / AC-195: WHEN the user opens a dashboard or a library chart from
 * Explore, THE SYSTEM SHALL show a breadcrumb back to its folder, and
 * returning by it, or reloading Explore, SHALL show that folder.
 * `Fails when: the breadcrumb is missing, or returning or reloading lands on a
 * folder other than the item's.`
 */
for (const [kind, id, title] of [
  ['dashboard', 'seed-folder-0-item-1', 'Finance dashboard 1'],
  ['library chart', 'seed-folder-0-item-3', 'Finance chart 3'],
] as const)
  test(`a ${kind} opened from Finance leads back to Finance by its breadcrumb, and a reload keeps it`, async ({
    page,
  }) => {
    await openFinance(page);
    await page.getByTestId(`item-${id}`).getByRole('button', { name: title, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/${id}$`));

    if (kind === 'dashboard') {
      // A dashboard's way back is one step, its whole path in its name
      // (T830, AC-485; design 19, 19-Q9).
      const back = page.locator('.dashboard__header').getByRole('link', {
        name: 'Back to Shared / Finance',
      });
      await expect(back).toHaveText('← Finance');
      await expect(back).toHaveAttribute('title', 'Back to Shared / Finance');
      await back.click();
    } else {
      const trail = page.getByRole('main').getByRole('navigation', { name: 'Breadcrumb' });
      await expect(trail.getByRole('link')).toHaveText(['← Explore', 'Shared', 'Finance']);
      await trail.getByRole('link', { name: 'Finance' }).click();
    }

    await expect(heading(page)).toHaveText('Finance');
    await expect(page).toHaveURL(/\/explore\?folder=seed-folder-0$/);
    await page.reload();
    await expect(heading(page)).toHaveText('Finance');
  });

test('Back from a folder being named leaves the rename behind, and renames nothing', async ({
  page,
  request,
}) => {
  const unique = String(Date.now());
  const parent = await folderIn(request, 'root', `Parent ${unique}`);
  await page.goto(`/explore?folder=${parent}`);
  await expect(heading(page)).toHaveText(`Parent ${unique}`);

  // "+ Folder" opens the new folder with its name ready to type...
  await pane(page).getByRole('button', { name: '+ Folder' }).click();
  const name = contentsOf(page).getByRole('textbox', { name: 'Folder name' });
  await expect(name).toBeFocused();
  await name.fill(`Typed ${unique}`);

  // ...and Back, before it is saved, is the parent with no rename open.
  await page.goBack();
  await expect(heading(page)).toHaveText(`Parent ${unique}`);
  await expect(name).toHaveCount(0);
  await page.keyboard.press('Enter');
  await page.reload();
  await expect(heading(page)).toHaveText(`Parent ${unique}`);
});

test('Explore keeps the open folder in its address, so Back and a reload return to it', async ({
  page,
}) => {
  await openFinance(page);
  await expect(page).toHaveURL(/\/explore\?folder=seed-folder-0$/);
  await page.reload();
  await expect(heading(page)).toHaveText('Finance');

  // Another folder, then Back: Finance again.
  await page.getByRole('tree').getByRole('button', { name: 'Marketing', exact: true }).click();
  await expect(heading(page)).toHaveText('Marketing');
  await page.goBack();
  await expect(heading(page)).toHaveText('Finance');
});

/**
 * T692 (AC-192, AC-282, AC-343): making things in My workspace as the
 * designs draw it. New's menu as design 13 state G: headed "New in My
 * workspace", the four kinds that ask for a target, then Folder ("no
 * target"), then Import ("from a file"). New dashboard's target as design 04
 * state A: "Name · required", a tree of full paths, its help line, and the
 * note naming the folder chosen.
 */
test('New in My workspace: its menu as design 13 state G, its target as design 04 state A', async ({
  page,
}) => {
  await page.goto('/explore?folder=mine');
  await page
    .getByTestId('explore-contents')
    .getByRole('button', { name: 'New', exact: true })
    .click();
  const menu = page.getByRole('menu', { name: 'New' });
  await expect(menu.locator('.menu-button__head')).toHaveText('New in My workspace');
  await expect(menu.getByRole('menuitem')).toHaveText([
    /Dashboard$/,
    /Chart$/,
    /Model$/,
    /Data source$/,
    /Folderno target$/,
    /Import a dashboard…from a file$/,
  ]);
  await expect(menu.getByRole('separator')).toHaveCount(2);

  await menu.getByRole('menuitem', { name: 'Dashboard', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'New dashboard in My workspace' });
  await expect(dialog.locator('label', { hasText: 'Name' })).toHaveText('Name · required');
  // Both labels drawn as design 04's .field > label: 12/600 in text-secondary (T692's review).
  const labelStyle = (label: ReturnType<Page['locator']>) =>
    label.evaluate((node) => {
      const style = getComputedStyle(node);
      return [style.fontSize, style.fontWeight, style.color];
    });
  const nameStyle = await labelStyle(dialog.locator('label', { hasText: 'Name' }));
  expect(nameStyle.slice(0, 2)).toEqual(['12px', '600']);
  expect(await labelStyle(dialog.locator('.field__label', { hasText: 'Target folder' }))).toEqual(
    nameStyle,
  );
  const tree = dialog.getByRole('tree', { name: 'Target folder' });
  // The shared root, by its name, and its folders by their whole paths.
  await expect(tree.locator('[data-target="root"]')).toHaveText('Shared');
  await expect(tree.locator('[data-target="seed-folder-0"]')).toHaveText('Finance');
  await expect(dialog.getByText('Only folders where you have read-write access.')).toBeVisible();
  await chooseTarget(dialog, 'seed-folder-0');
  await expect(dialog.locator('.new-item-dialog__note b')).toHaveText('Finance');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toHaveCount(0);
});
