import { expect, test } from '@playwright/test';

/**
 * AC-019: WHEN the user types in the Explore search box, THE SYSTEM SHALL list
 * every dashboard and library chart whose title contains the text, and no
 * dashboard-local chart.
 * Fails when: a matching library item is missing, or a dashboard-local chart
 * appears in the results.
 *
 * The seed includes a chart local to a dashboard, titled so it would match the
 * same search as the library items. Without it this criterion's second half
 * could not fail.
 *
 * **The Explore search box, not the ⌘K palette.** AC-019 was first ticked on
 * the palette, and reopened on 2026-09-24 when the user compared Explore with
 * the prototype: the criterion names "the Explore search box", and the
 * prototype has one beside the folder title as well as the global search.
 */
const SHORTCUT = process.platform === 'darwin' ? 'Meta+k' : 'Control+k';

async function search(page: import('@playwright/test').Page, text: string) {
  await page.goto('/explore');
  const contents = page.getByTestId('explore-contents');
  await contents.getByRole('searchbox', { name: 'Search dashboards and charts' }).fill(text);
  return contents;
}

/** The names of the items listed, as the table's row headers say them. */
const names = (contents: import('@playwright/test').Locator) => contents.getByRole('rowheader');

const API = 'http://localhost:4100/api';

test('lists every dashboard and library chart whose title contains the text, and no local chart', async ({
  page,
  request,
}) => {
  /**
   * Fixtures of its own, so "every" can be counted: a dashboard and a library
   * chart sharing a word no other title has, and a chart local to that
   * dashboard with the same word, which must not appear. A test that only
   * looked at the first row would pass a list missing everything after it.
   */
  const word = `Findable${String(Date.now())}`;
  const create = async (kind: 'dashboard' | 'chart', title: string) =>
    (
      (await (
        await request.post(`${API}/documents`, { data: { kind, title, folderId: 'root' } })
      ).json()) as { id: string }
    ).id;
  const dashboard = await create('dashboard', `Sales ${word} dashboard`);
  await create('chart', `Revenue ${word} chart`);
  const local = await create('chart', `Local ${word} chart`);
  await request.put(`${API}/documents/chart/${local}`, {
    data: {
      version: 1,
      body: {
        schemaVersion: 1,
        title: `Local ${word} chart`,
        owner: 'admin',
        localToDashboardId: dashboard,
        chart: {
          source: { cube: 'orders' },
          wells: { measures: ['orders.count'], dimensions: [], timeDimensions: [] },
        },
      },
    },
  });

  const contents = await search(page, word.toLowerCase());

  // Search results, not the folder: the heading says so.
  await expect(contents.getByRole('heading', { level: 1 })).toHaveText('Search');
  // Exactly the two library items, in title order — both kinds, none left out.
  await expect(names(contents)).toHaveText([`Revenue ${word} chart`, `Sales ${word} dashboard`]);
});

test('matches anywhere in the title, not only at the start', async ({ page }) => {
  const contents = await search(page, 'chart 3');

  await expect(names(contents).first()).toContainText('chart 3');
});

test('never lists a chart that belongs to a dashboard', async ({ page }) => {
  const contents = await search(page, 'Seeded local chart');

  // The seeded local chart matches this text exactly and must still not appear.
  await expect(contents.getByText('Nothing matches.')).toBeVisible();
  await expect(names(contents)).toHaveCount(0);
});

test('finds a library chart with a similar name, so the exclusion is not just an empty search', async ({
  page,
}) => {
  const contents = await search(page, 'Finance chart');

  await expect(names(contents).first()).toContainText('Finance chart');
});

test('clearing the box goes back to the folder it was searching from', async ({ page }) => {
  // From Finance, not the root: returning to the root would pass a weaker test.
  await page.goto('/explore');
  await page.getByRole('tree').getByRole('button', { name: 'Finance' }).click();
  const contents = page.getByTestId('explore-contents');
  await expect(contents.getByRole('heading', { level: 1 })).toHaveText('Finance');
  const box = contents.getByRole('searchbox', { name: 'Search dashboards and charts' });

  await box.fill('Company dashboard');
  await expect(names(contents).first()).toContainText('Company dashboard');

  await box.fill('');

  await expect(contents.getByRole('heading', { level: 1 })).toHaveText('Finance');
  // Finance's own contents again: its charts, not the search's dashboards.
  await expect(names(contents).first()).toContainText('Finance');
});

test('the ⌘K palette finds the same library items', async ({ page }) => {
  // The global search (AC-006) searches the same catalog; kept so the palette
  // does not lose the coverage these tests used to give it.
  await page.goto('/explore');
  await expect(page.getByRole('button', { name: /theme/i })).toBeVisible();
  await page.keyboard.press(SHORTCUT);
  // Inside the palette: Explore's own box has the same name.
  const palette = page.getByRole('dialog', { name: 'Search' });
  await palette.getByRole('combobox').fill('Finance chart');

  const results = palette.getByRole('listbox', { name: /search results/i });
  await expect(results.getByRole('option').first()).toContainText('Finance chart');
});
