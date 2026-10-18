import type { Page } from '@playwright/test';

import {
  BASE_URL,
  expect,
  projectFolderOf,
  removeProjectFolder,
  signInThroughDex,
  test,
} from './fixtures';
import { changeShared } from './shared-change';
import { headerToggle, openHeaderSheet } from '../dashboardHeader';

/**
 * T843 (AC-496; design 19 state A): with sign-in on, a shared dashboard
 * with a one-line description, its ownership line, three page tabs and a
 * filter set, read by a read-write member: the canvas's top edge at most
 * 96 px down with the header sheet closed, and at most 205 px with it open
 * (one row of pills), at 1,440 × 900 and 1,280 × 720; its copy in My
 * workspace, under the 32 px band, at most 128 px. Single-user mode shows no
 * ownership line, so this is where that case is held.
 *
 * `super` makes a folder `writer` (`sales-rw`) writes, with the dashboard in it.
 */
const RUN = Math.random().toString(36).slice(2, 8);
const FOLDER = `Header ${RUN}`;
/**
 * As long as design 19's "Revenue overview": a title the row cuts short is
 * repeated whole at the top of the open sheet (state G), a line AC-496's
 * case doesn't hold.
 */
const BOARD = `Overview ${RUN}`;
const made = { folder: '', board: '', copy: '', project: '' };

const SIZES = [
  { width: 1440, height: 900 },
  { width: 1280, height: 720 },
] as const;

/** The filter set, in the dashboard's address. */
const FILTERS = encodeURIComponent(
  JSON.stringify([
    { id: 'f-status', member: 'orders.status', value: { kind: 'values', values: ['shipped'] } },
  ]),
);

/** How far below the viewport's top the tile canvas starts. */
const canvasTop = async (page: Page) =>
  (await page.getByTestId('canvas-scroll').boundingBox())?.y ?? Number.POSITIVE_INFINITY;

test.describe.configure({ mode: 'serial' });

test.describe('the compact header with sign-in on (T843, AC-496)', () => {
  test.afterAll(async ({ browser }) => {
    for (const who of ['writer', 'super'] as const) {
      const context = await browser.newContext({
        baseURL: BASE_URL,
        storageState: { cookies: [], origins: [] },
      });
      await signInThroughDex(await context.newPage(), who);
      if (who === 'writer') {
        if (made.copy !== '') await context.request.delete(`/api/documents/dashboard/${made.copy}`);
        await removeProjectFolder(context.request, made.project);
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
      expect(folder.status(), await folder.text()).toBe(201);
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
      expect(board.status(), await board.text()).toBe(201);
      made.board = ((await board.json()) as { id: string }).id;
      // A one-line description, three pages and a filter (AC-496's case).
      await changeShared(page.request, 'dashboard', made.board, (body) => ({
        ...body,
        description: 'Monthly revenue and orders for the EMEA region.',
        settings: { width: 'full' },
        pages: ['Overview', 'By country', 'Detail'].map((title, index) => ({
          id: `p${String(index + 1)}`,
          title,
          items: [{ id: `n${String(index + 1)}`, kind: 'markdown', w: 6, h: 8, text: title }],
        })),
        filters: [{ id: 'f-status', widget: 'checkbox', member: 'orders.status' }],
      }));
    });
  });

  test.describe('as writer', () => {
    test.use({ role: 'writer' });

    for (const size of SIZES) {
      test(`the canvas starts at most 96 px down closed and 205 px open, at ${String(size.width)} × ${String(size.height)}`, async ({
        page,
      }) => {
        await page.setViewportSize(size);
        await page.goto(`/explore/dashboards/${made.board}?filters=${FILTERS}`);
        await expect(page.getByRole('heading', { level: 1, name: BOARD })).toBeVisible();
        const tabs = page.locator('.dashboard__header').getByRole('tablist', { name: 'Pages' });
        await expect(tabs.getByRole('tab')).toHaveText(['Overview', 'By country', 'Detail']);
        await expect(headerToggle(page)).toHaveAccessibleName('Filters, 1 set');

        // Closed: the 48 px app bar and the 48 px row.
        expect(await canvasTop(page)).toBeLessThanOrEqual(96);

        // Open: the description and the ownership line, each one line, and
        // one row of pills.
        await openHeaderSheet(page);
        const description = page.locator('.header-sheet .dashboard__description');
        const ownership = page.locator('.header-sheet .dashboard__ownership');
        await expect(description).toHaveText('Monthly revenue and orders for the EMEA region.');
        await expect(ownership).toContainText(`In ${FOLDER}`);
        for (const line of [description, ownership]) {
          const [height, lineHeight] = await line.evaluate((node) => [
            node.getBoundingClientRect().height,
            parseFloat(getComputedStyle(node).lineHeight),
          ]);
          expect(height).toBeLessThanOrEqual(lineHeight! + 1);
        }
        // The title whole in the row, so the sheet doesn't repeat it (state G).
        await expect(page.locator('.header-sheet__title')).toHaveCount(0);
        expect(await canvasTop(page)).toBeLessThanOrEqual(205);
      });
    }

    test('its copy in My workspace starts the canvas at most 128 px down, under the band', async ({
      page,
    }) => {
      await page.goto(`/explore/dashboards/${made.board}`);
      await expect(page.getByRole('heading', { level: 1, name: BOARD })).toBeVisible();
      await page
        .locator('.dashboard__header')
        .getByRole('button', { name: 'Edit in my workspace' })
        .click();
      await page
        .getByRole('dialog', { name: 'Edit in my workspace' })
        .getByRole('button', { name: 'Copy and edit' })
        .click();
      await page.waitForURL(
        (url) =>
          /\/explore\/dashboards\/[0-9a-f-]{36}/.test(url.pathname) &&
          !url.pathname.endsWith(made.board),
      );
      made.copy = /\/explore\/dashboards\/([0-9a-f-]{36})/.exec(page.url())?.[1] ?? '';
      made.project = await projectFolderOf(page.request, 'dashboard', made.copy);

      for (const size of SIZES) {
        await page.setViewportSize(size);
        await page.goto(`/explore/dashboards/${made.copy}?filters=${FILTERS}`);
        await expect(page.getByRole('note')).toHaveText('My workspace · only you can see this');
        await expect(page.getByRole('heading', { level: 1, name: BOARD })).toBeVisible();
        await expect(headerToggle(page)).toHaveAttribute('aria-expanded', 'false');
        expect(
          await canvasTop(page),
          `${String(size.width)} × ${String(size.height)}`,
        ).toBeLessThanOrEqual(128);
      }
    });
  });
});
