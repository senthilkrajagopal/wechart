import type { APIRequestContext, Page } from '@playwright/test';

import { expect, test } from './fixtures';

/**
 * T330: a folder's Access panel (AC-259, AC-260; direction.md rules 62–66),
 * redrawn by T473 as the 2026-09-27 design 07 draws it (AC-343).
 *
 * Folders are made through the API as `super`, each run with its own names:
 * P grants read-write to `sales-rw` (writer's group) and read-only to
 * `sales-ro` (reader's) and to a group of its own; C beneath it sets
 * nothing; L at the root reaches no one. Every folder is removed again after.
 */
const RUN = Math.random().toString(36).slice(2, 8);
const made: string[] = [];

async function folder(request: APIRequestContext, title: string, parent: string): Promise<string> {
  const response = await request.post('/api/documents', {
    data: { kind: 'folder', title, folderId: parent },
  });
  expect(response.status()).toBe(201);
  const { id } = (await response.json()) as { id: string };
  made.unshift(id);
  return id;
}

async function setAccess(
  request: APIRequestContext,
  id: string,
  setting: { readOnly?: string[] | null; readWrite?: string[] | null },
) {
  expect((await request.put(`/api/folders/${id}/access`, { data: setting })).status()).toBe(200);
}

const ids = { p: '', c: '', lone: '', mine: '' };
const P = `Access P ${RUN}`;
const C = `Access C ${RUN}`;
/** P's own read-only group, set nowhere else: suggested with P as where it is used. */
const P_ONLY = `p-ro-${RUN}`;

/** The panel, titled "Access" with the folder's path (design 07, pin 2). */
const accessPanel = (page: Page) => page.getByRole('complementary', { name: /^Access / });
const openAccess = async (page: Page, id: string) => {
  await page.goto(`/explore?folder=${id}`);
  await page.getByRole('button', { name: 'Access', exact: true }).click();
  const panel = accessPanel(page);
  await expect(panel.getByRole('region', { name: 'Read-write groups' })).toBeVisible();
  return panel;
};

test.describe.configure({ mode: 'serial' });

test.describe('as a Super-Admin', () => {
  test.use({ role: 'super' });

  test('makes the folders', async ({ page }) => {
    ids.p = await folder(page.request, P, 'root');
    ids.c = await folder(page.request, C, ids.p);
    ids.lone = await folder(page.request, `Access L ${RUN}`, 'root');
    await setAccess(page.request, ids.p, {
      readWrite: ['sales-rw'],
      readOnly: ['sales-ro', P_ONLY],
    });
    // M, the writer's to write and to read: a save can take the first alone.
    ids.mine = await folder(page.request, `Access M ${RUN}`, 'root');
    await setAccess(page.request, ids.mine, { readWrite: ['sales-rw'], readOnly: ['sales-rw'] });
  });

  /**
   * T396, AC-304: `Fails when: a page scrolls sideways at 390 pixels wide.`
   * Explore with the panel open drew the tree, the contents and the panel
   * side by side, 260 + 360 px and more (T396's review).
   */
  test('at 390 pixels, with the panel open, the page doesn’t scroll sideways', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openAccess(page, ids.p);
    const over = await page.evaluate(() => {
      const past = (element: Element | null) =>
        element === null ? 0 : element.scrollWidth - element.clientWidth;
      return { page: past(document.scrollingElement), main: past(document.querySelector('main')) };
    });
    expect(over).toEqual({ page: 0, main: 0 });
  });

  /** Design 07, pins 1–3: the button, the title and each list's help line (AC-399's wording). */
  test('opens from Access with its lock, pressed, titled by the folder’s path, each list with its help', async ({
    page,
  }) => {
    await page.goto(`/explore?folder=${ids.c}`);
    const button = page.getByRole('button', { name: 'Access', exact: true });
    await expect(button.locator('svg[data-icon="lock"]')).toHaveCount(1);
    await button.click();
    const panel = accessPanel(page);
    await expect(panel).toHaveAccessibleName(`Access ${P} / ${C}`);
    await expect(panel.getByRole('heading', { level: 2 })).toHaveText('Access');
    // Pressed while its panel is open: the accent's border and colour.
    await expect(button).toHaveAttribute('aria-expanded', 'true');
    const pressed = await button.evaluate((element) => {
      const style = getComputedStyle(element);
      const accent = getComputedStyle(document.documentElement)
        .getPropertyValue('--wc-accent')
        .trim();
      const probe = document.createElement('span');
      probe.style.color = accent;
      document.body.append(probe);
      const accentRgb = getComputedStyle(probe).color;
      probe.remove();
      return { border: style.borderTopColor, color: style.color, accentRgb };
    });
    expect(pressed.border).toBe(pressed.accentRgb);
    expect(pressed.color).toBe(pressed.accentRgb);

    await expect(
      panel.getByRole('region', { name: 'Read-write groups' }).getByTestId('access-help'),
    ).toHaveText(
      'Propose changes, create subfolders, set access, and build and schedule this folder’s pre-aggregations. They also see every folder above, view-only, but not its pre-aggregations in Jobs.',
    );
    await expect(
      panel.getByRole('region', { name: 'Read-only groups' }).getByTestId('access-help'),
    ).toHaveText(
      'See dashboards here, in every folder below and in every folder above. Nothing else.',
    );
    await expect(
      panel.getByText('Changes apply when saved, and every one is recorded in the audit trail.'),
    ).toBeVisible();
  });

  test('shows inherited groups locked with their source, and an unset list’s inheritance', async ({
    page,
  }) => {
    const panel = await openAccess(page, ids.c);
    const readWrite = panel.getByRole('region', { name: 'Read-write groups' });
    const readOnly = panel.getByRole('region', { name: 'Read-only groups' });

    // Read-write before read-only (rule 62).
    const [rwBox, roBox] = await Promise.all([readWrite.boundingBox(), readOnly.boundingBox()]);
    expect(rwBox!.y).toBeLessThan(roBox!.y);
    await expect(readWrite.locator('p', { hasText: 'Not set here. Inherits from' })).toHaveText(
      `Not set here. Inherits from ${P}.`,
    );
    const inherited = readWrite.getByRole('listitem', { name: /sales-rw/ });
    await expect(inherited.getByRole('img', { name: 'Inherited' })).toBeVisible();
    await expect(inherited.getByRole('button', { name: /remove/i })).toHaveCount(0);
    await expect(inherited).toContainText(`from ${P}`);
    await expect(inherited).toHaveAttribute(
      'title',
      `Set on ${P}. A grant reaches every folder below it.`,
    );

    // The source folder is a link to it, and the panel follows (pin 2).
    await inherited.getByRole('button', { name: P }).click();
    await expect(page).toHaveURL(new RegExp(`folder=${ids.p}`));
    await expect(accessPanel(page)).toHaveAccessibleName(`Access ${P}`);
  });

  test('adds a group inside a list, from its suggestions, marked Adding, and saves it with an Undo', async ({
    page,
  }) => {
    const panel = await openAccess(page, ids.c);
    const readOnly = panel.getByRole('region', { name: 'Read-only groups' });
    await readOnly.getByRole('button', { name: 'Add group' }).click();
    const picker = readOnly.getByRole('combobox', { name: 'AD group' });
    await expect(picker).toBeFocused();
    await expect(picker).toHaveAttribute(
      'placeholder',
      'Group, as your identity provider sends it',
    );

    // A group used on another folder is suggested with where (state A).
    await picker.fill(P_ONLY);
    const used = page.getByRole('listbox').getByRole('group', { name: 'Used on other folders' });
    await expect(used.getByRole('option')).toHaveText([`${P_ONLY}${P}`]);
    await picker.press('ArrowDown');
    await picker.press('Enter');
    await expect(
      readOnly.getByRole('listitem', { name: new RegExp(P_ONLY) }).getByText('Adding'),
    ).toBeVisible();

    // One typed as the identity provider sends it.
    await picker.fill(`c-viewers-${RUN}`);
    await expect(
      page.getByRole('option', { name: `Add “c-viewers-${RUN}” as typed` }),
    ).toBeVisible();
    await picker.press('Enter');
    await panel.getByRole('button', { name: 'Save 2 changes' }).click();
    const toast = page.getByRole('status').filter({ hasText: 'Access saved for' });
    await expect(toast).toContainText(`Access saved for ${P} / ${C} · 2 changes`);

    const stored = async () =>
      (
        (await (await page.request.get(`/api/folders/${ids.c}/access`)).json()) as {
          setting: unknown;
        }
      ).setting;
    expect(await stored()).toEqual({ readOnly: [P_ONLY, `c-viewers-${RUN}`], readWrite: null });

    // Undo puts it back, as another change (state E).
    await toast.getByRole('button', { name: 'Undo' }).click();
    await expect.poll(stored).toEqual({ readOnly: null, readWrite: null });

    await readOnly.getByRole('button', { name: 'Add group' }).click();
    await readOnly.getByRole('combobox', { name: 'AD group' }).fill(`c-viewers-${RUN}`);
    await readOnly.getByRole('combobox', { name: 'AD group' }).press('Enter');
    await panel.getByRole('button', { name: 'Save 1 change' }).click();
    await expect(toast).toContainText('· 1 change');
    expect(await stored()).toEqual({ readOnly: [`c-viewers-${RUN}`], readWrite: null });
  });

  test('says when only Super-Admins can see a folder, in its header and its panel', async ({
    page,
  }) => {
    await page.goto(`/explore?folder=${ids.lone}`);
    await expect(
      page.getByTestId('explore-contents').getByText('Only Super-Admins can see this folder'),
    ).toBeVisible();
    const button = page.getByRole('button', { name: 'Access', exact: true });
    await button.click();
    const panel = accessPanel(page);
    await expect(panel.getByRole('note')).toHaveText(
      'Only Super-Admins can see this folder. Add a group to either list to give people access.',
    );
    await expect(
      panel
        .getByRole('region', { name: 'Read-write groups' })
        .getByText('Not set here, and no folder above sets any.'),
    ).toBeVisible();

    // Closing it puts focus back on the button that opened it.
    await expect(button).toHaveAttribute('aria-controls', (await panel.getAttribute('id'))!);
    await panel.getByRole('button', { name: 'Close access' }).click();
    await expect(panel).toHaveCount(0);
    await expect(button).toBeFocused();
    await expect(button).toHaveAttribute('aria-expanded', 'false');
  });

  /** Pin 2: it follows the tree's selection; Back closes it, and it stays closed (T473's review). */
  test('follows the folder chosen in the tree, and stays closed once Back has closed it', async ({
    page,
  }) => {
    await openAccess(page, ids.c);
    const treeItem = (name: string) =>
      page
        .getByRole('complementary', { name: 'Folders' })
        .getByRole('tree')
        .getByRole('treeitem', { name, exact: true })
        .locator(':scope > button');
    await treeItem(P).click();
    await expect(page).toHaveURL(new RegExp(`folder=${ids.p}`));
    await expect(accessPanel(page)).toHaveAccessibleName(`Access ${P}`);

    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`folder=${ids.c}`));
    await expect(accessPanel(page)).toHaveCount(0);
    await treeItem(`Access L ${RUN}`).click();
    await expect(page.getByRole('heading', { level: 1, name: `Access L ${RUN}` })).toBeVisible();
    await expect(accessPanel(page)).toHaveCount(0);
  });

  /** State E: the toast sits clear of the panel's Save and Cancel (T473's review). */
  test('shows its Undo toast clear of the panel’s foot', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const panel = await openAccess(page, ids.lone);
    const readOnly = panel.getByRole('region', { name: 'Read-only groups' });
    await readOnly.getByRole('button', { name: 'Add group' }).click();
    await readOnly.getByRole('combobox', { name: 'AD group' }).fill(`l-viewers-${RUN}`);
    await readOnly.getByRole('combobox', { name: 'AD group' }).press('Enter');
    await panel.getByRole('button', { name: 'Save 1 change' }).click();
    const toast = page.getByRole('status').filter({ hasText: 'Access saved for' });
    await expect(toast).toBeVisible();
    const [box, foot] = await Promise.all([
      toast.boundingBox(),
      panel.locator('.access-panel__foot').boundingBox(),
    ]);
    // Left of the panel: no point of the toast over its foot.
    expect(box!.x + box!.width).toBeLessThanOrEqual(foot!.x);
    await toast.getByRole('button', { name: 'Undo' }).click();
  });

  test('asks before Cancel or Escape loses a change, and closes at once without one', async ({
    page,
  }) => {
    const panel = await openAccess(page, ids.p);
    await panel
      .getByRole('region', { name: 'Read-only groups' })
      .getByRole('button', { name: `Remove ${P_ONLY} from read-only` })
      .click();
    await expect(
      panel.getByRole('listitem', { name: new RegExp(P_ONLY) }).getByText('Removing'),
    ).toBeVisible();
    await panel.getByRole('button', { name: 'Cancel' }).click();
    const asking = panel.getByRole('alertdialog', { name: 'Discard your changes?' });
    await expect(asking.getByRole('button', { name: 'Keep editing' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(asking).toHaveCount(0);
    await panel.getByRole('button', { name: `Keep ${P_ONLY}` }).click();
    await page.keyboard.press('Escape');
    await expect(panel).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Access', exact: true })).toBeFocused();
  });
});

test.describe('as a read-write member', () => {
  test.use({ role: 'writer' });

  test('asks before a save that removes their own read-write access, and keeps it when told', async ({
    page,
  }) => {
    const panel = await openAccess(page, ids.p);
    await panel
      .getByRole('region', { name: 'Read-write groups' })
      .getByRole('button', { name: 'Remove sales-rw from read-write' })
      .click();
    await panel.getByRole('button', { name: 'Save 1 change' }).click();
    // Design 07, state D: anchored to Save, focus on Cancel.
    const asking = panel.getByRole('alertdialog', {
      name: `You’ll lose read-write access to ${P}.`,
    });
    await expect(asking).toContainText(
      'Removing sales-rw leaves you with none of this folder’s read-write groups. Save anyway?',
    );
    await expect(asking.getByRole('button', { name: 'Cancel' })).toBeFocused();
    await asking.getByRole('button', { name: 'Cancel' }).click();

    const stored = (await (await page.request.get(`/api/folders/${ids.p}/access`)).json()) as {
      setting: { readWrite: unknown };
    };
    expect(stored.setting.readWrite).toEqual(['sales-rw']);
  });

  /**
   * State G: a save that takes their read-write access leaves the panel
   * open, read-only, saying so, once the folder's access is refused as it is
   * read again (T473's review). They still see the folder, as a reader.
   */
  test('turns the panel read-only once a save has taken their read-write access', async ({
    page,
  }) => {
    const panel = await openAccess(page, ids.mine);
    await panel
      .getByRole('region', { name: 'Read-write groups' })
      .getByRole('button', { name: 'Remove sales-rw from read-write' })
      .click();
    await panel.getByRole('button', { name: 'Save 1 change' }).click();
    await panel.getByRole('alertdialog').getByRole('button', { name: 'Save anyway' }).click();
    await expect(
      panel.getByText('You can no longer change access here. The lists below are read-only.'),
    ).toBeVisible();
    await expect(panel.getByRole('button', { name: 'Add group' })).toHaveCount(0);
    await expect(panel.getByRole('button', { name: /^Save/ })).toHaveCount(0);
    // As a reader now: the folder still shown, with no Access in its header.
    await expect(page.getByRole('button', { name: 'Access', exact: true })).toHaveCount(0);
  });

  test('sets the groups of a subfolder they make, read-write and read-only', async ({ page }) => {
    const sub = await folder(page.request, `Access S ${RUN}`, ids.p);
    const panel = await openAccess(page, sub);
    for (const [group, list] of [
      [`s-writers-${RUN}`, 'Read-write groups'],
      [`s-readers-${RUN}`, 'Read-only groups'],
      [`s-auditors-${RUN}`, 'Read-only groups'],
    ] as const) {
      const region = panel.getByRole('region', { name: list });
      const picker = region.getByRole('combobox', { name: 'AD group' });
      if ((await picker.count()) === 0)
        await region.getByRole('button', { name: 'Add group' }).click();
      await picker.fill(group);
      await picker.press('Enter');
      await expect(region.getByRole('listitem', { name: group }).getByText('Adding')).toBeVisible();
    }
    await panel.getByRole('button', { name: 'Save 3 changes' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Access saved for' })).toContainText(
      `Access saved for ${P} / Access S ${RUN} · 3 changes`,
    );

    const stored = (await (await page.request.get(`/api/folders/${sub}/access`)).json()) as {
      setting: unknown;
    };
    expect(stored.setting).toEqual({
      readOnly: [`s-readers-${RUN}`, `s-auditors-${RUN}`],
      readWrite: [`s-writers-${RUN}`],
    });
  });
});

test.describe('as a read-only member', () => {
  test.use({ role: 'reader' });

  test('has no Access button', async ({ page }) => {
    // Once the API has refused them the folder's groups, not before it answers.
    const refused = page.waitForResponse((response) =>
      response.url().endsWith(`/api/folders/${ids.p}/access`),
    );
    await page.goto(`/explore?folder=${ids.p}`);
    expect((await refused).status()).toBe(403);
    await expect(page.getByRole('heading', { name: P })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Access', exact: true })).toHaveCount(0);
  });
});

test.describe('cleaning up', () => {
  test.use({ role: 'super' });

  test('removes the folders', async ({ page }: { page: Page }) => {
    for (const id of made) {
      const response = await page.request.delete(`/api/documents/folder/${id}`);
      expect([204, 404]).toContain(response.status());
    }
  });
});
