import { readFileSync } from 'node:fs';

import type { Browser, Page } from '@playwright/test';
import { sealSecretV1, type XcubeKey } from '@wechart/core';

import { BASE_URL, expect, signInThroughDex, test, testedSource } from './fixtures';

/**
 * F42, the SQL runner workspace (R78; design 17), with sign-in on.
 *
 * T796 (AC-001, AC-446): SQL runner sits in the switcher after Schedules for
 * Super-Admins and read-write members, and opens the workspace at `/sql`; a
 * read-only user opening `/sql` sees Not found and none of the workspace
 * (design 17, state A; rule 67).
 */
const RUN = Math.random().toString(36).slice(2, 8);
const world = { folderId: '', sources: { on: '', off: '' } };
/** Names held once across the system (T700, AC-421). */
const SOURCES = { on: `sqlws_on_${RUN}`, off: `sqlws_off_${RUN}` };
const KEY = JSON.parse(
  readFileSync(new URL('../../infra/xcube/dev-credential-key.pub.jwk', import.meta.url), 'utf8'),
) as XcubeKey;
const FIELDS = { host: 'sample-db', port: 5432, database: 'sample', user: 'sample', ssl: false };

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
    // Two data sources on the sample database there: one switched on, one off (T798).
    for (const which of ['on', 'off'] as const) {
      const request = admin.page.request;
      const made = await request.post('/api/data-sources', {
        data: await testedSource(request, {
          folderId: world.folderId,
          name: SOURCES[which],
          driver: 'postgres',
          authMethod: 'password',
          fields: FIELDS,
          sealed: {
            password: await sealSecretV1(KEY, 'postgres', 'password', FIELDS, 'sample'),
          },
        }),
      });
      expect(made.status(), await made.text()).toBe(201);
      world.sources[which] = ((await made.json()) as { id: string }).id;
    }
    const on = await admin.page.request.put(`/api/data-sources/${world.sources.on}/sql-runner`, {
      data: { on: true, readOnlyConfirmed: true },
    });
    expect(on.status(), await on.text()).toBe(200);
  } finally {
    await admin.context.close();
  }
});

test.afterAll(async ({ browser }) => {
  const admin = await signedIn(browser, 'super');
  try {
    for (const id of Object.values(world.sources))
      if (id !== '') await admin.page.request.delete(`/api/data-sources/${id}`);
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

/**
 * T798 (AC-447, AC-373, AC-383, AC-384): the data source picker, against
 * compose's xcube. The folder's on source and its off one, grouped under its
 * path, each with its driver and state; the off one chosen shows the off
 * panel, with Turn on… for a Super-Admin alone, and no editor.
 */
const pickerButton = (page: Page) =>
  leftPane(page).getByRole('button', { name: /^Data source (?!and)/ });
const groupOf = (page: Page) =>
  page.getByRole('listbox', { name: 'Data sources' }).getByRole('group', {
    name: `Shared / SQL workspace ${RUN}`,
  });

test.describe('the data source picker (T798, AC-447)', () => {
  test.describe('as writer, a read-write member of the folder', () => {
    test.use({ role: 'writer' });

    test('lists the folder’s on and off sources under its path, each with its driver and state', async ({
      page,
    }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto('/sql');
      await pickerButton(page).click();

      const options = groupOf(page).getByRole('option');
      await expect(options).toHaveCount(2);
      await expect(options.filter({ hasText: SOURCES.off })).toContainText('PostgreSQL');
      await expect(options.filter({ hasText: SOURCES.off }).locator('.sql-picker__state')).toHaveText(
        'Off',
      );
      await expect(
        options.filter({ hasText: SOURCES.on }).locator('.sql-picker__state'),
      ).toHaveText('SQL runner on');
      // My workspace's group, where the writer has one, comes before every folder's.
      const labels = await page
        .getByRole('listbox', { name: 'Data sources' })
        .getByRole('group')
        .evaluateAll((groups) => groups.map((group) => group.getAttribute('aria-label')));
      expect(labels.indexOf('My workspace Yours')).toBeLessThan(1);
      expect(labels.indexOf(`Shared / SQL workspace ${RUN}`)).toBeGreaterThan(
        labels.indexOf('My workspace Yours'),
      );
    });

    test('an off source chosen shows the off panel, with no Turn on… and no editor', async ({
      page,
    }) => {
      await page.goto('/sql');
      await pickerButton(page).click();
      await groupOf(page).getByRole('option', { name: new RegExp(SOURCES.off) }).click();

      await expect(
        page.getByRole('heading', { name: `The SQL runner is off for ${SOURCES.off}` }),
      ).toBeVisible();
      await expect(page.getByText(/Only a Super-Admin can turn it on/)).toBeVisible();
      await expect(page.getByRole('button', { name: /Turn on the SQL runner/ })).toHaveCount(0);
      await expect(page.getByTestId('sql-editor-area')).toHaveCount(0);
      await expect(page.getByTestId('sql-picker-chosen')).toHaveText(`SQL workspace ${RUN} · Off`);
    });
  });

  test.describe('as super', () => {
    test.use({ role: 'super' });

    test('an off source chosen shows the off panel with Turn on…', async ({ page }) => {
      await page.goto('/sql');
      await pickerButton(page).click();
      await groupOf(page).getByRole('option', { name: new RegExp(SOURCES.off) }).click();

      await expect(
        page.getByRole('heading', { name: `The SQL runner is off for ${SOURCES.off}` }),
      ).toBeVisible();
      await expect(page.getByRole('button', { name: 'Turn on the SQL runner…' })).toBeVisible();
      await expect(page.getByTestId('sql-editor-area')).toHaveCount(0);
    });
  });
  test.describe('as writer, on a first visit (T799, AC-466)', () => {
    test.use({ role: 'writer' });

    test('one tab, “Query 1”, no data source, focus on the picker, and the sentence to choose one', async ({
      page,
    }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto('/sql');

      const tabs = page.getByRole('tablist', { name: 'SQL tabs' }).getByRole('tab');
      await expect(tabs).toHaveText(['Query 1']);
      await expect(tabs.first()).toHaveAttribute('aria-selected', 'true');
      await expect(pickerButton(page)).toHaveText(/Choose…/);
      await expect(pickerButton(page)).toBeFocused();
      await expect(page.getByText('Choose a data source to write SQL against.')).toBeVisible();
      await expect(page.getByTestId('sql-picker-chosen')).toHaveCount(0);
    });

    test('below 1,024 px, focus on the rail’s button that opens the picker', async ({ page }) => {
      await page.setViewportSize({ width: 900, height: 800 });
      await page.goto('/sql');

      await expect(
        leftPane(page).getByRole('button', { name: 'Data source and schema' }),
      ).toBeFocused();
      await expect(page.getByText('Choose a data source to write SQL against.')).toBeVisible();
    });
  });
  // Who sees a folder only from below, or reads it, is the API's to hold
  // (`routes/sql-sources.test.ts`): here those users have no workspace to
  // open the picker in.
});
