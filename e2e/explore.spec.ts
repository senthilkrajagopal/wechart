import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

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

  const firstItem = page.getByTestId('explore-contents').getByRole('row').nth(1);
  const cells = firstItem.getByRole('cell');

  await expect(cells.nth(0)).toContainText(/dashboard|chart|folder/i);
  await expect(cells.nth(1)).not.toBeEmpty();
  await expect(cells.nth(2)).not.toBeEmpty();
});

test('selecting a folder shows that folder’s contents', async ({ page }) => {
  await page.goto('/explore');
  const contents = page.getByTestId('explore-contents');
  await expect(contents.getByRole('table')).toBeVisible();

  // Scoped to the tree: "Finance" is also a row in the contents list, and an
  // unscoped query matches both.
  await page.getByRole('tree').getByRole('button', { name: 'Finance' }).click();

  await expect(contents.getByRole('row').nth(1)).toContainText(/Finance/);
});

/**
 * AC-003, the half T007 could not demonstrate: switching the theme must not
 * lose scroll position. This is the first surface long enough to scroll.
 */
test('switching theme keeps the scroll position (AC-003)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 600 });
  await page.goto('/explore');
  await expect(page.getByTestId('explore-contents').getByRole('table')).toBeVisible();

  await page.evaluate(() => window.scrollTo(0, 400));
  const before = await page.evaluate(() => window.scrollY);
  // The assertion is worthless unless the page really scrolled.
  expect(before).toBeGreaterThan(0);

  await page.getByRole('button', { name: /theme/i }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  expect(await page.evaluate(() => window.scrollY)).toBe(before);
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
  await openFinance(page);

  // No separate create buttons beside it.
  for (const old of ['New folder', 'New dashboard', 'New chart'])
    await expect(page.getByRole('button', { name: old, exact: true })).toHaveCount(0);

  // Exact: a row for a folder called "New folder …" also contains the word.
  await contentsOf(page).getByRole('button', { name: 'New', exact: true }).click();
  const menu = page.getByRole('menu', { name: 'New' });
  // By label: each item leads with its type's icon chip, which is decorative.
  await expect(menu.getByRole('menuitem')).toHaveText([/Dashboard$/, /Chart$/, /Folder$/]);

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
