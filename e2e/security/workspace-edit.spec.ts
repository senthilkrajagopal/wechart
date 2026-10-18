import {
  BASE_URL,
  expect,
  projectFolderOf,
  removeProjectFolder,
  signInThroughDex,
  test,
} from './fixtures';
import { headerSheet as sheet, openHeaderSheet } from '../dashboardHeader';

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
const made = {
  folder: '',
  board: '',
  copy: '',
  chart: '',
  chartCopy: '',
  /** The project folders the copies went into (T523). */
  boardProject: '',
  chartProject: '',
};
/** A project folder's name: the minute it was made, `-2` and on in the same minute (T523). */
const PROJECT = /^project-\d{4}-\d{2}-\d{2}-\d{4}(-\d+)?$/;

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
        for (const project of [made.boardProject, made.chartProject])
          await removeProjectFolder(context.request, project);
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
      // The ownership line is in the header sheet since T828 (F43).
      await openHeaderSheet(page);
      await expect(sheet(page).getByText(`In ${FOLDER} · version 1`)).toBeVisible();
      // Before the filter bar, which ends the sheet (AC-487, T832).
      const ownership = (await sheet(page).locator('.dashboard__ownership').boundingBox())!;
      const bar = (await sheet(page)
        .getByRole('region', { name: 'Filters', exact: true })
        .boundingBox())!;
      expect(ownership.y + ownership.height).toBeLessThanOrEqual(bar.y);
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
      // Where it goes: a new folder, named for this minute (T523; design 14, G1).
      await expect(dialog.getByTestId('project-folder')).toHaveText(
        /^Into a new folder in My workspace: project-\d{4}-\d{2}-\d{2}-\d{4}$/,
      );
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
      made.boardProject = await projectFolderOf(page.request, 'dashboard', made.copy);
      // Opened to be edited ("Copy and edit").
      await expect(page.getByRole('toolbar', { name: 'Dashboard editing' })).toBeVisible();
      await page.goto(`/explore/dashboards/${made.copy}`);
      // Under the workspace's band (pin 2).
      await expect(page.getByRole('note')).toHaveText('My workspace · only you can see this');
      const copied = page.locator('.dashboard__header');
      // Its ownership line, in the header sheet (T828).
      await openHeaderSheet(page);
      await expect(
        sheet(page).getByText(`Copied from ${FOLDER} › ${BOARD} · version 1 · Target: ${FOLDER}`),
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

    /**
     * T694 (EXP-09, EXP-15; design 14, B1; design 04, pins 3 and 7; AC-278,
     * AC-289): each row's ⋯ offers what its page does, by its kind and
     * place, and a workspace row is two lines, 44 px.
     */
    test('finds each row’s ⋯ by its kind and place, and My workspace’s rows on two lines', async ({
      page,
    }) => {
      await page.goto(`/explore?folder=${made.folder}`);
      const contents = page.getByTestId('explore-contents');
      const entries = (menu: ReturnType<typeof page.getByRole>) =>
        menu
          .locator('[role="menuitem"], [role="separator"]')
          .evaluateAll((all) =>
            all.map((each) =>
              each.getAttribute('role') === 'separator' ? '—' : (each.textContent ?? ''),
            ),
          );
      // The dashboard, which the writer has a copy of: Open my copy.
      await contents
        .getByTestId(`item-${made.board}`)
        .getByRole('button', { name: `Actions for ${BOARD}` })
        .click();
      const boardMenu = page.getByRole('menu', { name: `Actions for ${BOARD}` });
      await expect(boardMenu).toBeVisible();
      expect(await entries(boardMenu)).toEqual([
        'Open',
        'Open my copy',
        'History',
        'Export…',
        '—',
        'Rename',
        'Move to…',
        '—',
        'Delete…',
      ]);
      await page.keyboard.press('Escape');
      // The chart, not yet copied: Edit in my workspace, and no Export….
      await contents
        .getByTestId(`item-${made.chart}`)
        .getByRole('button', { name: `Actions for ${CHART}` })
        .click();
      const chartMenu = page.getByRole('menu', { name: `Actions for ${CHART}` });
      await expect(chartMenu).toBeVisible();
      expect(await entries(chartMenu)).toEqual([
        'Open',
        'Edit in my workspace',
        'History',
        '—',
        'Rename',
        'Move to…',
        '—',
        'Delete…',
      ]);
      await page.keyboard.press('Escape');

      // Open my copy opens the copy to be edited, as the dashboard's own button does.
      await contents
        .getByTestId(`item-${made.board}`)
        .getByRole('button', { name: `Actions for ${BOARD}` })
        .click();
      await page.getByRole('menuitem', { name: 'Open my copy' }).click();
      await expect(page).toHaveURL(new RegExp(`/explore/dashboards/${made.copy}\\?editing=true$`));

      // History opens the dashboard with its History beside it.
      await page.goto(`/explore?folder=${made.folder}`);
      await contents
        .getByTestId(`item-${made.board}`)
        .getByRole('button', { name: `Actions for ${BOARD}` })
        .click();
      await page.getByRole('menuitem', { name: 'History' }).click();
      await expect(page).toHaveURL(
        new RegExp(`/explore/dashboards/${made.board}\\?panel=history$`),
      );
      await expect(page.getByRole('complementary', { name: 'History' })).toBeVisible();
      // A chart's too: its page reads the same address (T694).
      await page.goto(`/explore?folder=${made.folder}`);
      await contents
        .getByTestId(`item-${made.chart}`)
        .getByRole('button', { name: `Actions for ${CHART}` })
        .click();
      await page.getByRole('menuitem', { name: 'History' }).click();
      await expect(page).toHaveURL(new RegExp(`/explore/charts/${made.chart}\\?panel=history$`));
      await expect(page.getByRole('complementary', { name: 'History' })).toBeVisible();
      // Docked at the window's right, full height, on a chart's page too (T695).
      const docked = (await page.getByRole('complementary', { name: 'History' }).boundingBox())!;
      const bar = (await page.locator('.app-bar').boundingBox())!;
      const viewport = page.viewportSize()!;
      expect([
        Math.round(docked.width),
        Math.round(docked.x + docked.width),
        Math.round(docked.y),
        Math.round(docked.y + docked.height),
      ]).toEqual([360, viewport.width, Math.round(bar.y + bar.height), viewport.height]);

      // In My workspace: the copy's row is two lines, its next step first.
      await page.goto(`/explore?folder=${made.boardProject}`);
      const copy = contents.getByTestId(`item-${made.copy}`);
      await expect(copy).toHaveClass(/\bis-two-line\b/);
      expect(Math.round((await copy.boundingBox())?.height ?? 0)).toBe(44);
      await copy.getByRole('button', { name: `Actions for ${BOARD}` }).click();
      await expect(page.getByRole('menuitem').first()).toHaveText(`Propose to ${FOLDER}…`);
      await page.keyboard.press('Escape');
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
      // Asked of design 06's picker, which took the select's place (T686):
      // both are titled BOARD, told apart by their folders (T406).
      await page
        .getByRole('complementary', { name: 'Chart details' })
        .getByRole('button', { name: '＋ Add to a dashboard…' })
        .click();
      const picker = page.getByRole('dialog', { name: 'Add to a dashboard' });
      await picker.getByRole('searchbox', { name: 'Find a dashboard' }).fill(BOARD);
      const offered = picker
        .locator('.chart-page__pick')
        .filter({ has: page.locator('.chart-page__pick-title', { hasText: BOARD }) });
      await expect(offered).toHaveCount(1);
      // The copy's: in its project folder in My workspace, not in FOLDER.
      const project = (await (
        await page.request.get(`/api/documents/folder/${made.boardProject}`)
      ).json()) as { body: { title: string } };
      await expect(offered.locator('.chart-page__pick-folder')).toHaveText(project.body.title);
      await page.keyboard.press('Escape');
      await expect(picker).toHaveCount(0);
      await head.getByRole('button', { name: 'Edit in my workspace' }).click();

      // The copy, opened in the editor.
      await page.waitForURL((url) => /\/explore\/charts\/[0-9a-f-]{36}\/edit$/.test(url.pathname));
      made.chartCopy = /\/explore\/charts\/([0-9a-f-]{36})\/edit/.exec(page.url())?.[1] ?? '';
      expect(made.chartCopy).toMatch(/^[0-9a-f-]{36}$/);
      expect(made.chartCopy).not.toBe(made.chart);
      made.chartProject = await projectFolderOf(page.request, 'chart', made.chartCopy);

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

    /**
     * T523 (AC-368, AC-369; design 14, states G2 and G3): each copy went
     * into a folder of its own in My workspace, named for the minute it was
     * made, its description saying what it edits and where from; the
     * dashboard's folder holds its copy.
     */
    test('finds each copy in a project folder of its own, which says what it edits', async ({
      page,
    }) => {
      expect(made.boardProject).not.toBe('mine');
      expect(made.chartProject).not.toBe('mine');
      expect(made.chartProject).not.toBe(made.boardProject);
      await page.goto('/explore?folder=mine');
      const contents = page.getByTestId('explore-contents');
      for (const [project, title] of [
        [made.boardProject, BOARD],
        [made.chartProject, CHART],
      ] as const) {
        const row = contents.getByTestId(`item-${project}`);
        await expect(row.locator('.folder-contents__open')).toHaveText(PROJECT);
        // Its description as its second line (P1).
        await expect(row.locator('.folder-contents__description')).toHaveText(
          `Editing ${title} from ${FOLDER}`,
        );
      }

      // Opened: named in its heading, described under it, editable there (G3).
      const row = contents.getByTestId(`item-${made.boardProject}`);
      const open = row.locator('.folder-contents__open');
      const name = (await open.textContent()) ?? '';
      await open.click();
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(name);
      await expect(page.locator('.folder-description__text')).toHaveText(
        `Editing ${BOARD} from ${FOLDER}`,
      );
      await expect(page.getByRole('button', { name: 'Edit description' })).toBeVisible();
      await expect(contents.getByTestId(`item-${made.copy}`)).toBeVisible();
    });
  });

  test.describe('as reader', () => {
    test.use({ role: 'reader' });

    test('reads it, and is offered no way to change it', async ({ page }) => {
      await page.goto(`/explore/dashboards/${made.board}`);
      const header = page.locator('.dashboard__header');
      // The ownership line is in the header sheet since T828 (F43).
      await openHeaderSheet(page);
      await expect(sheet(page).getByText(`In ${FOLDER} · version 1`)).toBeVisible();
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
