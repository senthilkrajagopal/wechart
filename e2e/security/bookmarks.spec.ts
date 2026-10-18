import { execFileSync } from 'node:child_process';

import type { APIRequestContext, Locator, Page } from '@playwright/test';

import { expect, test } from './fixtures';

/**
 * T366, AC-292: WHEN a user saves a bookmark, THE SYSTEM SHALL keep it theirs,
 * listed on the dashboard for them alone.
 * `Fails when: another user sees a bookmark its owner hasn't shared.`
 *
 * T367, T580; AC-293 (amended 2026-10-04, R61): WHEN a user shares a
 * bookmark, THE SYSTEM SHALL list it for everyone who may see the dashboard,
 * labelled with who shared it, until its owner stops sharing or deletes it,
 * or a Super-Admin deletes it. Only its owner SHALL be able to change or
 * unshare it, and only its owner or a Super-Admin SHALL be able to delete it.
 * Rule 81: Mine before Shared, newest first within each; a new one "Only me";
 * each row's visibility an icon and a label, a shared row naming who shared
 * it; Update, Rename and Stop sharing its owner's alone, Delete its owner's
 * and a Super-Admin's on another's shared one; everyone else's "Save a copy
 * to mine".
 *
 * A dashboard in a folder `writer` writes and `reader` reads, made through the
 * API as `super`, with this run's own names, and removed after. `writer` is
 * Dex's "Wren Writer" (infra/dex/config.yaml).
 */
const RUN = Math.random().toString(36).slice(2, 8);
const ids = { folder: '', dashboard: '' };
const NAME = `Writer's view ${RUN}`;
const NEWER = `Writer's newer view ${RUN}`;
const READERS = `Reader's view ${RUN}`;
const WRITER = 'Wren Writer';

async function make(
  request: APIRequestContext,
  kind: 'folder' | 'dashboard',
  title: string,
  folderId: string,
): Promise<string> {
  const response = await request.post('/api/documents', { data: { kind, title, folderId } });
  expect(response.status()).toBe(201);
  return ((await response.json()) as { id: string }).id;
}

/** The dashboard opened, and its Bookmarks popover, once what it lists has come. */
async function bookmarks(page: Page): Promise<Locator> {
  await page.goto(`/explore/dashboards/${ids.dashboard}`);
  await expect(page.getByRole('heading', { name: `Bookmarked ${RUN}` })).toBeVisible();
  await page.getByRole('button', { name: 'Bookmarks' }).click();
  const popover = page.getByRole('dialog', { name: 'Bookmarks' });
  await expect(popover.getByRole('button', { name: 'Bookmark this view…' })).toBeVisible();
  await expect(popover.getByText('Reading bookmarks…')).toHaveCount(0);
  return popover;
}

/** A section's rows, in order: each row's name and its visibility, as read. */
const rows = (popover: Locator, section: 'Mine' | 'Shared') =>
  popover.getByRole('list', { name: section }).getByRole('listitem');
const row = (popover: Locator, section: 'Mine' | 'Shared', name: string) =>
  rows(popover, section).filter({ has: popover.page().getByRole('button', { name, exact: true }) });
/** A section's bookmarks by name, in order: each row's own button, not its ⋯. */
const names = (popover: Locator, section: 'Mine' | 'Shared') =>
  rows(popover, section).getByRole('button', { name: /^(?!Actions for )/ });

async function save(page: Page, name: string) {
  const popover = await bookmarks(page);
  await popover.getByRole('button', { name: 'Bookmark this view…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Save a bookmark' });
  await dialog.getByRole('textbox', { name: 'Name' }).fill(name);
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Saved the bookmark' })).toHaveText(
    `Saved the bookmark “${name}”.`,
  );
}

/** The ⋯ menu of a row: what it offers, by name. */
async function actionsOf(page: Page, of: Locator, name: string): Promise<Locator> {
  await of.getByRole('button', { name: `Actions for ${name}` }).click();
  const menu = page.getByRole('menu', { name: `Actions for ${name}` });
  await expect(menu).toBeVisible();
  return menu;
}

/** Writer's bookmark, by name, as `request`'s user lists it: its id. */
async function idOf(request: APIRequestContext, name: string): Promise<string> {
  const response = await request.get(`/api/dashboards/${ids.dashboard}/bookmarks`);
  expect(response.status()).toBe(200);
  const listed = (
    (await response.json()) as { bookmarks: { id: string; name: string; mine: boolean }[] }
  ).bookmarks;
  const found = listed.find((each) => each.name === name && !each.mine);
  expect(found, `${name} listed as another's`).toBeDefined();
  return found!.id;
}

test.describe.configure({ mode: 'serial' });

test.describe('as a Super-Admin', () => {
  test.use({ role: 'super' });

  test('makes the dashboard', async ({ page }) => {
    ids.folder = await make(page.request, 'folder', `Bookmarks ${RUN}`, 'root');
    expect(
      (
        await page.request.put(`/api/folders/${ids.folder}/access`, {
          data: { readWrite: ['sales-rw'], readOnly: ['sales-ro'] },
        })
      ).status(),
    ).toBe(200);
    ids.dashboard = await make(page.request, 'dashboard', `Bookmarked ${RUN}`, ids.folder);
  });
});

test.describe('as a read-write member', () => {
  test.use({ role: 'writer' });

  test('saves a bookmark, and has it listed as theirs, "Only me"', async ({ page }) => {
    // T405's follow-up (AC-176, rule 85): Esc over a typed name asks first,
    // and Discard closes it, saving nothing.
    const asked = await bookmarks(page);
    await asked.getByRole('button', { name: 'Bookmark this view…' }).click();
    const dialog = page.getByRole('dialog', { name: 'Save a bookmark' });
    await dialog.getByRole('textbox', { name: 'Name' }).fill('Not kept');
    await page.keyboard.press('Escape');
    const question = page.getByRole('alertdialog', { name: 'Discard your changes?' });
    await expect(question.getByRole('button', { name: 'Keep editing' })).toBeFocused();
    await question.getByRole('button', { name: 'Discard changes' }).click();
    await expect(dialog).toHaveCount(0);

    await save(page, NAME);

    const popover = await bookmarks(page);
    await expect(row(popover, 'Mine', NAME)).toContainText('Only me');
    await expect(popover.getByRole('list', { name: 'Shared' })).toHaveCount(0);
  });
});

for (const role of ['reader', 'super'] as const) {
  test.describe(`as ${role}`, () => {
    test.use({ role });

    test('doesn’t see the writer’s bookmark on the same dashboard', async ({ page }) => {
      const popover = await bookmarks(page);
      // Read, and empty: said so once the list has come (T366's review), so
      // the check below can't pass on a list still on its way.
      await expect(popover.getByText('No bookmarks yet')).toBeVisible();
      await expect(popover.getByRole('button', { name: NAME, exact: true })).toHaveCount(0);
    });
  });
}

test.describe('the writer shares (T367)', () => {
  test.use({ role: 'writer' });

  test('lists theirs newest first, and shares two after asking', async ({ page }) => {
    await save(page, NEWER);
    let popover = await bookmarks(page);
    await expect(names(popover, 'Mine')).toHaveText([NEWER, NAME]);

    for (const name of [NAME, NEWER]) {
      popover = await bookmarks(page);
      const menu = await actionsOf(page, row(popover, 'Mine', name), name);
      // Its owner's: everything, sharing included.
      await expect(menu.getByRole('menuitem')).toHaveText([
        'Apply',
        'Update',
        'Rename…',
        'Share with everyone who can see this dashboard…',
        'Delete',
      ]);
      await menu
        .getByRole('menuitem', { name: 'Share with everyone who can see this dashboard…' })
        .click();
      const asked = page.getByRole('dialog', { name: `Share “${name}”?` });
      await expect(asked).toContainText(
        'Everyone who can see this dashboard will see it under Shared, labelled with your name.',
      );
      await asked.getByRole('button', { name: 'Share' }).click();
      await expect(page.getByRole('status').filter({ hasText: 'Shared the bookmark' })).toHaveText(
        `Shared the bookmark “${name}”.`,
      );
    }

    popover = await bookmarks(page);
    // Still theirs, under Mine, now saying Shared; and now Stop sharing.
    await expect(row(popover, 'Mine', NAME)).toContainText('Shared');
    await expect(row(popover, 'Mine', NAME)).not.toContainText('Only me');
    const menu = await actionsOf(page, row(popover, 'Mine', NAME), NAME);
    await expect(menu.getByRole('menuitem')).toHaveText([
      'Apply',
      'Update',
      'Rename…',
      'Stop sharing',
      'Delete',
    ]);
  });
});

test.describe('the reader, who may see the dashboard (T367)', () => {
  test.use({ role: 'reader' });

  test('sees the shared ones under Shared, after their own, labelled with who shared them', async ({
    page,
  }) => {
    await save(page, READERS);

    const popover = await bookmarks(page);
    await expect(popover.getByRole('heading')).toHaveText(['Mine', 'Shared']);
    await expect(rows(popover, 'Mine')).toHaveCount(1);
    await expect(row(popover, 'Mine', READERS)).toContainText('Only me');
    // Newest first.
    await expect(names(popover, 'Shared')).toHaveText([NEWER, NAME]);
    for (const name of [NEWER, NAME])
      await expect(row(popover, 'Shared', name)).toContainText(`Shared by ${WRITER}`);
  });

  /**
   * T742 (AC-343, AC-293; design 10, state B; D10-04 to D10-09, D10-11; R76:
   * design-10-Q1 to Q3), measured: each row's visibility and the day it was
   * first saved; the button's bookmark icon and svg chevron; the popover 8 px
   * under it in border-subtle; "Shared" 10 px under its rule; each row's ⋯ a
   * 24 px icon button; and the footer design 10's accent link, padded 8 12.
   */
  test('draws the popover as design 10’s state B (T742)', async ({ page }) => {
    const popover = await bookmarks(page);
    await expect(row(popover, 'Mine', READERS).locator('.bookmarks__visibility')).toHaveText(
      'Only me · today',
    );
    for (const name of [NEWER, NAME])
      await expect(row(popover, 'Shared', name).locator('.bookmarks__visibility')).toHaveText(
        `Shared by ${WRITER} · today`,
      );

    const token = await page.evaluate(() => {
      const probe = document.createElement('span');
      probe.style.color = 'var(--wc-border-subtle)';
      probe.style.backgroundColor = 'var(--wc-accent)';
      document.body.append(probe);
      const said = getComputedStyle(probe);
      const all = { subtle: said.color, accent: said.backgroundColor };
      probe.remove();
      return all;
    });
    const button = page.getByRole('button', { name: 'Bookmarks' });
    await expect(button).toHaveText('Bookmarks');
    await expect(button.locator('svg')).toHaveCount(2);
    const measured = await page.evaluate(() => {
      const box = (selector: string) => document.querySelector(selector)!.getBoundingClientRect();
      const sections = document.querySelectorAll('.bookmarks__section');
      const shared = sections[1]!;
      const heading = shared.querySelector('.bookmarks__heading')!;
      const headingStyle = getComputedStyle(heading);
      return {
        gap: box('.bookmarks').top - box('.dashboard__bookmarks-button').bottom,
        sharedRule: getComputedStyle(shared).borderTopWidth,
        aboveShared:
          heading.getBoundingClientRect().top +
          Number.parseFloat(headingStyle.paddingTop) -
          (shared.getBoundingClientRect().top +
            Number.parseFloat(getComputedStyle(shared).borderTopWidth)),
        sharedMargin: getComputedStyle(shared).marginTop,
      };
    });
    expect(measured.gap).toBe(8);
    expect(measured.sharedRule).toBe('1px');
    expect(measured.sharedMargin).toBe('4px');
    expect(measured.aboveShared).toBe(10);
    await expect(popover).toHaveCSS('border-top-color', token.subtle);

    const actions = row(popover, 'Mine', READERS).getByRole('button', {
      name: `Actions for ${READERS}`,
    });
    await expect(actions.locator('svg')).toHaveCount(1);
    expect(
      await actions.evaluate((each) => {
        const box = each.getBoundingClientRect();
        return [box.width, box.height];
      }),
    ).toEqual([24, 24]);

    const add = popover.getByRole('button', { name: 'Bookmark this view…' });
    await expect(add.locator('svg')).toHaveCount(1);
    await expect(add).toHaveCSS('color', token.accent);
    await expect(add).toHaveCSS('font-size', '12px');
    await expect(add).toHaveCSS('font-weight', '600');
    await expect(add).toHaveCSS('border-top-width', '0px');
    await expect(popover.locator('.bookmarks__foot')).toHaveCSS('padding', '8px 12px');
  });

  test('can apply it, and save a copy to theirs, but is offered no change to it', async ({
    page,
  }) => {
    let popover = await bookmarks(page);
    let menu = await actionsOf(page, row(popover, 'Shared', NAME), NAME);
    await expect(menu.getByRole('menuitem')).toHaveText(['Apply', 'Save a copy to mine…']);
    await menu.getByRole('menuitem', { name: 'Apply' }).click();
    // Said once, by the dashboard, with what it restored (T840, AC-493): one
    // page, no filters, nothing marked.
    await expect(page.getByRole('status').filter({ hasText: 'Bookmark applied' })).toHaveText(
      `Bookmark applied: ${NAME}. Nothing marked.`,
    );

    popover = await bookmarks(page);
    // The name itself applies it too.
    await row(popover, 'Shared', NEWER).getByRole('button', { name: NEWER, exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Bookmark applied' })).toHaveText(
      `Bookmark applied: ${NEWER}. Nothing marked.`,
    );

    popover = await bookmarks(page);
    menu = await actionsOf(page, row(popover, 'Shared', NAME), NAME);
    await menu.getByRole('menuitem', { name: 'Save a copy to mine…' }).click();
    const dialog = page.getByRole('dialog', { name: 'Save a copy to mine' });
    await expect(dialog.getByRole('textbox', { name: 'Name' })).toHaveValue(NAME);
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Saved the bookmark' })).toHaveText(
      `Saved the bookmark “${NAME}”.`,
    );

    popover = await bookmarks(page);
    // Theirs now, "Only me", newest of theirs; the writer's still under Shared.
    await expect(names(popover, 'Mine')).toHaveText([NAME, READERS]);
    await expect(row(popover, 'Mine', NAME)).toContainText('Only me');
    await expect(row(popover, 'Shared', NAME)).toContainText(`Shared by ${WRITER}`);
  });

  test('is refused any change to it through the API, and it stays as it was', async ({ page }) => {
    const id = await idOf(page.request, NAME);
    const url = `/api/dashboards/${ids.dashboard}/bookmarks/${id}`;
    for (const data of [
      { shared: false },
      { name: 'Taken over' },
      { state: { page: 'p9', filters: {}, marks: {} } },
    ])
      expect((await page.request.patch(url, { data })).status(), JSON.stringify(data)).toBe(403);
    expect((await page.request.delete(url)).status()).toBe(403);

    const popover = await bookmarks(page);
    await expect(row(popover, 'Shared', NAME)).toContainText(`Shared by ${WRITER}`);
    await expect(popover.getByRole('button', { name: 'Taken over' })).toHaveCount(0);
  });
});

test.describe('a Super-Admin, who may see every dashboard (T367)', () => {
  test.use({ role: 'super' });

  test('sees the shared ones too, and may apply them, save a copy, or delete them', async ({
    page,
  }) => {
    const popover = await bookmarks(page);
    await expect(names(popover, 'Shared')).toHaveText([NEWER, NAME]);
    await expect(row(popover, 'Shared', NAME)).toContainText(`Shared by ${WRITER}`);
    const menu = await actionsOf(page, row(popover, 'Shared', NAME), NAME);
    // Delete too, as a Super-Admin (T580; AC-293 and rule 81, amended by R61),
    // but never Update, Rename or Stop sharing: those are its owner's alone.
    await expect(menu.getByRole('menuitem')).toHaveText([
      'Apply',
      'Save a copy to mine…',
      'Delete',
    ]);
  });
});

test.describe('the writer stops sharing (T367)', () => {
  test.use({ role: 'writer' });

  test('takes one back to "Only me"', async ({ page }) => {
    const popover = await bookmarks(page);
    const menu = await actionsOf(page, row(popover, 'Mine', NAME), NAME);
    await menu.getByRole('menuitem', { name: 'Stop sharing' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Stopped sharing' })).toHaveText(
      `Stopped sharing the bookmark “${NAME}”.`,
    );

    await expect(row(await bookmarks(page), 'Mine', NAME)).toContainText('Only me');
  });
});

test.describe('the reader, after (T367)', () => {
  test.use({ role: 'reader' });

  test('no longer sees the one the writer stopped sharing', async ({ page }) => {
    const popover = await bookmarks(page);
    await expect(names(popover, 'Shared')).toHaveText([NEWER]);
    // Their own copy stays theirs.
    await expect(row(popover, 'Mine', NAME)).toContainText('Only me');
  });
});

/**
 * T580 (AC-293, amended 2026-10-04 by R61): a Super-Admin may delete any
 * shared bookmark, so one its owner can no longer reach can be removed. It
 * stays listed until then.
 */
test.describe('a Super-Admin removes a shared bookmark (T580)', () => {
  test.use({ role: 'super' });

  test('deletes the writer’s, from its ⋯', async ({ page }) => {
    const popover = await bookmarks(page);
    const menu = await actionsOf(page, row(popover, 'Shared', NEWER), NEWER);
    await menu.getByRole('menuitem', { name: 'Delete' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Deleted' })).toHaveText(
      `Deleted the bookmark “${NEWER}”.`,
    );

    await expect((await bookmarks(page)).getByRole('list', { name: 'Shared' })).toHaveCount(0);
  });
});

for (const role of ['writer', 'reader'] as const)
  test.describe(`as ${role}, after (T580)`, () => {
    test.use({ role });

    test('no longer finds the one the Super-Admin deleted', async ({ page }) => {
      const popover = await bookmarks(page);
      await expect(popover.getByRole('button', { name: NEWER, exact: true })).toHaveCount(0);
      // What else each had stays: the writer's own, and the reader's copy.
      await expect(names(popover, 'Mine')).toHaveText(role === 'writer' ? [NAME] : [NAME, READERS]);
    });
  });

/**
 * T762 (AC-429): a bookmark phase 1 saved, before sign-in, on this dashboard,
 * whose owner is phase 1's single user (`admin`): written into the suite's
 * own database as phase 1 wrote it, since no route makes one with sign-in on.
 * A Super-Admin is shown it under Shared, "Saved before sign-in", to apply or
 * copy; a reader who may see the dashboard is not shown it.
 */
test.describe('phase 1’s bookmark (T762, AC-429)', () => {
  const OLD = `Phase one view ${RUN}`;
  const bookmarkId = `0f0f0f0f-0000-4000-8000-${RUN.padStart(12, '0')}`;
  const psql = (sql: string) =>
    execFileSync(
      'docker',
      ['exec', 'wechart-meta', 'psql', '-U', 'wechart', '-d', 'wechart_security', '-Atc', sql],
      { encoding: 'utf8' },
    );
  test.beforeAll(() => {
    const body = JSON.stringify({
      dashboardId: ids.dashboard,
      title: OLD,
      state: { page: 'p1', filters: {}, marks: {} },
      owner: 'admin',
    }).replace(/'/g, "''");
    psql(`INSERT INTO documents (kind, id, body) VALUES ('bookmark', '${bookmarkId}', '${body}')`);
  });
  test.afterAll(() => {
    psql(`DELETE FROM documents WHERE kind = 'bookmark' AND id = '${bookmarkId}'`);
  });

  test.describe('as a Super-Admin', () => {
    test.use({ role: 'super' });

    test('sees it under Shared, saved before sign-in, to apply or copy only', async ({ page }) => {
      const popover = await bookmarks(page);
      const old = row(popover, 'Shared', OLD);
      // With the day it was saved, as every row says it (T742, design-10-Q2).
      await expect(old.locator('.bookmarks__visibility')).toHaveText(
        'Saved before sign-in · today',
      );
      const menu = await actionsOf(page, old, OLD);
      await expect(menu.getByRole('menuitem')).toHaveText(['Apply', 'Save a copy to mine…']);
    });
  });

  test.describe('as reader, who may see the dashboard', () => {
    test.use({ role: 'reader' });

    test('isn’t shown it', async ({ page }) => {
      const popover = await bookmarks(page);
      await expect(popover.getByRole('button', { name: OLD, exact: true })).toHaveCount(0);
      expect(
        (
          (await (await page.request.get(`/api/dashboards/${ids.dashboard}/bookmarks`)).json()) as {
            bookmarks: { name: string }[];
          }
        ).bookmarks.map((each) => each.name),
      ).not.toContain(OLD);
    });
  });
});

test.describe('cleaning up', () => {
  test.use({ role: 'super' });

  test('removes the dashboard, its bookmarks with it, and the folder', async ({ page }) => {
    for (const [kind, id] of [
      ['dashboard', ids.dashboard],
      ['folder', ids.folder],
    ] as const) {
      if (id === '') continue;
      const response = await page.request.delete(`/api/documents/${kind}/${id}`);
      expect([204, 404]).toContain(response.status());
    }
  });
});
