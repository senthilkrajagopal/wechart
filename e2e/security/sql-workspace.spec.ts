import type { Browser, Page } from '@playwright/test';

import { BASE_URL, expect, signInThroughDex, test } from './fixtures';

/**
 * F42, the SQL runner workspace (R78; design 17), with sign-in on.
 *
 * T796 (AC-001, AC-446): SQL runner sits in the switcher after Schedules for
 * Super-Admins and read-write members, and opens the workspace at `/sql`; a
 * read-only user opening `/sql` sees Not found and none of the workspace
 * (design 17, state A; rule 67).
 */
const RUN = Math.random().toString(36).slice(2, 8);
const world = { folderId: '' };

// One world for the file's tests, in order, in one worker.
test.describe.configure({ mode: 'default' });

const switcher = (page: Page) =>
  page.getByRole('banner').getByRole('navigation', { name: 'Workspaces' }).first();
const workspace = (page: Page) => page.getByRole('region', { name: 'SQL runner' });

/** A page of a role's, signed in afresh in a context of its own. */
async function signedIn(browser: Browser, role: 'super' | 'writer' | 'reader') {
  const context = await browser.newContext({
    baseURL: BASE_URL,
    storageState: { cookies: [], origins: [] },
  });
  const page = await context.newPage();
  await signInThroughDex(page, role);
  return { context, page };
}

/**
 * A folder read-write for `sales-rw` (writer) and read-only for `sales-ro`
 * (reader), made by `super`: what makes writer a read-write member, whatever
 * else the database holds.
 */
test.beforeAll(async ({ browser }) => {
  const admin = await signedIn(browser, 'super');
  try {
    const made = await admin.page.request.post('/api/documents', {
      data: { kind: 'folder', title: `SQL workspace ${RUN}`, folderId: 'root' },
    });
    expect(made.status()).toBe(201);
    world.folderId = ((await made.json()) as { id: string }).id;
    const access = await admin.page.request.put(`/api/folders/${world.folderId}/access`, {
      data: { readOnly: ['sales-ro'], readWrite: ['sales-rw'] },
    });
    expect(access.status()).toBe(200);
  } finally {
    await admin.context.close();
  }
});

test.afterAll(async ({ browser }) => {
  const admin = await signedIn(browser, 'super');
  try {
    if (world.folderId !== '')
      await admin.page.request.delete(`/api/documents/folder/${world.folderId}`);
  } finally {
    await admin.context.close();
  }
});

test.describe('SQL runner in the switcher (T796, AC-001, AC-446)', () => {
  test.describe('as writer, a read-write member', () => {
    test.use({ role: 'writer' });

    test('SQL runner, after Schedules, opens the workspace at /sql', async ({ page }) => {
      await page.goto('/explore');
      const entries = switcher(page).getByRole('link');
      await expect(entries).toHaveText([
        'Explore',
        'Data sources',
        'Jobs',
        'Schedules',
        'SQL runner',
      ]);

      await switcher(page).getByRole('link', { name: 'SQL runner' }).click();

      await expect(page).toHaveURL(/\/sql$/);
      // Its panes arrive with T797; here, the workspace and its heading.
      await expect(workspace(page)).toBeAttached();
      await expect(page.getByRole('heading', { level: 1, name: 'SQL runner' })).toBeAttached();
      await expect(switcher(page).getByRole('link', { name: 'SQL runner' })).toHaveAttribute(
        'aria-current',
        'page',
      );
    });
  });

  test.describe('as super, a Super-Admin', () => {
    test.use({ role: 'super' });

    test('SQL runner opens the workspace, with Security after it', async ({ page }) => {
      await page.goto('/sql');
      await expect(workspace(page)).toBeAttached();
      await expect(switcher(page).getByRole('link')).toHaveText([
        'Explore',
        'Data sources',
        'Jobs',
        'Schedules',
        'SQL runner',
        'Security',
      ]);
    });
  });

  test.describe('as reader, read-only everywhere', () => {
    test.use({ role: 'reader' });

    test('has no SQL runner in the switcher, and /sql shows Not found and none of the workspace', async ({
      page,
    }) => {
      await page.goto('/explore');
      await expect(switcher(page).getByRole('link')).toHaveText(['Explore']);

      await page.goto('/sql');

      await expect(page.getByRole('heading', { level: 1, name: 'Not found' })).toBeVisible();
      await expect(workspace(page)).toHaveCount(0);
      await expect(switcher(page).getByRole('link', { name: 'SQL runner' })).toHaveCount(0);
    });
  });
});
