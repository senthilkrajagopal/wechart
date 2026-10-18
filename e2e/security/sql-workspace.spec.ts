import { execFileSync } from 'node:child_process';
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
const world = { folderId: '', sources: { on: '', off: '', two: '' } };
/** Names held once across the system (T700, AC-421); `two`, a second one on, for two tabs (T802). */
const SOURCES = { on: `sqlws_on_${RUN}`, off: `sqlws_off_${RUN}`, two: `sqlws_two_${RUN}` };
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
async function signedIn(browser: Browser, role: 'super' | 'writer' | 'reader' | 'manager') {
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
      // `managers` too: T804's long runs go as manager, as no other spec runs SQL as
      // them, so its one-run-per-person hold never meets another spec's run.
      data: { readOnly: ['sales-ro'], readWrite: ['sales-rw', 'managers'] },
    });
    expect(access.status()).toBe(200);
    // Two data sources on the sample database there: one switched on, one off (T798).
    for (const which of ['on', 'off', 'two'] as const) {
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
    for (const id of [world.sources.on, world.sources.two]) {
      const on = await admin.page.request.put(`/api/data-sources/${id}/sql-runner`, {
        data: { on: true, readOnlyConfirmed: true },
      });
      expect(on.status(), await on.text()).toBe(200);
    }
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

      // /sql, which names its open tab once it has drawn (T801, AC-451): `?tab=` and the tab's id.
      await expect(page).toHaveURL(/\/sql(\?tab=[0-9a-f]{8})?$/);
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
    /**
     * Dragged to the window's own edge, past both limits. Not beyond it:
     * Playwright's Firefox delivers a synthetic pointer move outside the
     * window at the wrong place (a move to y 1,329 arrived at -85) and drops
     * its pointerup, which a person's drag doesn't (the grip holds its
     * limits in Firefox when dragged within the window).
     */
    const dragToY = async (y: number) => {
      const at = (await grip.boundingBox())!;
      await page.mouse.move(at.x + at.width / 2, at.y + at.height / 2);
      await page.mouse.down();
      await page.mouse.move(at.x + at.width / 2, y, { steps: 4 });
      await page.mouse.up();
    };

    // To the foot of the window, which would leave the results under 50 px: they hold at 160.
    await dragToY(899);
    const results = await boxOf(page, 'sql-results-area');
    expect(Math.round(results.height)).toBe(160);
    // Within the window: nothing pushed below its foot.
    // To the pixel: the boxes land on sub-pixels.
    expect(Math.round(results.y + results.height)).toBeLessThanOrEqual(900);

    // To the top of the window, above the editor's own top: it holds at 200.
    await dragToY(1);
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
      // The folder's three: on, off, and a second on (T802's).
      await expect(options).toHaveCount(3);
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

/**
 * T801 (AC-451, AC-446): open tabs kept in this browser only, for the
 * signed-in user, restored on reload, the open one named in the address;
 * no tab sent to wechart's server, nor held in its metadata database.
 */
test.describe('tabs kept in this browser, the open one in the address (T801, AC-451, AC-446)', () => {
  const MARKER = `tab_${RUN}_kept`;
  const tabs = (page: Page) => page.getByRole('tablist', { name: 'SQL tabs' }).getByRole('tab');

  test('a reload opens the tab the address names, with its name and data source; no other browser or user sees it', async ({
    browser,
  }) => {
    const writer = await signedIn(browser, 'writer');
    const sent: string[] = [];
    writer.page.on('request', (request) => {
      sent.push(`${request.url()} ${request.postData() ?? ''}`);
    });
    try {
      const { page } = writer;
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto('/sql');
      await expect(tabs(page)).toHaveText(['Query 1']);

      // A second tab, named and on the folder's source.
      await page.getByRole('button', { name: 'New tab' }).click();
      await page.getByRole('button', { name: 'Actions for Query 2' }).click();
      await page.getByRole('menuitem', { name: 'Rename…' }).click();
      await page.getByRole('dialog', { name: 'Rename Query 2' }).getByRole('textbox', { name: 'Name' }).fill(MARKER);
      await page.getByRole('button', { name: 'Rename', exact: true }).click();
      await pickerButton(page).click();
      await groupOf(page).getByRole('option', { name: new RegExp(SOURCES.on) }).click();
      const kept = tabs(page).filter({ hasText: MARKER });
      await expect(kept).toHaveAttribute('aria-label', `${MARKER}, Not run yet, on ${SOURCES.on}`);
      const id = (await kept.getAttribute('id'))?.replace(/^.*-tab-/, '') ?? '';
      expect(id).toMatch(/^[0-9a-f]{8}$/);
      // The address names the open tab (AC-446).
      await expect(page).toHaveURL(new RegExp(`/sql\\?tab=${id}$`));

      // Another tab opened, then the address of the kept one reloaded.
      await tabs(page).first().click();
      await page.goto(`/sql?tab=${id}`);
      await expect(tabs(page)).toHaveText(['Query 1', MARKER]);
      await expect(tabs(page).filter({ hasText: MARKER })).toHaveAttribute('aria-selected', 'true');
      await expect(tabs(page).filter({ hasText: MARKER })).toHaveAttribute(
        'aria-label',
        `${MARKER}, Not run yet, on ${SOURCES.on}`,
      );
      await expect(pickerButton(page)).toContainText(SOURCES.on);
      await page.reload();
      await expect(tabs(page).filter({ hasText: MARKER })).toHaveAttribute('aria-selected', 'true');

      // No request to the API carried the tab (AC-451).
      expect(
        sent.filter((line) => line.includes(MARKER) || (line.includes('/api/') && line.includes(id))),
      ).toEqual([]);
    } finally {
      await writer.context.close();
    }

    // Another browser, the same user: SQL runner starts with Query 1.
    const elsewhere = await signedIn(browser, 'writer');
    try {
      await elsewhere.page.goto('/sql');
      await expect(tabs(elsewhere.page)).toHaveText(['Query 1']);
    } finally {
      await elsewhere.context.close();
    }

    // The metadata database holds no tab.
    const dump = execFileSync(
      'docker',
      ['exec', 'wechart-meta', 'pg_dump', '-U', 'wechart', '--format=plain', 'wechart_security'],
      { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 },
    );
    expect(dump.includes(MARKER)).toBe(false);
  });

  test('another user signed in to the same browser sees none of them', async ({ browser }) => {
    const context = await browser.newContext({
      baseURL: BASE_URL,
      storageState: { cookies: [], origins: [] },
    });
    try {
      const page = await context.newPage();
      await signInThroughDex(page, 'writer');
      await page.goto('/sql');
      await page.getByRole('button', { name: 'New tab' }).click();
      await expect(tabs(page)).toHaveText(['Query 1', 'Query 2']);

      // Signed out, by its cookies; the browser's storage stays.
      await context.clearCookies();
      await signInThroughDex(page, 'super');
      await page.goto('/sql');
      await expect(tabs(page)).toHaveText(['Query 1']);
    } finally {
      await context.close();
    }
  });
});

/**
 * T802 (AC-373, AC-385, AC-380, AC-446, AC-450): an allowed member runs a
 * tab's SQL on its data source from the workspace, under the run line and
 * the warning naming it, and gets the grid, its types, the row count, the
 * time and the CSV; two tabs on two sources each name their own; and a
 * reload of a tab's address brings back its text.
 */
test.describe('running a tab’s SQL in the workspace (T802)', () => {
  const tabs = (page: Page) => page.getByRole('tablist', { name: 'SQL tabs' }).getByRole('tab');
  const editor = (page: Page) => page.locator('.sql-editor .cm-content');
  /** The editor's text replaced by `sql`, typed as a person types it. */
  async function typeSql(page: Page, sql: string) {
    await editor(page).click();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.press('Delete');
    await page.keyboard.type(sql);
  }
  async function choose(page: Page, name: string) {
    await pickerButton(page).click();
    await groupOf(page).getByRole('option', { name: new RegExp(name) }).click();
  }

  test('runs SELECT on the tab’s own source, with the grid, types, rows, time and CSV; two tabs name their own', async ({
    browser,
  }) => {
    const { context, page } = await signedIn(browser, 'writer');
    const posts: string[] = [];
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.url().endsWith('/sql')) posts.push(request.url());
    });
    try {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto('/sql');
      await choose(page, SOURCES.on);

      // The run line and the warning, above the editor, naming the tab's source and login (AC-385).
      await expect(page.getByTestId('sql-runline')).toHaveText('Runs on sample at sample-db:5432, as sample');
      const warning = page.getByTestId('sql-warning');
      await expect(warning).toHaveText(
        `This SQL runs on ${SOURCES.on}’s database directly, as sample. Folder permissions and access policies don’t apply here: you can read whatever that login can read.`,
      );
      expect((await warning.boundingBox())!.y).toBeLessThan((await page.locator('.sql-editor').boundingBox())!.y);
      await expect(warning.getByRole('button')).toHaveCount(0);

      await typeSql(page, "SELECT 1 AS one, 'a' AS letter");
      await page.getByRole('button', { name: 'Run', exact: true }).click();
      const grid = page.getByRole('table', { name: 'Result: 1 row, 2 columns' });
      await expect(grid.getByRole('columnheader')).toHaveText(['#', 'oneint4', 'lettertext']);
      await expect(page.getByTestId('sql-result-head')).toHaveText(
        // Make a cube… and Make a chart… before Download CSV, for a read-write member (T819, AC-461).
        /^Finished 1 row · (under )?[\d.]+ s · at \d\d:\d\d:\d\dMake a cube…Make a chart…Download CSV$/,
      );
      await expect(tabs(page).first()).toHaveAttribute('aria-label', `Query 1, Finished, 1 row, on ${SOURCES.on}`);
      const [download] = await Promise.all([
        page.waitForEvent('download'),
        page.getByRole('button', { name: 'Download CSV' }).click(),
      ]);
      expect(readFileSync(await download.path(), 'utf8')).toBe('one,letter\r\n1,a\r\n');
      expect(posts).toEqual([`${BASE_URL}/api/data-sources/${world.sources.on}/sql`]);

      // A second tab on another source: its own line, warning and runs.
      await page.getByRole('button', { name: `New tab on ${SOURCES.on}` }).click();
      await choose(page, SOURCES.two);
      await expect(warning).toContainText(`This SQL runs on ${SOURCES.two}’s database directly`);
      await typeSql(page, 'SELECT 2 AS two');
      await page.getByRole('button', { name: 'Run', exact: true }).click();
      await expect(page.getByRole('table', { name: 'Result: 1 row, 1 column' })).toBeVisible();
      expect(posts[1]).toBe(`${BASE_URL}/api/data-sources/${world.sources.two}/sql`);

      // Back on the first: its source and its result again (AC-450).
      await tabs(page).first().click();
      await expect(warning).toContainText(`This SQL runs on ${SOURCES.on}’s database directly`);
      await expect(grid).toBeVisible();

      // Another source for it: the SQL kept, the result cleared at once (design 17's Q5).
      await choose(page, SOURCES.two);
      await expect(editor(page)).toHaveText("SELECT 1 AS one, 'a' AS letter");
      await expect(grid).toHaveCount(0);
      await expect(page.getByText('Run a SELECT or EXPLAIN to see its rows here.')).toBeVisible();

      // The second tab's text, changed since its run: closing it asks first (AC-450).
      await tabs(page).nth(1).click();
      await typeSql(page, 'SELECT 3');
      await page.getByRole('button', { name: 'Actions for Query 2' }).click();
      await expect(page.getByRole('menu', { name: 'Actions for Query 2' }).getByRole('menuitem')).toHaveText([
        'Rename…',
        'Duplicate',
        'Close',
        'Close other tabs',
      ]);
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: 'Close Query 2' }).click();
      const asking = page.getByRole('alertdialog', { name: 'Close Query 2?' });
      await expect(asking.getByRole('button', { name: 'Keep it open' })).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(tabs(page)).toHaveCount(2);
      await page.getByRole('button', { name: 'Close Query 2' }).click();
      await asking.getByRole('button', { name: 'Close tab' }).click();
      await expect(tabs(page)).toHaveCount(1);
      expect(posts).toHaveLength(2);
    } finally {
      await context.close();
    }
  });

  test('runs only the statement at the cursor, or only the selection, from ⌘/Ctrl+Enter and Run (T803, AC-387)', async ({
    browser,
  }) => {
    const { context, page } = await signedIn(browser, 'writer');
    const sentSql: string[] = [];
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.url().endsWith('/sql'))
        sentSql.push((JSON.parse(request.postData() ?? '{}') as { sql: string }).sql);
    });
    try {
      await page.goto('/sql');
      await choose(page, SOURCES.on);
      // Typed, the cursor ends in the second statement.
      await typeSql(page, "SELECT 1 AS first;\nSELECT ';' AS second");
      await expect(page.locator('.cm-sql-statement')).toHaveText("SELECT ';' AS second");

      await page.keyboard.press('ControlOrMeta+Enter');
      // Run, and not refused as two statements: only the second reached the database.
      await expect(
        page.getByRole('table', { name: 'Result: 1 row, 1 column' }).getByRole('columnheader'),
      ).toHaveText(['#', 'secondtext']);
      expect(sentSql).toEqual(["SELECT ';' AS second"]);

      // The first line selected: Run says so, and runs only it.
      await editor(page).locator('.cm-line').first().click();
      await page.keyboard.press('Home');
      await page.keyboard.press('Shift+End');
      const run = page.getByRole('button', { name: 'Run selection' });
      await run.click();
      await expect(
        page.getByRole('table', { name: 'Result: 1 row, 1 column' }).getByRole('columnheader'),
      ).toHaveText(['#', 'firstint4']);
      expect(sentSql).toEqual(["SELECT ';' AS second", 'SELECT 1 AS first;']);
    } finally {
      await context.close();
    }
  });

  test('a reload of a tab’s address brings back its source and its text, kept in no request or database (AC-446, AC-451)', async ({
    browser,
  }) => {
    const { context, page } = await signedIn(browser, 'writer');
    const marker = `kept_text_${RUN}`;
    const sent: string[] = [];
    page.on('request', (request) => {
      sent.push(`${request.url()} ${request.postData() ?? ''}`);
    });
    try {
      await page.goto('/sql');
      await choose(page, SOURCES.on);
      await typeSql(page, `SELECT '${marker}' AS kept`);
      await expect(page).toHaveURL(/\/sql\?tab=[0-9a-f]{8}$/);
      const address = page.url();
      await page.getByRole('button', { name: `New tab on ${SOURCES.on}` }).click();

      await page.goto(address);
      await expect(tabs(page).first()).toHaveAttribute('aria-selected', 'true');
      await expect(editor(page)).toHaveText(`SELECT '${marker}' AS kept`);
      await expect(pickerButton(page)).toContainText(SOURCES.on);
      expect(sent.filter((line) => line.includes(marker))).toEqual([]);
    } finally {
      await context.close();
    }
    const dump = execFileSync(
      'docker',
      ['exec', 'wechart-meta', 'pg_dump', '-U', 'wechart', '--format=plain', 'wechart_security'],
      { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 },
    );
    expect(dump.includes(marker)).toBe(false);
  });
});

/**
 * T805 (AC-386): the open tab's source's schemas, tables and columns, with
 * their types, in the left pane, a name chosen going into the editor.
 */
test.describe('the schema browser in the left pane (T805, AC-386)', () => {
  /** The development database's own `public` tables and their columns, in order. */
  const catalog = () => {
    const lines = execFileSync(
      'docker',
      [
        'exec',
        'wechart-sample-db',
        'psql',
        '-U',
        'sample',
        '-d',
        'sample',
        '-Atc',
        // Its type as introspection's rawType names it: PostgreSQL's data_type (research cube/introspection-api.md).
        "SELECT c.table_name, c.column_name || ', ' || c.data_type FROM information_schema.columns c JOIN information_schema.tables t USING (table_schema, table_name) WHERE c.table_schema = 'public' AND t.table_type = 'BASE TABLE' ORDER BY c.table_name, c.ordinal_position",
      ],
      { encoding: 'utf8' },
    )
      .trim()
      .split('\n');
    const tables = new Map<string, string[]>();
    for (const line of lines) {
      const [table, column] = line.split('|') as [string, string];
      tables.set(table, [...(tables.get(table) ?? []), column]);
    }
    return tables;
  };

  test('lists every table and column of the development database’s public schema, and puts a chosen name in the editor', async ({
    browser,
  }) => {
    const { context, page } = await signedIn(browser, 'writer');
    try {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto('/sql');
      await pickerButton(page).click();
      await groupOf(page).getByRole('option', { name: new RegExp(SOURCES.on) }).click();
      const tree = leftPane(page).getByRole('tree', { name: `Schemas in ${SOURCES.on}` });
      const schema = tree.getByRole('treeitem', { name: 'public', exact: true });
      await schema.getByTestId('sql-schema-caret').first().click();
      const tables = schema.getByRole('group', { name: 'Tables in public' });

      // Every table of the development database's own, with every column. Not
      // sql-runner.spec.ts's `sqlrun_<run>` tables: that spec makes them in
      // `public` and drops them while this one may run, in another worker, so
      // one can come or go between this read and the tree's (lane SQL,
      // 2026-10-18). Any other table is checked.
      const expected = new Map([...catalog()].filter(([table]) => !table.startsWith('sqlrun_')));
      expect([...expected.keys()]).toEqual(expect.arrayContaining(['customers', 'orders', 'products']));
      for (const [table, columns] of expected) {
        const item = tables.getByRole('treeitem', { name: table, exact: true });
        await item.getByTestId('sql-schema-caret').first().click();
        const listed = item.getByRole('group', { name: `Columns of public.${table}` }).getByRole('treeitem');
        await expect(listed).toHaveCount(columns.length);
        // Each column by its name, with its type as the database names it (its keys follow, T806).
        const shown = await listed.evaluateAll((rows) =>
          rows.map(
            (row) =>
              `${row.querySelector('.sql-schema__name')?.textContent ?? ''}, ${row.querySelector('.sql-schema__type')?.textContent ?? ''}`,
          ),
        );
        expect(shown).toEqual(columns);
      }

      // A table chosen goes into the editor, with its schema.
      await tables.getByRole('treeitem', { name: 'orders', exact: true }).locator('.sql-schema__name').first().click();
      await expect(page.locator('.sql-editor .cm-content')).toHaveText('public.orders');
    } finally {
      await context.close();
    }
  });

  // T806 (AC-448): Find a table over the names read, and PK and FK tags.
  test('Find a table keeps the read tables whose names hold the text; orders.id shows PK, orders.customer_id FK to customers (T806, AC-448)', async ({
    browser,
  }) => {
    const { context, page } = await signedIn(browser, 'writer');
    try {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto('/sql');
      await pickerButton(page).click();
      await groupOf(page).getByRole('option', { name: new RegExp(SOURCES.on) }).click();
      const schema = leftPane(page).getByRole('treeitem', { name: 'public', exact: true });
      await schema.getByTestId('sql-schema-caret').first().click();
      const group = schema.getByRole('group', { name: 'Tables in public' });
      const tables = group.locator('[role="treeitem"][aria-level="2"] > .sql-schema__row .sql-schema__name');
      // The sample database is shared: other specs add tables of their own to
      // `public` as they run, so the tables read are taken as listed, not fixed.
      await expect(tables.filter({ hasText: /^orders$/ })).toHaveCount(1);
      const read = await tables.allTextContents();
      expect(read).toEqual(expect.arrayContaining(['customers', 'orders', 'products']));

      // Exactly the read tables whose names hold "ord", in their order.
      await leftPane(page).getByRole('searchbox', { name: 'Find a table' }).fill('ord');
      await expect(tables).toHaveText(read.filter((name) => name.toLowerCase().includes('ord')));
      await leftPane(page).getByRole('searchbox', { name: 'Find a table' }).fill('');
      await expect(tables).toHaveText(read);

      const orders = schema.getByRole('treeitem', { name: 'orders', exact: true });
      await orders.getByTestId('sql-schema-caret').first().click();
      const columns = orders.getByRole('group', { name: 'Columns of public.orders' });
      const id = columns.getByRole('treeitem', { name: 'id, integer, primary key' });
      await expect(id.locator('.sql-schema__tag')).toHaveText('PK');
      await expect(columns.getByRole('treeitem', { name: 'status, text' }).locator('.sql-schema__tag')).toHaveCount(0);
      // orders.customer_id references customers.id: FK, its target in the
      // tooltip, as xcube bb188d8ada's catalog reports it through a stored
      // connection (research xcube-bb188d8ada.md).
      const customer = columns.getByRole('treeitem', {
        name: 'customer_id, integer, foreign key to public.customers',
      });
      const fk = customer.locator('.sql-schema__tag');
      await expect(fk).toHaveText('FK');
      await expect(fk).toHaveAttribute('title', 'References public.customers (id)');

      // Every primary- and foreign-key column of the development database's
      // own tables carries its tag, as PostgreSQL holds the keys.
      const keys = execFileSync(
        'docker',
        [
          'exec',
          'wechart-sample-db',
          'psql',
          '-U',
          'sample',
          '-d',
          'sample',
          '-Atc',
          "SELECT c.conrelid::regclass::text, a.attname, c.contype, coalesce(c.confrelid::regclass::text, ''), coalesce(fa.attname, '') FROM pg_constraint c CROSS JOIN LATERAL unnest(c.conkey, coalesce(c.confkey, c.conkey)) AS k(own, other) JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.own LEFT JOIN pg_attribute fa ON c.contype = 'f' AND fa.attrelid = c.confrelid AND fa.attnum = k.other WHERE c.connamespace = 'public'::regnamespace AND c.contype IN ('p', 'f') ORDER BY 1, 2",
        ],
        { encoding: 'utf8' },
      )
        .trim()
        .split('\n')
        .map((line) => line.split('|') as [string, string, string, string, string])
        // Not sql-runner.spec.ts's tables, which come and go while this runs.
        .filter(([table]) => !table.startsWith('sqlrun_'));
      expect(keys.filter(([, , kind]) => kind === 'f').length).toBeGreaterThan(0);
      for (const [table, column, kind, target, targetColumn] of keys) {
        const item = schema.getByRole('treeitem', { name: table, exact: true });
        const listed = item.getByRole('group', { name: `Columns of public.${table}` });
        if ((await listed.count()) === 0) await item.getByTestId('sql-schema-caret').first().click();
        const row = listed.getByRole('treeitem', {
          name: new RegExp(
            `^${column}, [^,]+, ${kind === 'p' ? 'primary key' : `(primary key, )?foreign key to public\\.${target}`}`,
          ),
        });
        const tag = row.locator('.sql-schema__tag', { hasText: kind === 'p' ? 'PK' : 'FK' });
        await expect(tag, `${table}.${column}`).toHaveCount(1);
        if (kind === 'f')
          await expect(tag).toHaveAttribute('title', `References public.${target} (${targetColumn})`);
      }
    } finally {
      await context.close();
    }
  });
});

/**
 * T808 (AC-456): while the user types, the tab's source's schemas, tables
 * and columns read so far that match are listed; ↑ and ↓ choose, Enter
 * accepts, Esc closes the list only, and Tab still leaves the editor.
 */
test.describe('autocomplete in the editor (T808, AC-456)', () => {
  test('offers the read tables and columns as they are typed; Enter accepts, Esc closes the list only, Tab leaves', async ({
    browser,
  }) => {
    const { context, page } = await signedIn(browser, 'writer');
    try {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto('/sql');
      await pickerButton(page).click();
      await groupOf(page).getByRole('option', { name: new RegExp(SOURCES.on) }).click();
      // The schema browser reads public's tables, and customers' columns.
      const schema = leftPane(page).getByRole('treeitem', { name: 'public', exact: true });
      await schema.getByTestId('sql-schema-caret').first().click();
      const customers = schema.getByRole('treeitem', { name: 'customers', exact: true });
      await customers.getByTestId('sql-schema-caret').first().click();
      await expect(
        customers.getByRole('group', { name: 'Columns of public.customers' }).getByRole('treeitem'),
      ).toHaveCount(4);

      const editor = page.locator('.sql-editor .cm-content');
      const list = page.locator('.cm-tooltip-autocomplete li');
      await editor.click();
      await page.keyboard.type('SELECT cust', { delay: 30 });
      await expect(list.filter({ hasText: /^customers$/ })).toHaveCount(1);
      await page.keyboard.press('Enter');
      await expect(editor).toHaveText('SELECT customers');
      await expect(list).toHaveCount(0);

      // Its columns, as introspection read them, by their first letters.
      await page.keyboard.type('.', { delay: 30 });
      await expect(list).toHaveText(['country', 'id', 'name', 'signed_up_at']);
      await page.keyboard.type('co', { delay: 30 });
      await expect(list).toHaveText(['country']);
      await page.keyboard.press('Enter');
      // One line: Enter took the name and added no new one.
      await expect(page.locator('.sql-editor .cm-line')).toHaveCount(1);
      await expect(editor).toHaveText('SELECT customers.country');

      // ↓ and ↑ choose.
      await page.keyboard.type(', customers.', { delay: 30 });
      await expect(list).toHaveCount(4);
      await expect(list.and(page.locator('[aria-selected="true"]'))).toHaveText('country');
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('ArrowUp');
      await expect(list.and(page.locator('[aria-selected="true"]'))).toHaveText('id');
      await page.keyboard.press('Enter');
      await expect(editor).toHaveText('SELECT customers.country, customers.id');

      // Esc closes the list, and nothing else: the text, the page and the focus stay.
      await page.keyboard.type(' FROM cus', { delay: 30 });
      await expect(list).toHaveCount(1);
      await page.keyboard.press('Escape');
      await expect(list).toHaveCount(0);
      await expect(editor).toHaveText('SELECT customers.country, customers.id FROM cus');
      await expect(editor).toBeFocused();
      await expect(page).toHaveURL(/\/sql/);

      // Tab leaves the editor, the list open or not.
      await page.keyboard.type('t', { delay: 30 });
      await expect(list).toHaveCount(1);
      await page.keyboard.press('Tab');
      await expect(editor).not.toBeFocused();
      await expect(editor).toHaveText('SELECT customers.country, customers.id FROM cust');
    } finally {
      await context.close();
    }
  });
});

/**
 * T812 (AC-457, AC-483): Save… keeps a query's SQL, data source and each
 * parameter's name, type and last value; on a saved query Save updates it
 * and Save as new… makes another, refused with its reason under a name its
 * owner already has. No proposal and no audit event.
 */
test.describe('saving a query (T812, AC-457, AC-483)', () => {
  const psql = (query: string) =>
    execFileSync('docker', ['exec', 'wechart-meta', 'psql', '-U', 'wechart', '-d', 'wechart_security', '-Atc', query], {
      encoding: 'utf8',
    }).trim();

  test('Save… keeps the SQL, the source and the parameters; Save updates it; Save as new… under a taken name is refused', async ({
    browser,
  }) => {
    const { context, page } = await signedIn(browser, 'writer');
    const name = `Big orders ${RUN}`;
    try {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto('/sql');
      await pickerButton(page).click();
      await groupOf(page).getByRole('option', { name: new RegExp(SOURCES.on) }).click();
      const editor = page.locator('.sql-editor .cm-content');
      await editor.click();
      await page.keyboard.insertText('SELECT * FROM orders WHERE amount > {{n}}');
      const strip = workspace(page).getByRole('group', { name: 'Parameters' });
      await strip.getByRole('combobox', { name: 'n, type' }).selectOption('Number');
      await strip.getByRole('spinbutton', { name: 'n, value' }).fill('7');

      await workspace(page).getByRole('button', { name: 'Save…' }).click();
      const dialog = page.getByRole('dialog', { name: 'Save query' });
      await expect(dialog).toContainText('Keeps the SQL, ' + SOURCES.on + ', and n with their types and values.');
      await dialog.getByRole('textbox', { name: 'Name' }).fill(name);
      await dialog.getByRole('textbox', { name: 'Description · optional' }).fill('Month end');
      await dialog.getByRole('button', { name: 'Save' }).click();
      await expect(dialog).toHaveCount(0);
      await expect(page.getByTestId('sql-saved-as')).toHaveText('Saved query · Only me');

      // Reopened, it holds them all.
      const id = psql(`SELECT id FROM saved_queries WHERE name = '${name}'`);
      expect(id).toMatch(/^[0-9a-f-]{36}$/);
      const reopened = await page.request.get(`/api/sql/saved/${id}`);
      expect(await reopened.json()).toMatchObject({
        name,
        description: 'Month end',
        sourceId: world.sources.on,
        sql: 'SELECT * FROM orders WHERE amount > {{n}}',
        parameters: [{ name: 'n', type: 'number', value: '7' }],
      });

      // Save updates it, and makes no second.
      await editor.press('End');
      await page.keyboard.insertText(' LIMIT 5');
      await workspace(page).getByRole('button', { name: 'Save', exact: true }).click();
      await expect
        .poll(async () => ((await (await page.request.get(`/api/sql/saved/${id}`)).json()) as { sql: string }).sql)
        .toBe('SELECT * FROM orders WHERE amount > {{n}} LIMIT 5');
      expect(psql(`SELECT count(*) FROM saved_queries WHERE name LIKE 'Big orders ${RUN}%'`)).toBe('1');

      // Save as new… under the name it has: refused, saying why, and nothing made.
      await workspace(page).getByRole('button', { name: 'Save as new…' }).click();
      await expect(dialog.getByRole('textbox', { name: 'Name' })).toHaveValue(`${name} (copy)`);
      await dialog.getByRole('textbox', { name: 'Name' }).fill(name);
      await dialog.getByRole('button', { name: 'Save' }).click();
      await expect(dialog.getByRole('alert')).toHaveText(`You already have a saved query named “${name}”.`);
      await dialog.getByRole('textbox', { name: 'Name' }).fill(`${name} (copy)`);
      await dialog.getByRole('button', { name: 'Save' }).click();
      await expect(dialog).toHaveCount(0);
      expect(psql(`SELECT count(*) FROM saved_queries WHERE name LIKE 'Big orders ${RUN}%'`)).toBe('2');

      // No proposal and no audit event.
      expect(psql(`SELECT count(*) FROM audit_records a WHERE a::text LIKE '%Big orders ${RUN}%'`)).toBe('0');
      expect(psql(`SELECT count(*) FROM proposals p WHERE p::text LIKE '%Big orders ${RUN}%'`)).toBe('0');
    } finally {
      psql(`DELETE FROM saved_queries WHERE name LIKE 'Big orders ${RUN}%'`);
      await context.close();
    }
  });
});

/**
 * T817 (AC-381, as amended 2026-10-17; AC-452): History in the right pane
 * lists all the user's runs by default, newest first, each with its SQL, its
 * data source and folder, time, outcome and row count; "This data source"
 * narrows to the open tab's; a row on a source the user can no longer run
 * SQL on reads "A data source no longer available to you", naming neither;
 * and one run's state reads the same, icon and label, on its tab, in its
 * result head and in its History row.
 */
test.describe('History in the right pane (T817, AC-381, AC-452)', () => {
  const tabs = (page: Page) => page.getByRole('tablist', { name: 'SQL tabs' }).getByRole('tab');
  const editor = (page: Page) => page.locator('.sql-editor .cm-content');
  async function runOn(page: Page, source: string, sql: string) {
    await pickerButton(page).click();
    await groupOf(page).getByRole('option', { name: new RegExp(source) }).click();
    await editor(page).click();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.press('Delete');
    await page.keyboard.type(sql);
    await page.getByRole('button', { name: 'Run', exact: true }).click();
    await expect(page.getByTestId('sql-result-head')).toHaveText(/^Finished 1 row/);
  }
  const historyRows = (page: Page) =>
    rightPane(page)
      .getByRole('list', { name: 'History' })
      .getByRole('listitem')
      .filter({ hasText: `hist_${RUN}` });

  test('lists all the user’s runs, narrows to the open tab’s source, reads a lost source as no longer available, and says a run’s state as its tab and result head do', async ({
    browser,
  }) => {
    const { context, page } = await signedIn(browser, 'writer');
    try {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto('/sql');
      await runOn(page, SOURCES.on, `SELECT 'hist_${RUN}_one' AS m`);
      await page.getByRole('button', { name: `New tab on ${SOURCES.on}` }).click();
      await runOn(page, SOURCES.two, `SELECT 'hist_${RUN}_two' AS m`);

      await rightPane(page).getByRole('button', { name: 'History' }).click();
      await expect(rightPane(page).getByRole('radio', { name: 'All' })).toBeChecked();
      await expect(rightPane(page)).toContainText('Only you can see these · newest first');
      // All, newest first: both sources.
      await expect(historyRows(page)).toHaveCount(2);
      const [newest, older] = [historyRows(page).nth(0), historyRows(page).nth(1)];
      await expect(newest).toContainText(`SELECT 'hist_${RUN}_two' AS m`);
      await expect(newest).toContainText(`${SOURCES.two} · Shared / SQL workspace ${RUN}`);
      await expect(newest).toContainText('1 row');
      await expect(newest.locator('time')).toHaveText(/^Today \d\d:\d\d$/);
      await expect(older).toContainText(`${SOURCES.on} · Shared / SQL workspace ${RUN}`);

      // One run's state, the same in all three places (AC-452).
      await expect(tabs(page).nth(1)).toHaveAttribute('aria-label', `Query 2, Finished, 1 row, on ${SOURCES.two}`);
      await expect(tabs(page).nth(1).locator('svg[data-icon]')).toHaveAttribute('data-icon', 'ok');
      await expect(page.getByTestId('sql-result-head').locator('svg[data-icon]').first()).toHaveAttribute('data-icon', 'ok');
      await expect(newest.locator('.status')).toHaveText('Finished');
      await expect(newest.locator('.status svg[data-icon]')).toHaveAttribute('data-icon', 'ok');

      // This data source: the open tab's (the second, on two).
      await rightPane(page).getByRole('radio', { name: 'This data source' }).check();
      await expect(historyRows(page)).toHaveCount(1);
      await expect(historyRows(page).first()).toContainText(`hist_${RUN}_two`);
      await rightPane(page).getByRole('radio', { name: 'All' }).check();
      await expect(historyRows(page)).toHaveCount(2);

      // Two's runner off: its row names neither it nor its folder.
      const admin = await signedIn(browser, 'super');
      try {
        const off = await admin.page.request.put(`/api/data-sources/${world.sources.two}/sql-runner`, {
          data: { on: false },
        });
        expect(off.status(), await off.text()).toBe(200);
        await page.reload();
        await rightPane(page).getByRole('button', { name: 'History' }).click();
        const lost = historyRows(page).filter({ hasText: `hist_${RUN}_two` });
        await expect(lost).toContainText('A data source no longer available to you');
        await expect(lost).not.toContainText(SOURCES.two);
        await expect(lost).not.toContainText(`SQL workspace ${RUN}`);
        await expect(historyRows(page).filter({ hasText: `hist_${RUN}_one` })).toContainText(SOURCES.on);
      } finally {
        const on = await admin.page.request.put(`/api/data-sources/${world.sources.two}/sql-runner`, {
          data: { on: true, readOnlyConfirmed: true },
        });
        expect(on.status(), await on.text()).toBe(200);
        await admin.context.close();
      }
    } finally {
      await context.close();
    }
  });

  test('puts a chosen row back: into the open tab with its values and Undo, into a new tab on another source, on none for a lost one; never runs (T818, AC-465, AC-381)', async ({
    browser,
  }) => {
    const { context, page } = await signedIn(browser, 'writer');
    const posts: string[] = [];
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.url().endsWith('/sql')) posts.push(request.url());
    });
    const pick = (text: string) =>
      rightPane(page).getByRole('list', { name: 'History' }).getByRole('button', { name: new RegExp(text) }).first();
    try {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto('/sql');
      await pickerButton(page).click();
      await groupOf(page).getByRole('option', { name: new RegExp(SOURCES.on) }).click();
      await editor(page).click();
      await page.keyboard.type(`SELECT 'back_${RUN}' AS m WHERE 1 = {{n}}`);
      const strip = workspace(page).getByRole('group', { name: 'Parameters' });
      await strip.getByRole('combobox', { name: 'n, type' }).selectOption('Number');
      await strip.getByRole('spinbutton', { name: 'n, value' }).fill('1');
      await page.getByRole('button', { name: 'Run', exact: true }).click();
      await expect(page.getByTestId('sql-result-head')).toHaveText(/^Finished 1 row/);
      await page.getByRole('button', { name: `New tab on ${SOURCES.on}` }).click();
      await pickerButton(page).click();
      await groupOf(page).getByRole('option', { name: new RegExp(SOURCES.two) }).click();
      await editor(page).click();
      await page.keyboard.type(`SELECT 'there_${RUN}' AS m`);
      await page.getByRole('button', { name: 'Run', exact: true }).click();
      await expect(page.getByTestId('sql-result-head')).toHaveText(/^Finished 1 row/);
      await tabs(page).first().click();
      await editor(page).click();
      await page.keyboard.press('ControlOrMeta+A');
      await page.keyboard.press('Delete');
      await page.keyboard.type('SELECT 0');
      const ran = posts.length;

      // The open tab's source: into it, with its value, and Undo brings the old text back.
      await rightPane(page).getByRole('button', { name: 'History' }).click();
      await pick(`back_${RUN}`).click();
      await expect(editor(page)).toHaveText(`SELECT 'back_${RUN}' AS m WHERE 1 = {{n}}`);
      await expect(strip.getByRole('spinbutton', { name: 'n, value' })).toHaveValue('1');
      await expect(tabs(page)).toHaveCount(2);
      const toast = page.getByTestId('undo-toast');
      await toast.getByRole('button', { name: 'Undo' }).click();
      await expect(editor(page)).toHaveText('SELECT 0');

      // Another source's: a new tab on it, the open tab's text left as it is.
      await pick(`there_${RUN}`).click();
      await expect(tabs(page)).toHaveCount(3);
      await expect(tabs(page).nth(2)).toHaveAttribute('aria-label', new RegExp(`^From History · \\d\\d:\\d\\d, Not run yet, on ${SOURCES.two}$`));
      await expect(tabs(page).nth(2)).toHaveAttribute('aria-selected', 'true');
      await expect(editor(page)).toHaveText(`SELECT 'there_${RUN}' AS m`);
      await tabs(page).first().click();
      await expect(editor(page)).toHaveText('SELECT 0');

      // A source no longer available: a new tab on none, naming it nowhere.
      const admin = await signedIn(browser, 'super');
      try {
        const off = await admin.page.request.put(`/api/data-sources/${world.sources.two}/sql-runner`, {
          data: { on: false },
        });
        expect(off.status(), await off.text()).toBe(200);
        await page.reload();
        await rightPane(page).getByRole('button', { name: 'History' }).click();
        await pick(`there_${RUN}`).click();
        const opened = tabs(page).last();
        await expect(opened).toHaveAttribute('aria-selected', 'true');
        await expect(opened).toHaveAttribute('aria-label', /^From History · \d\d:\d\d, Not run yet$/);
        await expect(pickerButton(page)).toHaveAccessibleName(/^Data source Choose…/);
        await expect(page.getByRole('button', { name: 'Run', exact: true })).toHaveCount(0);
      } finally {
        const on = await admin.page.request.put(`/api/data-sources/${world.sources.two}/sql-runner`, {
          data: { on: true, readOnlyConfirmed: true },
        });
        expect(on.status(), await on.text()).toBe(200);
        await admin.context.close();
      }
      // Nothing chosen ran.
      expect(posts.length).toBe(ran);
    } finally {
      await context.close();
    }
  });

  test('says a run going the same way, icon and label, on its tab, in its result head and in its History row (AC-452)', async ({
    browser,
  }) => {
    const { context, page } = await signedIn(browser, 'writer');
    try {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto('/sql');
      await pickerButton(page).click();
      await groupOf(page).getByRole('option', { name: new RegExp(SOURCES.on) }).click();
      await editor(page).click();
      await page.keyboard.type(`SELECT pg_sleep(6), 'slow_${RUN}' AS m`);
      await page.getByRole('button', { name: 'Run', exact: true }).click();
      await rightPane(page).getByRole('button', { name: 'History' }).click();

      const row = rightPane(page).getByRole('list', { name: 'History' }).getByRole('listitem').first();
      await expect(row).toContainText(`slow_${RUN}`);
      await expect(row).toContainText(`${SOURCES.on} · Shared / SQL workspace ${RUN}`);
      // Read together, so the one clock reads the same second in all three.
      const said = await page.evaluate(() => {
        const tab = document.querySelector('[role="tablist"][aria-label="SQL tabs"] [role="tab"][aria-selected="true"]');
        const head = document.querySelector('[data-testid="sql-result-head"]');
        const going = document.querySelector('[aria-label="History"] li .status');
        return {
          tab: tab?.getAttribute('aria-label') ?? '',
          tabIcon: tab?.querySelector('svg[data-icon]')?.getAttribute('data-icon') ?? '',
          head: head?.textContent ?? '',
          headIcon: head?.querySelector('svg[data-icon]')?.getAttribute('data-icon') ?? '',
          row: going?.textContent ?? '',
          rowIcon: going?.querySelector('svg[data-icon]')?.getAttribute('data-icon') ?? '',
        };
      });
      expect(said.row).toMatch(/^Running · \d+ s of 30$/);
      expect(said.tab).toBe(`Query 1, ${said.row}, on ${SOURCES.on}`);
      expect(said.head.startsWith(said.row)).toBe(true);
      expect([said.tabIcon, said.headIcon, said.rowIcon]).toEqual(['run', 'run', 'run']);

      // Ended: Finished in all three, its row now History's own.
      await expect(page.getByTestId('sql-result-head')).toHaveText(/^Finished 1 row/, { timeout: 15_000 });
      await expect(tabs(page).first()).toHaveAttribute('aria-label', `Query 1, Finished, 1 row, on ${SOURCES.on}`);
      await expect(row.locator('.status')).toHaveText('Finished');
      await expect(row).toContainText(`slow_${RUN}`);
    } finally {
      await context.close();
    }
  });
});

/**
 * T816 (AC-455): ⌘/Ctrl+S anywhere in the workspace saves the open tab's
 * query (Save… on a new one, Save on a saved one) instead of the browser's
 * saving the page; ⌘/Ctrl+F in the editor opens the editor's own find; and
 * neither key does anything new outside the workspace.
 */
test.describe('Save and Find keys (T816, AC-455)', () => {
  /** Whether the page kept the browser from acting on the last key: heard on the window, after every handler. */
  const watchPrevented = (page: Page) =>
    page.evaluate(() => {
      const kept = window as unknown as { lastPrevented?: boolean };
      window.addEventListener('keydown', (event) => {
        kept.lastPrevented = event.defaultPrevented;
      });
    });
  const lastPrevented = (page: Page) =>
    page.evaluate(() => (window as unknown as { lastPrevented?: boolean }).lastPrevented);
  /**
   * A synthetic ⌘/Ctrl+key on the focused element, so a key the page leaves
   * alone can't reach the browser's own save or find: whether it was prevented.
   */
  const syntheticPrevented = (page: Page, key: string) =>
    page.evaluate((pressed) => {
      const event = new KeyboardEvent('keydown', {
        key: pressed,
        ctrlKey: true,
        metaKey: true,
        bubbles: true,
        cancelable: true,
      });
      (document.activeElement ?? document.body).dispatchEvent(event);
      return event.defaultPrevented;
    }, key);

  test('⌘/Ctrl+S saves the open tab’s query from anywhere in the workspace; ⌘/Ctrl+F opens the editor’s find; neither does anything new elsewhere', async ({
    browser,
  }) => {
    const { context, page } = await signedIn(browser, 'writer');
    const name = `Keyed save ${RUN}`;
    try {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto('/sql');
      await watchPrevented(page);
      await pickerButton(page).click();
      await groupOf(page).getByRole('option', { name: new RegExp(SOURCES.on) }).click();
      const editor = page.locator('.sql-editor .cm-content');
      await editor.click();
      await page.keyboard.insertText('SELECT 1 AS one');

      // A new query: Save… opens, the browser's save kept off.
      await page.keyboard.press('ControlOrMeta+s');
      const dialog = page.getByRole('dialog', { name: 'Save query' });
      await expect(dialog).toBeVisible();
      expect(await lastPrevented(page)).toBe(true);
      await dialog.getByRole('textbox', { name: 'Name' }).fill(name);
      await dialog.getByRole('button', { name: 'Save' }).click();
      await expect(page.getByTestId('sql-saved-as')).toHaveText('Saved query · Only me');

      // A saved one: Save, from the right pane, far from the editor.
      await editor.click();
      await editor.press('End');
      await page.keyboard.insertText(' LIMIT 3');
      await rightPane(page).getByRole('button', { name, exact: true }).focus();
      await page.keyboard.press('ControlOrMeta+s');
      expect(await lastPrevented(page)).toBe(true);
      await expect
        .poll(async () => {
          const listed = (await (await page.request.get('/api/sql/saved')).json()) as {
            queries: { name: string; sql: string }[];
          };
          return listed.queries.find((each) => each.name === name)?.sql;
        })
        .toBe('SELECT 1 AS one LIMIT 3');
      await expect(dialog).toHaveCount(0);

      // ⌘/Ctrl+F in the editor: its own find, focus in its field; Esc closes it.
      await editor.click();
      await page.keyboard.press('ControlOrMeta+f');
      const find = page.locator('.sql-editor .cm-search');
      await expect(find).toBeVisible();
      await expect(find.locator('input[name="search"]')).toBeFocused();
      expect(await lastPrevented(page)).toBe(true);
      await page.keyboard.press('Escape');
      await expect(find).toHaveCount(0);

      // Outside the workspace neither key is taken: Explore, and a data source's own SQL tab.
      await page.goto('/explore');
      await expect(page.getByRole('button', { name: /theme/i })).toBeVisible();
      expect(await syntheticPrevented(page, 's')).toBe(false);
      expect(await syntheticPrevented(page, 'f')).toBe(false);
      await page.goto(`/explore/data-sources/${world.sources.on}`);
      await page.getByRole('tablist', { name: 'Data source' }).getByRole('tab', { name: 'SQL' }).click();
      await page.getByRole('tabpanel', { name: 'SQL' }).locator('.sql-editor .cm-content').click();
      expect(await syntheticPrevented(page, 'f')).toBe(false);
      expect(await syntheticPrevented(page, 's')).toBe(false);
      await expect(page.locator('.cm-search')).toHaveCount(0);
    } finally {
      const listed = (await (await page.request.get('/api/sql/saved')).json()) as {
        queries: { id: string; name: string }[];
      };
      for (const each of listed.queries.filter((query) => query.name === name))
        await page.request.delete(`/api/sql/saved/${each.id}`);
      await context.close();
    }
  });
});

/**
 * T809 (AC-453): each `{{ name }}` outside strings and comments, once, in
 * the strip under the editor, typed Text (the default), Number, Date or
 * Boolean, and Run held, naming those with no value, until each has one.
 */
test.describe('parameters under the editor (T809, AC-453)', () => {
  test('lists each parameter once with its type, and holds Run, ⌘/Ctrl+Enter too, until each has a value', async ({
    browser,
  }) => {
    const { context, page } = await signedIn(browser, 'writer');
    const runs: string[] = [];
    page.on('request', (request) => {
      if (request.method() === 'POST' && new URL(request.url()).pathname.endsWith('/sql')) runs.push(request.url());
    });
    try {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto('/sql');
      await pickerButton(page).click();
      await groupOf(page).getByRole('option', { name: new RegExp(SOURCES.on) }).click();
      const editor = page.locator('.sql-editor .cm-content');
      await editor.click();
      await page.keyboard.insertText(
        "-- by {{commented}}\nSELECT '{{quoted}}' AS label FROM orders WHERE status = {{ status }} AND amount > {{Min}} OR status = {{status}}",
      );

      const strip = workspace(page).getByRole('group', { name: 'Parameters' });
      await expect(strip.locator('.sql-params__name')).toHaveText(['status', 'Min']);
      const type = strip.getByRole('combobox', { name: 'status, type' });
      await expect(type).toHaveValue('text');
      await expect(type.locator('option')).toHaveText(['Text', 'Number', 'Date', 'Boolean']);

      const run = workspace(page).getByRole('button', { name: 'Run', exact: true });
      await expect(run).toBeDisabled();
      await expect(page.getByTestId('sql-params-held')).toHaveText('Give status and Min values to run');
      await editor.press('ControlOrMeta+Enter');

      await strip.getByRole('textbox', { name: 'status, value' }).fill('shipped');
      await expect(page.getByTestId('sql-params-held')).toHaveText('Give Min a value to run');
      await expect(run).toBeDisabled();
      await editor.press('ControlOrMeta+Enter');

      await strip.getByRole('combobox', { name: 'Min, type' }).selectOption('Number');
      await strip.getByRole('spinbutton', { name: 'Min, value' }).fill('10');
      await expect(page.getByTestId('sql-params-held')).toHaveCount(0);
      await expect(run).toBeEnabled();
      // Nothing was sent while a value was missing.
      expect(runs).toEqual([]);
    } finally {
      await context.close();
    }
  });
});

/**
 * T807 (AC-449): a table's ⋯ — Insert name, Insert SELECT (written, not
 * run) and Preview 100 rows (a new tab, an ordinary run: capped, audited and
 * in History); opening a schema or a table sends only catalog reads.
 */
test.describe('a table’s ⋯ in the schema browser (T807, AC-449)', () => {
  test('Insert SELECT writes its 100-row SELECT and runs nothing; Preview 100 rows runs it in a new tab, audited and in History', async ({
    browser,
  }) => {
    const { context, page } = await signedIn(browser, 'writer');
    const asked: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/api/')) asked.push(`${request.method()} ${new URL(request.url()).pathname}`);
    });
    const select = 'SELECT id, customer_id, product_id, status, amount, ordered_at\nFROM public.orders\nLIMIT 100';
    // A second's margin for the clocks of this machine and wechart's server.
    const began = new Date(Date.now() - 1_000).toISOString();
    try {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto('/sql');
      await pickerButton(page).click();
      await groupOf(page).getByRole('option', { name: new RegExp(SOURCES.on) }).click();
      await expect(page.getByTestId('sql-warning')).toBeVisible();

      // Opening a schema and a table: catalog reads alone.
      const from = asked.length;
      const schema = leftPane(page).getByRole('treeitem', { name: 'public', exact: true });
      await schema.getByTestId('sql-schema-caret').first().click();
      const orders = schema.getByRole('treeitem', { name: 'orders', exact: true });
      await orders.getByTestId('sql-schema-caret').first().click();
      await expect(orders.getByRole('group', { name: 'Columns of public.orders' }).getByRole('treeitem')).toHaveCount(6);
      const opening = asked.slice(from).filter((line) => !line.endsWith('/api/sql-runs/going'));
      expect(opening.length).toBeGreaterThan(0);
      for (const line of opening) expect(line).toMatch(/\/catalog\/(schemas|tables|columns)$/);

      // Insert SELECT: written at the cursor, in PostgreSQL's LIMIT, and not run.
      const actions = orders.getByRole('button', { name: 'Actions for public.orders' });
      await actions.click();
      await expect(page.getByRole('menu', { name: 'Actions for public.orders' }).getByRole('menuitem')).toHaveText([
        'Insert name',
        'Insert SELECT',
        'Preview 100 rows',
      ]);
      await page.getByRole('menuitem', { name: 'Insert SELECT' }).click();
      await expect(page.locator('.sql-editor .cm-content')).toHaveText(select.replaceAll('\n', ''));
      expect(asked.filter((line) => line.startsWith('POST') && line.endsWith('/sql'))).toEqual([]);

      // Preview 100 rows: a new tab holding it, run as an ordinary run.
      await actions.click();
      await page.getByRole('menuitem', { name: 'Preview 100 rows' }).click();
      const preview = page.getByRole('tablist', { name: 'SQL tabs' }).getByRole('tab', { name: /^orders, / });
      await expect(preview).toHaveAttribute('aria-selected', 'true');
      await expect(preview).toHaveAttribute('aria-label', new RegExp(`^orders, (Finished, \\d+ rows?|Limited to 10,000 rows), on ${SOURCES.on}$`));
      await expect(page.getByRole('table', { name: /^Result: \d+ rows?, 6 columns$/ })).toBeVisible();
      expect(asked.filter((line) => line.startsWith('POST') && line.endsWith('/sql'))).toEqual([
        `POST /api/data-sources/${world.sources.on}/sql`,
      ]);
      const rows = Number(/^Result: (\d+)/.exec((await page.getByRole('table').first().getAttribute('aria-label')) ?? '')?.[1]);
      expect(rows).toBeGreaterThan(0);
      expect(rows).toBeLessThanOrEqual(100);

      // In History: the user's own runs, newest first.
      const history = (await (await page.request.get(`/api/sql-runs?dataSource=${world.sources.on}`)).json()) as {
        runs: { sql: string; outcome: string }[];
      };
      expect(history.runs[0]).toMatchObject({ sql: select, outcome: 'finished' });
    } finally {
      await context.close();
    }

    // And audited, as every run is (AC-382).
    const admin = await signedIn(browser, 'super');
    try {
      // Only events since this test began: never an earlier run's (T807's review).
      const trail = await admin.page.request.get(
        `/api/audit?events=sql-run&folder=${world.folderId}&limit=5&since=${encodeURIComponent(began)}`,
      );
      expect(trail.status(), await trail.text()).toBe(200);
      const [event] = ((await trail.json()) as { records: Record<string, unknown>[] }).records;
      expect(event).toMatchObject({
        event: 'sql-run',
        item: { kind: 'data-source', id: world.sources.on },
        details: { outcome: 'finished' },
      });
      expect(String((event?.details as { sql?: unknown } | undefined)?.sql)).toMatch(
        /^SELECT id, customer_id, product_id, status, amount, ordered_at\s+FROM public\.orders\s+LIMIT /,
      );
    } finally {
      await admin.context.close();
    }
  });
});

/**
 * T804 (AC-452, AC-379): one run per person across every tab, its state the
 * same on its tab and in its result head; every other tab's Run held with
 * Go to it and Cancel that run; and the run kept going while the user is in
 * another workspace.
 */
test.describe('a run going, across tabs and away (T804, AC-452, AC-379)', () => {
  const tabs = (page: Page) => page.getByRole('tablist', { name: 'SQL tabs' }).getByRole('tab');
  const editor = (page: Page) => page.locator('.sql-editor .cm-content');
  async function typeSql(page: Page, sql: string) {
    await editor(page).click();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.press('Delete');
    await page.keyboard.type(sql);
  }
  /** Whether the sample database is running a statement holding `marker`. */
  const active = (marker: string) =>
    execFileSync(
      'docker',
      [
        'exec',
        'wechart-sample-db',
        'psql',
        '-U',
        'sample',
        '-d',
        'sample',
        '-Atc',
        `SELECT count(*) FROM pg_stat_activity WHERE state = 'active' AND query LIKE '%AS ${marker}%' AND pid <> pg_backend_pid()`,
      ],
      { encoding: 'utf8' },
    ).trim();
  /** The open tab's state on its tab and in its result head, read at one moment. */
  const bothStates = (page: Page) =>
    page.evaluate(() => ({
      tab: document.querySelector('[role="tab"][aria-selected="true"]')?.getAttribute('aria-label') ?? '',
      head: document.querySelector('[data-testid="sql-result-head"]')?.textContent ?? '',
    }));

  test('holds Run on every other tab, Go to it selects the running one, and Cancel that run stops it on the database', async ({
    browser,
  }) => {
    // As manager: no other spec runs SQL as them, so one run per person meets none of theirs.
    const { context, page } = await signedIn(browser, 'manager');
    const marker = `held_${RUN}`;
    const posts: string[] = [];
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.url().endsWith('/sql')) posts.push(request.url());
    });
    try {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto('/sql');
      await pickerButton(page).click();
      await groupOf(page).getByRole('option', { name: new RegExp(SOURCES.on) }).click();
      await typeSql(page, `SELECT pg_sleep(25) AS ${marker}`);
      await page.getByRole('button', { name: 'Run', exact: true }).click();

      // Its tab and its result head say one thing, counting seconds (AC-452).
      await expect(page.getByTestId('sql-result-head')).toHaveText(/^Running · \d+ s of 30$/);
      const once = await bothStates(page);
      expect(once.tab).toBe(`Query 1, ${once.head}, on ${SOURCES.on}`);
      await expect(page.getByTestId('sql-result-head')).toHaveText(/^Running · [2-9] s of 30$/);
      await expect.poll(() => active(marker), { timeout: 15_000 }).toBe('1');

      // Another tab: Run held, with whose run it is (AC-452, AC-379).
      await page.getByRole('button', { name: `New tab on ${SOURCES.on}` }).click();
      const held = page.getByTestId('sql-run-held');
      await expect(held).toHaveText(
        new RegExp(
          `^You have a run going on ${SOURCES.on}, started at \\d\\d:\\d\\d:\\d\\d\\. One run at a time\\. Go to it · Cancel that run$`,
        ),
      );
      await typeSql(page, 'SELECT 2');
      await expect(page.getByRole('button', { name: 'Run', exact: true })).toBeDisabled();
      await page.keyboard.press('ControlOrMeta+Enter');
      await expect(page.getByText('held while your other run goes')).toBeVisible();
      expect(posts).toHaveLength(1);

      // Go to it selects the running tab.
      await held.getByRole('button', { name: 'Go to it' }).click();
      await expect(tabs(page).first()).toHaveAttribute('aria-selected', 'true');
      await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeVisible();

      // From the other tab, Cancel that run stops it on the database.
      await tabs(page).nth(1).click();
      await held.getByRole('button', { name: 'Cancel that run' }).click();
      await expect(tabs(page).first()).toHaveAttribute('aria-label', `Query 1, Cancelled, on ${SOURCES.on}`);
      await expect.poll(() => active(marker), { timeout: 10_000 }).toBe('0');
      await expect(held).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Run', exact: true })).toBeEnabled();
      expect(posts).toHaveLength(1);
    } finally {
      await context.close();
    }
  });

  test('a run keeps going while the user is in Explore, and shows on their return, then Finished', async ({
    browser,
  }) => {
    const { context, page } = await signedIn(browser, 'manager');
    const marker = `away_${RUN}`;
    try {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto('/sql');
      await pickerButton(page).click();
      await groupOf(page).getByRole('option', { name: new RegExp(SOURCES.on) }).click();
      await typeSql(page, `SELECT pg_sleep(6) AS ${marker}`);
      await page.getByRole('button', { name: 'Run', exact: true }).click();
      await expect(page.getByTestId('sql-result-head')).toHaveText(/^Running · \d+ s of 30$/);

      await switcher(page).getByRole('link', { name: 'Explore' }).click();
      await expect(workspace(page)).toHaveCount(0);
      await expect.poll(() => active(marker), { timeout: 5_000 }).toBe('1');
      await switcher(page).getByRole('link', { name: 'SQL runner' }).click();

      await expect(page.getByTestId('sql-result-head')).toHaveText(/^Running · \d+ s of 30$/);
      await expect(tabs(page).first()).toHaveAttribute('aria-label', /^Query 1, Running · \d+ s of 30, on /);
      await expect(page.getByTestId('sql-result-head')).toHaveText(/^Finished 1 row · /, { timeout: 15_000 });
      await expect(tabs(page).first()).toHaveAttribute('aria-label', `Query 1, Finished, 1 row, on ${SOURCES.on}`);
    } finally {
      await context.close();
    }
  });
});
