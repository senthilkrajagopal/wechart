import type { Page } from '@playwright/test';

import { BASE_URL, expect, signInThroughDex, test } from './fixtures';

/**
 * T358 (AC-284, AC-290; design 05 of 2026-09-27, states A, B and M): the
 * author proposes a workspace chart from its row in Explore, through the
 * Propose dialog, which names where it goes and refuses a description over
 * 1,000 characters. The folder is unchanged while it waits, and the row and
 * the chart's page say it waits. Rejected, the chart stays in the workspace,
 * its page shows who rejected it and why, and Dismiss puts the band away for
 * good (R42.1).
 *
 * `super` makes the folder, which `writer` (`sales-rw`) may write, and
 * rejects the proposal.
 */
const RUN = Math.random().toString(36).slice(2, 8);
const made = { folder: '', chart: '', proposal: '', decider: '' };
const TITLE = `Proposed margin ${RUN}`;
const FOLDER = `Propose ${RUN}`;
const DESCRIPTION = `Adds the margin by month (${RUN}).`;
const REASON = `Keep the median, as Finance reports it (${RUN}).`;

async function workspaceRow(page: Page) {
  await page.goto('/explore');
  await page
    .getByRole('tree')
    .getByRole('treeitem', { name: 'My workspace', exact: true })
    .getByRole('button')
    .first()
    .click();
  return page.getByTestId('explore-contents').getByTestId(`item-${made.chart}`);
}

/** The folder's titles, as its writer reads them: the chart is not there. */
async function folderTitles(page: Page) {
  const contents = await page.request.get(`/api/folders/${made.folder}/contents`);
  expect(contents.status()).toBe(200);
  return ((await contents.json()) as { title: string }[]).map((item) => item.title);
}

test.describe.configure({ mode: 'serial' });

test.describe('proposing from the workspace, and a rejection’s band (T358, AC-284, AC-290)', () => {
  test.afterAll(async ({ browser }) => {
    for (const who of ['writer', 'super'] as const) {
      const context = await browser.newContext({
        baseURL: BASE_URL,
        storageState: { cookies: [], origins: [] },
      });
      await signInThroughDex(await context.newPage(), who);
      if (who === 'writer') {
        // Withdrawn by its author if a step failed before it was rejected.
        if (made.proposal !== '')
          await context.request.post(`/api/proposals/${made.proposal}/reject`, { data: {} });
        if (made.chart !== '') await context.request.delete(`/api/documents/chart/${made.chart}`);
      }
      if (who === 'super' && made.folder !== '')
        await context.request.delete(`/api/documents/folder/${made.folder}`);
      await context.close();
    }
  });

  test.describe('as super', () => {
    test.use({ role: 'super' });

    test('makes the folder writer may propose into', async ({ page }) => {
      const folder = await page.request.post('/api/documents', {
        data: { kind: 'folder', title: FOLDER, folderId: 'root' },
      });
      made.folder = ((await folder.json()) as { id: string }).id;
      const access = await page.request.put(`/api/folders/${made.folder}/access`, {
        data: { readOnly: [], readWrite: ['sales-rw'] },
      });
      expect(access.status()).toBe(200);
      made.decider = ((await (await page.request.get('/api/me')).json()) as { name: string }).name;
    });
  });

  test.describe('as writer, its author', () => {
    test.use({ role: 'writer' });

    test('proposes it from its row: the dialog names the folder, refuses 1,001 characters, and the folder waits', async ({
      page,
    }) => {
      const chart = await page.request.post('/api/documents', {
        data: { kind: 'chart', title: TITLE, folderId: 'mine', targetFolderId: made.folder },
      });
      expect(chart.status(), await chart.text()).toBe(201);
      made.chart = ((await chart.json()) as { id: string }).id;

      const row = await workspaceRow(page);
      await row.getByRole('button', { name: `Actions for ${TITLE}` }).click();
      // Named for its target (T694; design 04, pin 7).
      await page.getByRole('menuitem', { name: /^Propose to .+…$/ }).click();
      const dialog = page.getByRole('dialog', { name: `Propose to ${FOLDER}` });
      await expect(dialog.getByTestId('propose-item')).toHaveText(
        `Chart · ${TITLE} — new in this folder`,
      );

      // Over the limit: counted, said, and not sent — nor cut.
      const text = dialog.getByLabel('What changed');
      await text.fill('x'.repeat(1001));
      await expect(dialog.getByTestId('propose-counter')).toHaveText('1,001 / 1,000');
      await expect(dialog.getByText('Shorten to 1,000 characters.')).toBeVisible();
      await expect(dialog.getByRole('button', { name: 'Propose', exact: true })).toBeDisabled();
      await expect(text).toHaveValue('x'.repeat(1001));

      await text.fill(DESCRIPTION);
      await dialog.getByRole('button', { name: 'Propose', exact: true }).click();
      await expect(dialog).toHaveCount(0);
      await expect(row.getByRole('cell').nth(1)).toHaveText('Waiting for review');

      // Recorded with its folder, author, time and description.
      const latest = await page.request.get(`/api/proposals?kind=chart&itemId=${made.chart}`);
      expect(latest.status()).toBe(200);
      const proposal = (await latest.json()) as {
        id: string;
        status: string;
        targetFolderId: string;
        description: string;
        proposedAt: string;
        author: { name: string };
      };
      made.proposal = proposal.id;
      expect(proposal.status).toBe('open');
      expect(proposal.targetFolderId).toBe(made.folder);
      expect(proposal.description).toBe(DESCRIPTION);
      expect(Date.now() - Date.parse(proposal.proposedAt)).toBeLessThan(5 * 60_000);
      const me = (await (await page.request.get('/api/me')).json()) as { name: string };
      expect(proposal.author.name).toBe(me.name);
      // The folder shows what it had: nothing yet.
      expect(await folderTitles(page)).not.toContain(TITLE);

      // Its page says it waits, and where to.
      await page.goto(`/explore/charts/${made.chart}`);
      const band = page.getByRole('status', { name: 'Proposal' });
      await expect(band).toContainText(
        new RegExp(`Waiting for review since \\d\\d:\\d\\d · proposed to ${FOLDER}\\.`),
      );
      await expect(band.getByRole('link', { name: 'View proposal' })).toHaveAttribute(
        'href',
        `/reviews?tab=mine&selected=${made.proposal}`,
      );
    });
  });

  test.describe('as super, who decides it', () => {
    test.use({ role: 'super' });

    test('rejects it with a reason', async ({ page }) => {
      const rejected = await page.request.post(`/api/proposals/${made.proposal}/reject`, {
        data: { reason: REASON },
      });
      expect(rejected.status(), await rejected.text()).toBe(200);
      made.proposal = '';
    });
  });

  test.describe('as writer, again', () => {
    test.use({ role: 'writer' });

    test('keeps the chart, is shown who rejected it and why, and dismisses the band for good', async ({
      page,
    }) => {
      const row = await workspaceRow(page);
      await expect(row).toBeVisible();
      await expect(row.getByRole('cell').nth(1)).toHaveText('Rejected');
      expect(await folderTitles(page)).not.toContain(TITLE);

      await page.goto(`/explore/charts/${made.chart}`);
      const band = page.getByRole('status', { name: 'Proposal' });
      // Today's time alone, as the band says when it waited since (design 05, M).
      await expect(band.getByTestId('band-decision')).toHaveText(
        new RegExp(`^Rejected by ${made.decider} · \\d\\d:\\d\\d$`),
      );
      await expect(band.getByRole('blockquote')).toHaveText(REASON);
      await expect(band.getByRole('button', { name: 'Propose again…' })).toBeVisible();

      await band.getByRole('button', { name: 'Dismiss' }).click();
      await expect(band).toHaveCount(0);
      // Asked again on reload, and answered dismissed: no band.
      const asked = page.waitForResponse(
        (response) =>
          response.url().includes(`/api/proposals?kind=chart&itemId=${made.chart}`) &&
          response.status() === 200,
      );
      await page.reload();
      const answer = (await (await asked).json()) as { dismissedAt: string | null };
      expect(answer.dismissedAt).not.toBeNull();
      await expect(page.getByRole('heading', { name: TITLE, level: 1 })).toBeVisible();
      await expect(page.getByRole('status', { name: 'Proposal' })).toHaveCount(0);
    });
  });
});
