import { expect, test } from '@playwright/test';

/**
 * AC-020: WHEN the user creates a folder, dashboard or chart from Explore, THE
 * SYSTEM SHALL place it in the selected folder and open it.
 * Fails when: the new object lands in a different folder, or is not opened.
 *
 * Both halves are asserted every time: where it landed, and that the app went
 * there. Creating something and leaving the user where they were makes them
 * hunt for it.
 */
/**
 * Through the one New menu (AC-192), as the prototype creates: at once, under
 * a default name — "Untitled dashboard", "Untitled chart", or "New folder"
 * renamed in the heading — rather than behind a form asking for a name first.
 */
async function createIn(
  page: import('@playwright/test').Page,
  kind: 'Folder' | 'Dashboard' | 'Chart',
) {
  await page
    .getByTestId('explore-contents')
    .getByRole('button', { name: 'New', exact: true })
    .click();
  await page.getByRole('menu', { name: 'New' }).getByRole('menuitem', { name: kind }).click();
}

/** The folder a created item's id says it landed in, read from Explore. */
async function listedIn(page: import('@playwright/test').Page, folder: string, id: string) {
  await page.goto('/explore');
  await page.getByRole('tree').getByRole('button', { name: folder }).click();
  await expect(page.getByTestId(`item-${id}`)).toBeVisible();
}

test('creates a dashboard in the selected folder and opens it', async ({ page }) => {
  await page.goto('/explore');
  await page.getByRole('tree').getByRole('button', { name: 'Finance' }).click();
  await expect(page.getByTestId('explore-contents').getByRole('table')).toBeVisible();

  await createIn(page, 'Dashboard');

  // Opened: the URL names the new object and the surface shows it, by the
  // dashboard's own title — what a reader sees.
  await expect(page).toHaveURL(/\/explore\/dashboards\//);
  await expect(page.getByRole('heading', { name: 'Untitled dashboard' })).toBeVisible();

  // Landed in Finance, not at the root: this one, by its id — the title is
  // shared by every dashboard created this way.
  // By the path alone: the address carries `?editing=true` until edit mode
  // has begun (T245's review).
  const id = decodeURIComponent(new URL(page.url()).pathname.split('/').pop() ?? '');
  await listedIn(page, 'Finance', id);
});

test('creates a chart in the selected folder and opens it', async ({ page }) => {
  await page.goto('/explore');
  await page.getByRole('tree').getByRole('button', { name: 'Finance' }).click();

  await createIn(page, 'Chart');

  // Opened in the chart editor, to be built (AC-213).
  await expect(page).toHaveURL(/\/explore\/charts\/[^/]+\/edit$/);
  const id = decodeURIComponent(page.url().split('/').at(-2) ?? '');
  await listedIn(page, 'Finance', id);
});

test('creates a folder and selects it, empty, with its name ready to type', async ({ page }) => {
  await page.goto('/explore');
  const title = `Created folder ${String(Date.now())}`;

  await createIn(page, 'Folder');

  // The prototype's flow: selected at once, its name in the heading, ready to
  // be replaced by typing.
  const name = page.getByTestId('explore-contents').getByRole('textbox', { name: 'Folder name' });
  await expect(name).toBeFocused();
  await expect(name).toHaveValue('New folder');
  await name.fill(title);
  await name.press('Enter');

  // A folder has no page of its own, so opening it means selecting it.
  await expect(page.getByRole('treeitem', { name: title, selected: true })).toBeVisible();
  await expect(page.getByTestId('explore-contents')).toContainText(/empty/i);
});

test('a folder name emptied while renaming falls back to "Untitled folder"', async ({ page }) => {
  // What stopped a nameless object before was a disabled Create; with the
  // name typed after creating, a blank one gets a name rather than none.
  await page.goto('/explore');
  await createIn(page, 'Folder');
  const name = page.getByTestId('explore-contents').getByRole('textbox', { name: 'Folder name' });
  await name.fill('');
  await name.press('Enter');

  await expect(page.getByTestId('explore-contents').getByRole('heading', { level: 1 })).toHaveText(
    'Untitled folder',
  );
});
