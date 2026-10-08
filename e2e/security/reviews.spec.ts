import type { Page } from '@playwright/test';

import { BASE_URL, expect, signInThroughDex, test } from './fixtures';

/**
 * T355 (AC-287; design 05 of 2026-09-27, states C, D and E): each user sees,
 * in the app, the proposals they may decide, each with its item, folder,
 * author and description, and their number in the top bar. A proposal is
 * shown to no one who may not decide it.
 *
 * `writer` (`sales-rw`) proposes a chart into a folder they and `super` may
 * decide in; `reader` (`sales-ro`) only reads it; `manager` writes elsewhere.
 */
const RUN = Math.random().toString(36).slice(2, 8);
const made = { folder: '', other: '', chart: '', proposal: '', author: '' };
const TITLE = `Margin ${RUN}`;
const DESCRIPTION = `Adds the margin by month.\nAs Finance reports it (${RUN}).`;

const reviewsLink = (page: Page) =>
  page.getByRole('banner').getByRole('link', { name: /^Reviews(, \d+ waiting)?$/ });

/** The control's number, and the rows of To review, which it counts. */
async function countAndRows(page: Page) {
  await page.goto('/reviews');
  const table = page.getByRole('table', { name: 'To review' });
  await expect(table).toBeVisible();
  const name = (await reviewsLink(page).getAttribute('aria-label')) ?? '';
  const count = /, (\d+) waiting$/.exec(name)?.[1];
  const rows = await table.getByRole('row').count();
  return { count: count === undefined ? 0 : Number(count), rows: rows - 1 };
}

test.describe.configure({ mode: 'serial' });

test.describe('the proposals each user may decide (T355, AC-287)', () => {
  test.afterAll(async ({ browser }) => {
    for (const who of ['writer', 'super'] as const) {
      const context = await browser.newContext({
        baseURL: BASE_URL,
        storageState: { cookies: [], origins: [] },
      });
      await signInThroughDex(await context.newPage(), who);
      if (who === 'writer') {
        // Withdrawn by its author, then their draft removed.
        if (made.proposal !== '')
          await context.request.post(`/api/proposals/${made.proposal}/reject`, { data: {} });
        if (made.chart !== '') await context.request.delete(`/api/documents/chart/${made.chart}`);
      }
      if (who === 'super')
        for (const folder of [made.folder, made.other])
          if (folder !== '') await context.request.delete(`/api/documents/folder/${folder}`);
      await context.close();
    }
  });

  test.describe('as super', () => {
    test.use({ role: 'super' });

    test('makes the folder the proposal goes to, and one `manager` decides in', async ({
      page,
    }) => {
      for (const [key, title, readOnly, readWrite] of [
        ['folder', `Reviews ${RUN}`, ['sales-ro'], ['sales-rw']],
        ['other', `Reviews other ${RUN}`, [], ['managers']],
      ] as const) {
        const folder = await page.request.post('/api/documents', {
          data: { kind: 'folder', title, folderId: 'root' },
        });
        made[key] = ((await folder.json()) as { id: string }).id;
        const access = await page.request.put(`/api/folders/${made[key]}/access`, {
          data: { readOnly, readWrite },
        });
        expect(access.status()).toBe(200);
      }
    });
  });

  test.describe('as writer, its author', () => {
    test.use({ role: 'writer' });

    test('proposes a chart, then finds it waiting, marked as theirs, counted in the top bar', async ({
      page,
    }) => {
      const chart = await page.request.post('/api/documents', {
        data: { kind: 'chart', title: TITLE, folderId: 'mine', targetFolderId: made.folder },
      });
      expect(chart.status(), await chart.text()).toBe(201);
      made.chart = ((await chart.json()) as { id: string }).id;
      const proposed = await page.request.post('/api/proposals', {
        data: { kind: 'chart', id: made.chart, description: DESCRIPTION },
      });
      expect(proposed.status(), await proposed.text()).toBe(201);
      made.proposal = ((await proposed.json()) as { id: string }).id;
      made.author = ((await (await page.request.get('/api/me')).json()) as { name: string }).name;

      await page.goto('/explore');
      await reviewsLink(page).click();
      await expect(page).toHaveURL(/\/reviews$/);
      const table = page.getByRole('table', { name: 'To review' });
      const row = table.getByRole('row').filter({ hasText: TITLE });
      await expect(row.getByRole('cell')).toHaveText([
        // Its kind's icon before its title (state D; T699, SEC-24).
        `◢${TITLE}Yours`,
        'Chart',
        `Reviews ${RUN}`,
        made.author,
        /^Today \d\d:\d\d$/,
        '',
        'Waiting for review',
      ]);
      // Its summary: where it goes, who and the description, as written.
      await row.getByRole('button', { name: TITLE }).click();
      const summary = page.getByRole('region', { name: TITLE });
      await expect(summary.getByTestId('review-where')).toHaveText(
        `Chart → Reviews ${RUN} · new in this folder`,
      );
      await expect(summary.getByTestId('review-description')).toHaveText(DESCRIPTION);
      // Its sections headed as design 05's (T699, SEC-23); Chrome reads them as
      // drawn, in capitals.
      await expect(summary.getByRole('heading', { name: /^Proposed by$/i })).toHaveCSS(
        'text-transform',
        'uppercase',
      );
      await expect(page).toHaveURL(new RegExp(`selected=${made.proposal}`));
      // The number is the list's.
      const { count, rows } = await countAndRows(page);
      expect(count).toBe(rows);
      expect(count).toBeGreaterThanOrEqual(1);
      // As state D draws them (T699, SEC-17, SEC-18): the tabs flush with the title,
      // on no ground of their own; the count an accent pill, white 12/600, 18 px.
      const tabs = page.getByRole('tablist', { name: 'Reviews' });
      await expect(tabs).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      const title = (await page.getByRole('heading', { level: 1, name: 'Reviews' }).boundingBox())!;
      const firstTab = (await tabs.getByRole('tab').first().boundingBox())!;
      // The tab's own 10 px padding puts its words under the title's.
      expect(Math.round(firstTab.x)).toBe(Math.round(title.x));
      const pill = tabs.locator('.reviews__tab-count');
      const accent = await page.evaluate(() => {
        const probe = document.createElement('div');
        probe.style.background = 'var(--wc-accent)';
        document.body.append(probe);
        const said = getComputedStyle(probe).backgroundColor;
        probe.remove();
        return said;
      });
      await expect(pill).toHaveCSS('background-color', accent);
      await expect(pill).toHaveCSS('color', 'rgb(255, 255, 255)');
      await expect(pill).toHaveCSS('font-size', '12px');
      await expect(pill).toHaveCSS('font-weight', '600');
      await expect(pill).toHaveCSS('height', '18px');

      // Theirs, in every state.
      await page.getByRole('tab', { name: 'My proposals' }).click();
      await expect(
        page
          .getByRole('table', { name: 'My proposals' })
          .getByRole('row')
          .filter({ hasText: TITLE })
          .getByRole('cell')
          .last(),
      ).toHaveText('Waiting for review');
    });
  });

  test.describe('as super, who may decide anything', () => {
    test.use({ role: 'super' });

    test('finds it to review, not as theirs, the number the list’s', async ({ page }) => {
      await page.goto('/reviews');
      const row = page
        .getByRole('table', { name: 'To review' })
        .getByRole('row')
        .filter({ hasText: TITLE });
      await expect(row.getByRole('cell').first()).toHaveText(`◢${TITLE}`);
      await expect(row.getByRole('cell').nth(3)).toHaveText(made.author);
      const { count, rows } = await countAndRows(page);
      expect(count).toBe(rows);
    });
  });

  for (const who of ['reader', 'manager'] as const) {
    test.describe(`as ${who}, who may not decide it`, () => {
      test.use({ role: who });

      test('never sees it', async ({ page }) => {
        await page.goto('/reviews');
        await expect(page.getByRole('heading', { name: 'Reviews', level: 1 })).toBeVisible();
        // Read, not refused: the list, or its empty line, and no error.
        await expect(
          page
            .getByRole('table', { name: 'To review' })
            .or(page.getByText('Nothing is waiting for you to review.')),
        ).toBeVisible();
        await expect(page.getByRole('alert')).toHaveCount(0);
        await expect(page.getByRole('main')).not.toContainText(TITLE);
        if (who === 'reader') {
          // One who may decide nothing has no control at all.
          await page.goto('/explore');
          await expect(page.getByRole('banner')).toBeVisible();
          await expect(reviewsLink(page)).toHaveCount(0);
        }
      });
    });
  }
});
