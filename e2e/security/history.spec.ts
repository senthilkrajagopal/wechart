import { BASE_URL, expect, signInThroughDex, test } from './fixtures';

/**
 * T357 (AC-289; design 06 of 2026-09-27; rule 80): a shared dashboard's
 * History, beside it, for its folder's read-write members and Super-Admins:
 * its versions newest first, with who made each and who let it in, the
 * current one tagged, and the limit said. A version is drawn read-only;
 * restoring one is proposed, prefilled, and changes nothing until approved.
 * A reader sees no History, and the API shows them none.
 *
 * `super` makes a folder `writer` (`sales-rw`) writes and `reader`
 * (`sales-ro`) reads, with a dashboard; `writer` proposes a change, which
 * `super` approves, so the dashboard has two versions kept.
 */
const RUN = Math.random().toString(36).slice(2, 8);
const FOLDER = `History ${RUN}`;
const BOARD = `Ledger ${RUN}`;
const made = {
  folder: '',
  board: '',
  copy: '',
  project: '',
  restoreDraft: '',
  proposals: [] as string[],
};

test.describe.configure({ mode: 'serial' });

test.describe('an item’s history, and restoring a version (T357, AC-289)', () => {
  test.afterAll(async ({ browser }) => {
    for (const who of ['writer', 'super'] as const) {
      const context = await browser.newContext({
        baseURL: BASE_URL,
        storageState: { cookies: [], origins: [] },
      });
      await signInThroughDex(await context.newPage(), who);
      if (who === 'writer') {
        for (const proposal of made.proposals)
          await context.request.post(`/api/proposals/${proposal}/reject`, { data: {} });
        for (const id of [made.copy, made.restoreDraft])
          if (id !== '') await context.request.delete(`/api/documents/dashboard/${id}`);
        // The project folder the copy went into (T523).
        if (made.project !== '')
          await context.request.delete(`/api/documents/folder/${made.project}`);
      }
      if (who === 'super') {
        if (made.board !== '')
          await context.request.delete(`/api/documents/dashboard/${made.board}`);
        if (made.folder !== '')
          await context.request.delete(`/api/documents/folder/${made.folder}`);
      }
      await context.close();
    }
  });

  test.describe('as super', () => {
    test.use({ role: 'super' });

    test('makes the folder and its dashboard', async ({ page }) => {
      const folder = await page.request.post('/api/documents', {
        data: { kind: 'folder', title: FOLDER, folderId: 'root' },
      });
      made.folder = ((await folder.json()) as { id: string }).id;
      expect(
        (
          await page.request.put(`/api/folders/${made.folder}/access`, {
            data: { readOnly: ['sales-ro'], readWrite: ['sales-rw'] },
          })
        ).status(),
      ).toBe(200);
      const board = await page.request.post('/api/documents', {
        data: { kind: 'dashboard', title: BOARD, folderId: made.folder },
      });
      made.board = ((await board.json()) as { id: string }).id;
    });
  });

  test.describe('as writer', () => {
    test.use({ role: 'writer' });

    test('proposes a change: a page tab of its own', async ({ page }) => {
      const copied = await page.request.post('/api/workspace/copies', {
        data: { kind: 'dashboard', id: made.board, timeZone: 'UTC' },
      });
      ({ id: made.copy, folderId: made.project } = (await copied.json()) as {
        id: string;
        folderId: string;
      });
      const stored = (await (
        await page.request.get(`/api/documents/dashboard/${made.copy}`)
      ).json()) as { body: Record<string, unknown>; version: number };
      expect(
        (
          await page.request.put(`/api/documents/dashboard/${made.copy}`, {
            data: {
              body: {
                ...stored.body,
                pages: [{ id: 'p-summary', title: `Summary ${RUN}`, items: [] }],
              },
              version: stored.version,
            },
          })
        ).status(),
      ).toBeLessThan(300);
      const proposed = await page.request.post('/api/proposals', {
        data: { kind: 'dashboard', id: made.copy, description: `Adds a summary tab (${RUN}).` },
      });
      expect(proposed.status(), await proposed.text()).toBe(201);
      made.proposals.push(((await proposed.json()) as { id: string }).id);
    });
  });

  test.describe('as super, who approves it', () => {
    test.use({ role: 'super' });

    test('approves it, so version 1 is kept and version 2 is current', async ({ page }) => {
      const approved = await page.request.post(`/api/proposals/${made.proposals[0]!}/approve`, {
        data: {},
      });
      expect(approved.status(), await approved.text()).toBe(200);
      made.proposals = [];
    });
  });

  test.describe('as writer, again', () => {
    test.use({ role: 'writer' });

    test('opens History beside the dashboard, views version 1, and proposes restoring it', async ({
      page,
    }) => {
      await page.goto(`/explore/dashboards/${made.board}`);
      const history = page.getByRole('button', { name: 'History', exact: true });
      await history.click();
      await expect(history).toHaveAttribute('aria-pressed', 'true');
      await expect(page).toHaveURL(/[?&]panel=history/);
      const panel = page.getByRole('complementary', { name: 'History' });
      await expect(panel.getByRole('heading', { name: 'History' })).toBeFocused();
      const rows = panel.getByRole('listitem');
      await expect(rows.getByTestId('version-head')).toHaveText(['Version 2Current', 'Version 1']);
      await expect(rows.first().getByTestId('version-by')).toHaveText(
        /^Today, \d\d:\d\d by Wren Writer · approved by Super Admin$/,
      );
      await expect(rows.first().getByTestId('version-description')).toHaveText(
        `Adds a summary tab (${RUN}).`,
      );
      await expect(panel).toContainText(
        'Only the last 10 versions are kept. Restoring one is proposed and approved like any change.',
      );
      // A reload keeps it open (pin 2).
      await page.reload();
      await expect(page.getByRole('complementary', { name: 'History' })).toBeVisible();
      // Esc closes it, focus back on History (rule 85).
      await expect(
        page
          .getByRole('complementary', { name: 'History' })
          .getByRole('heading', { name: 'History' }),
      ).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('complementary', { name: 'History' })).toHaveCount(0);
      await expect(history).toBeFocused();
      // No edit in place beside it: a shared dashboard is edited in a copy
      // (T348, AC-278), so a version drawn here can never end an edit session.
      await history.click();
      await expect(page.getByRole('complementary', { name: 'History' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0);

      // Version 1 drawn read-only in its place (state A), without the new tab.
      await page
        .getByRole('complementary', { name: 'History' })
        .getByRole('button', { name: 'View version 1' })
        .click();
      const band = page.getByRole('status', { name: 'Version shown' });
      await expect(band).toContainText(`Version 1 of ${BOARD} · read-only`);
      await expect(page.getByRole('tab', { name: `Summary ${RUN}` })).toHaveCount(0);

      // Proposing its restore: titled, prefilled, and nothing changes yet (state C).
      await band.getByRole('button', { name: 'Propose restoring…' }).click();
      const ask = page.getByRole('dialog', { name: 'Replace your copy?' });
      // Their copy from the proposal before is in their workspace: asked first.
      await ask.getByRole('button', { name: 'Replace my copy' }).click();
      const dialog = page.getByRole('dialog', { name: `Propose restoring version 1 to ${FOLDER}` });
      await expect(dialog.getByTestId('propose-item')).toHaveText(
        `Dashboard · ${BOARD} — replaces version 2 with version 1’s content`,
      );
      await expect(dialog.getByLabel(/What changed/)).toHaveValue(/^Restore version 1 \(/);
      await dialog.getByRole('button', { name: 'Propose', exact: true }).click();
      await expect(page.getByTestId('restore-proposed')).toContainText(
        `Proposed restoring version 1 to ${FOLDER}. It lands when approved.`,
      );
      const review = page.getByTestId('restore-proposed').getByRole('link', { name: 'Review now' });
      const proposalId =
        (/\/reviews\/(.+)$/.exec((await review.getAttribute('href')) ?? '') ?? [])[1] ?? '';
      made.proposals.push(proposalId);
      // Its draft, in the workspace, to clean up after (T357's review).
      made.restoreDraft = (
        (await (await page.request.get(`/api/proposals/${proposalId}`)).json()) as {
          itemId: string;
        }
      ).itemId;
      expect(made.restoreDraft).toMatch(/^[0-9a-f-]{36}$/);
      // The folder still shows version 2 (AC-289: no restore without approval).
      const shared = (await (
        await page.request.get(`/api/documents/dashboard/${made.board}`)
      ).json()) as { version: number; body: { pages?: { title?: string }[] } };
      expect([shared.version, shared.body.pages?.[0]?.title]).toEqual([2, `Summary ${RUN}`]);
    });
  });

  test.describe('as reader, who only reads the folder', () => {
    test.use({ role: 'reader' });

    test('sees no History, and the API shows them none', async ({ page }) => {
      // Asserted once the page has asked for it, and been told there's none.
      const asked = page.waitForResponse((response) =>
        response.url().includes(`/api/history/dashboard/${made.board}`),
      );
      await page.goto(`/explore/dashboards/${made.board}`);
      expect((await asked).status()).toBe(404);
      await expect(page.getByRole('heading', { name: BOARD, exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'History', exact: true })).toHaveCount(0);
      expect((await page.request.get(`/api/history/dashboard/${made.board}`)).status()).toBe(404);
      // Nor with the panel asked for in the address.
      await page.goto(`/explore/dashboards/${made.board}?panel=history`);
      await expect(page.getByRole('heading', { name: BOARD, exact: true })).toBeVisible();
      await expect(page.getByRole('complementary', { name: 'History' })).toHaveCount(0);
    });
  });
});
