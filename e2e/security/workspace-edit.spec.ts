import { BASE_URL, expect, signInThroughDex, test } from './fixtures';

/**
 * T348 (AC-278, AC-279; design 04, states D, E, F and G; rules 71–73): a
 * shared dashboard is never edited in place. Its header offers "Edit in my
 * workspace", whose dialog says what is always copied and copies it; the
 * copy's header says where it came from and where it goes, with "Propose
 * to …"; the shared one then offers "Open my copy". A reader is offered
 * neither.
 *
 * `super` makes a folder `writer` (`sales-rw`) writes and `reader`
 * (`sales-ro`) reads, with a dashboard in it.
 */
const RUN = Math.random().toString(36).slice(2, 8);
const FOLDER = `Edit here ${RUN}`;
const BOARD = `Pipeline ${RUN}`;
const CHART = `Margin ${RUN}`;
const made = { folder: '', board: '', copy: '', chart: '', chartCopy: '' };

test.describe.configure({ mode: 'serial' });

test.describe('editing a shared dashboard in my workspace (T348, AC-278)', () => {
  test.afterAll(async ({ browser }) => {
    for (const who of ['writer', 'super'] as const) {
      const context = await browser.newContext({
        baseURL: BASE_URL,
        storageState: { cookies: [], origins: [] },
      });
      await signInThroughDex(await context.newPage(), who);
      if (who === 'writer') {
        if (made.copy !== '') await context.request.delete(`/api/documents/dashboard/${made.copy}`);
        if (made.chartCopy !== '')
          await context.request.delete(`/api/documents/chart/${made.chartCopy}`);
      }
      if (who === 'super') {
        if (made.board !== '')
          await context.request.delete(`/api/documents/dashboard/${made.board}`);
        if (made.chart !== '') await context.request.delete(`/api/documents/chart/${made.chart}`);
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
      // A library chart beside it, with no fields yet: its page is what's tested.
      const chart = await page.request.post('/api/documents', {
        data: { kind: 'chart', title: CHART, folderId: made.folder },
      });
      expect(chart.status(), await chart.text()).toBe(201);
      made.chart = ((await chart.json()) as { id: string }).id;
    });
  });

  test.describe('as writer', () => {
    test.use({ role: 'writer' });

    test('is offered a copy to edit, never the shared one, and the copy goes back by proposal', async ({
      page,
    }) => {
      await page.goto(`/explore/dashboards/${made.board}`);
      await expect(page.getByRole('heading', { name: BOARD, exact: true })).toBeVisible();
      const header = page.locator('.dashboard__header');
      await expect(header.getByText(`In ${FOLDER} · version 1`)).toBeVisible();
      // No edit in place (state E): no Edit, no settings, no way to start
      // editing from its empty page (T348's review).
      await expect(header.getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Dashboard settings' })).toHaveCount(0);
      await expect(page.locator('.dashboard-empty')).toHaveText('Nothing here yet.');
      await expect(page.getByRole('button', { name: 'Start editing' })).toHaveCount(0);
      await expect(page.getByRole('note').filter({ hasText: 'My workspace' })).toHaveCount(0);
      await header.getByRole('button', { name: 'Edit in my workspace' }).click();

      // What is always copied, and nothing else unless ticked (state D).
      const dialog = page.getByRole('dialog', { name: 'Edit in my workspace' });
      await expect(dialog).toContainText(
        `Copies ${BOARD} into My workspace. You’ll propose it back to ${FOLDER}.`,
      );
      await expect(dialog.getByTestId('always-copied')).toHaveText('Always copied: the dashboard.');
      await expect(dialog).toContainText('Anything you don’t copy is used from its folder.');
      await dialog.getByRole('button', { name: 'Copy and edit' }).click();

      // The copy, open to be edited, then its header in view mode (state F).
      await page.waitForURL(
        (url) =>
          /\/explore\/dashboards\/[0-9a-f-]{36}/.test(url.pathname) &&
          !url.pathname.endsWith(made.board),
      );
      made.copy = /\/explore\/dashboards\/([0-9a-f-]{36})/.exec(page.url())?.[1] ?? '';
      expect(made.copy).toMatch(/^[0-9a-f-]{36}$/);
      expect(made.copy).not.toBe(made.board);
      // Opened to be edited ("Copy and edit").
      await expect(page.getByRole('toolbar', { name: 'Dashboard editing' })).toBeVisible();
      await page.goto(`/explore/dashboards/${made.copy}`);
      // Under the workspace's band (pin 2).
      await expect(page.getByRole('note')).toHaveText('My workspace · only you can see this');
      const copied = page.locator('.dashboard__header');
      await expect(
        copied.getByText(`Copied from ${FOLDER} › ${BOARD} · version 1 · Target: ${FOLDER}`),
      ).toBeVisible();
      await expect(copied.getByRole('button', { name: 'Edit', exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Dashboard settings' })).toBeVisible();
      await copied.getByRole('button', { name: `Propose to ${FOLDER}…` }).click();
      const propose = page.getByRole('dialog', { name: `Propose to ${FOLDER}` });
      await expect(propose.getByTestId('propose-item')).toHaveText(
        `Dashboard · ${BOARD} — replaces version 1`,
      );
      await propose.getByRole('button', { name: 'Cancel' }).click();

      // The shared one now opens that copy, to be edited (AC-278).
      await page.goto(`/explore/dashboards/${made.board}`);
      await page
        .locator('.dashboard__header')
        .getByRole('button', { name: 'Open my copy' })
        .click();
      await expect(page).toHaveURL(new RegExp(`/explore/dashboards/${made.copy}\\?editing=true$`));
      await expect(page.getByRole('toolbar', { name: 'Dashboard editing' })).toBeVisible();
    });

    test('is offered a copy of a shared library chart, never its editor, and the copy goes back by proposal', async ({
      page,
    }) => {
      await page.goto(`/explore/charts/${made.chart}`);
      await expect(page.getByRole('heading', { name: CHART, exact: true })).toBeVisible();
      const head = page.locator('.chart-page__head');
      await expect(head.getByText(`In ${FOLDER} · version 1`)).toBeVisible();
      await expect(head.getByRole('link', { name: /Edit chart/ })).toHaveCount(0);
      // Added only to a dashboard in My workspace: the dashboard's copy, never
      // the shared dashboard, which gains a tile only by a proposal (T502).
      const onto = page.getByRole('combobox', { name: 'Dashboard' });
      await expect(onto.locator(`option[value="${made.copy}"]`)).toHaveCount(1);
      await expect(onto.locator(`option[value="${made.board}"]`)).toHaveCount(0);
      await head.getByRole('button', { name: 'Edit in my workspace' }).click();

      // The copy, opened in the editor.
      await page.waitForURL((url) => /\/explore\/charts\/[0-9a-f-]{36}\/edit$/.test(url.pathname));
      made.chartCopy = /\/explore\/charts\/([0-9a-f-]{36})\/edit/.exec(page.url())?.[1] ?? '';
      expect(made.chartCopy).toMatch(/^[0-9a-f-]{36}$/);
      expect(made.chartCopy).not.toBe(made.chart);

      // Its page: the band, where it came from and goes, and Propose as its primary.
      await page.goto(`/explore/charts/${made.chartCopy}`);
      await expect(page.getByRole('note')).toHaveText('My workspace · only you can see this');
      const copied = page.locator('.chart-page__head');
      await expect(
        copied.getByText(`Copied from ${FOLDER} › ${CHART} · version 1 · Target: ${FOLDER}`),
      ).toBeVisible();
      await expect(copied.getByRole('button', { name: `Propose to ${FOLDER}…` })).toHaveClass(
        /btn-primary/,
      );

      // The shared one now opens that copy.
      await page.goto(`/explore/charts/${made.chart}`);
      await page.locator('.chart-page__head').getByRole('button', { name: 'Open my copy' }).click();
      await expect(page).toHaveURL(new RegExp(`/explore/charts/${made.chartCopy}/edit$`));
    });
  });

  test.describe('as reader', () => {
    test.use({ role: 'reader' });

    test('reads it, and is offered no way to change it', async ({ page }) => {
      await page.goto(`/explore/dashboards/${made.board}`);
      const header = page.locator('.dashboard__header');
      await expect(header.getByText(`In ${FOLDER} · version 1`)).toBeVisible();
      await expect(header.getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0);
      await expect(
        header.getByRole('button', { name: /Edit in my workspace|Open my copy/ }),
      ).toHaveCount(0);
      // Nor its settings, nor a way to start editing its empty page.
      await expect(page.getByRole('button', { name: 'Dashboard settings' })).toHaveCount(0);
      await expect(page.locator('.dashboard-empty')).toHaveText('Nothing here yet.');
    });
  });
});
