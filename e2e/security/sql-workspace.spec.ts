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
      await expect(workspace(page)).toBeVisible();
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
      await expect(workspace(page)).toBeVisible();
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

/**
 * T797 (AC-386, AC-381, AC-304; direction §7f, rule 91; design 17, screen 1
 * and state O): the three panes, measured. Below 1,024 px both side panes
 * are 40 px rails that open over the centre, and the editor stays usable
 * (design 17's Q1); at 390 px nothing scrolls sideways.
 */
const leftPane = (page: Page) =>
  page.getByRole('complementary', { name: 'Data source and schema' });
const rightPane = (page: Page) => page.getByRole('complementary', { name: 'Saved and History' });
const boxOf = async (page: Page, testId: string) =>
  (await page.getByTestId(testId).boundingBox())!;
/** How far the page and the shell's main region reach past their width. */
const sideways = (page: Page) =>
  page.evaluate(() => {
    const over = (element: Element | null) =>
      element === null ? 0 : element.scrollWidth - element.clientWidth;
    return {
      page: over(document.scrollingElement),
      main: over(document.querySelector('main')),
    };
  });

test.describe('the workspace’s three panes (T797, rule 91)', () => {
  test.use({ role: 'writer' });

  test('at 1,440 px: the left pane 280, the right 320, the editor over the results at 30 : 70', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/sql');
    await expect(workspace(page)).toBeVisible();

    expect(Math.round((await leftPane(page).boundingBox())!.width)).toBe(280);
    expect(Math.round((await rightPane(page).boundingBox())!.width)).toBe(320);
    await expect(leftPane(page).getByRole('heading', { name: 'Data source' })).toBeVisible();
    await expect(leftPane(page).getByRole('heading', { name: 'Schema' })).toBeVisible();
    await expect(rightPane(page).getByRole('heading', { name: 'Saved and History' })).toBeVisible();

    const editor = await boxOf(page, 'sql-editor-area');
    const results = await boxOf(page, 'sql-results-area');
    expect(editor.height).toBeGreaterThanOrEqual(200);
    expect(results.height).toBeGreaterThanOrEqual(160);
    // The split, of the centre's height below its tabs: 30 : 70, to a pixel or two.
    expect(editor.y).toBeLessThan(results.y);
    expect(Math.abs(editor.height / (editor.height + results.height) - 0.3)).toBeLessThan(0.005);
    expect(await sideways(page)).toEqual({ page: 0, main: 0 });
  });

  test('dragging the left pane’s edge holds it within 220–400 px', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/sql');
    const grip = leftPane(page).locator('.sql-pane__grip');
    const at = (await grip.boundingBox())!;
    const y = at.y + at.height / 2;
    await page.mouse.move(at.x + at.width / 2, y);
    await page.mouse.down();
    await page.mouse.move(at.x + 400, y, { steps: 4 });
    await page.mouse.up();
    expect(Math.round((await leftPane(page).boundingBox())!.width)).toBe(400);
  });

  /** Drags a grip by `dx` across and `dy` down with the mouse. */
  const dragBy = async (page: Page, grip: ReturnType<Page['locator']>, dx: number, dy: number) => {
    const at = (await grip.boundingBox())!;
    const x = at.x + at.width / 2;
    const y = at.y + at.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + dx, y + dy, { steps: 4 });
    await page.mouse.up();
  };

  test('at 1,280 px both panes dragged wide still leave the editor 560 px (design 17, state O)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/sql');
    await expect(workspace(page)).toBeVisible();
    await dragBy(page, leftPane(page).locator('.sql-pane__grip'), 300, 0);
    await dragBy(page, rightPane(page).locator('.sql-pane__grip'), -300, 0);

    expect((await boxOf(page, 'sql-editor-area')).width).toBeGreaterThanOrEqual(560);
    expect(await sideways(page)).toEqual({ page: 0, main: 0 });
  });

  test('the editor and results split holds the editor at 200 px and the results at 160', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/sql');
    await expect(workspace(page)).toBeVisible();
    const grip = page.locator('.sql-centre__grip');

    await dragBy(page, grip, 0, 2000);
    const results = await boxOf(page, 'sql-results-area');
    expect(Math.round(results.height)).toBe(160);
    // Within the window: nothing pushed below its foot.
    // To the pixel: the boxes land on sub-pixels.
    expect(Math.round(results.y + results.height)).toBeLessThanOrEqual(900);

    await dragBy(page, grip, 0, -2000);
    expect(Math.round((await boxOf(page, 'sql-editor-area')).height)).toBe(200);
  });

  test('from 1,024 to 1,279 px, Saved and History is a 40 px rail; the left pane stays', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1180, height: 800 });
    await page.goto('/sql');
    await expect(workspace(page)).toBeVisible();

    expect(Math.round((await rightPane(page).boundingBox())!.width)).toBe(40);
    expect(Math.round((await leftPane(page).boundingBox())!.width)).toBe(280);
    // The editor keeps design 17's 560 px.
    expect((await boxOf(page, 'sql-editor-area')).width).toBeGreaterThanOrEqual(560);
  });

  test('below 1,024 px both panes are 40 px rails that open over the centre, the editor usable', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 900, height: 800 });
    await page.goto('/sql');
    await expect(workspace(page)).toBeVisible();

    expect(Math.round((await leftPane(page).boundingBox())!.width)).toBe(40);
    expect(Math.round((await rightPane(page).boundingBox())!.width)).toBe(40);
    const editor = await boxOf(page, 'sql-editor-area');
    expect(editor.width).toBeGreaterThanOrEqual(900 - 80 - 2);
    expect(editor.height).toBeGreaterThanOrEqual(200);

    const open = leftPane(page).getByRole('button', { name: 'Data source and schema' });
    await open.click();
    await expect(open).toHaveAttribute('aria-expanded', 'true');
    const over = (await leftPane(page).locator('.sql-pane__body').boundingBox())!;
    // Over the centre, beside its rail.
    expect(Math.round(over.x)).toBe(40);
    expect(Math.round(over.width)).toBe(280);
    await expect(leftPane(page).getByRole('heading', { name: 'Schema' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(open).toHaveAttribute('aria-expanded', 'false');
    await expect(open).toBeFocused();
    await expect(leftPane(page).getByRole('heading', { name: 'Schema' })).toBeHidden();

    const history = rightPane(page).getByRole('button', { name: 'Saved and History' });
    await history.click();
    await expect(
      rightPane(page).getByRole('heading', { name: 'Saved and History' }),
    ).toBeVisible();
    // The editor is still there to type in, beside the open pane.
    expect((await boxOf(page, 'sql-editor-area')).width).toBeGreaterThanOrEqual(900 - 80 - 2);
  });

  test('at 390 px nothing scrolls sideways, a pane open or not (AC-304)', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/sql');
    await expect(workspace(page)).toBeVisible();
    expect(await sideways(page)).toEqual({ page: 0, main: 0 });

    await leftPane(page).getByRole('button', { name: 'Data source and schema' }).click();
    await expect(leftPane(page).getByRole('heading', { name: 'Schema' })).toBeVisible();
    expect(await sideways(page)).toEqual({ page: 0, main: 0 });
    const over = (await leftPane(page).locator('.sql-pane__body').boundingBox())!;
    expect(over.x + over.width).toBeLessThanOrEqual(390);
  });
});
