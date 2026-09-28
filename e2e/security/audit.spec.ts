import { expect, test } from './fixtures';

/**
 * T369 (AC-295, AC-294; design 08 of 2026-09-27, pins 2–9): the audit trail,
 * a Super-Admin's alone. An access change `super` makes is recorded and
 * listed newest first; filters live in the address and survive a reload; the
 * record opens in the inspector with its groups before and after. `writer`
 * gets Not found for the page and 403 from the API.
 */
const RUN = Math.random().toString(36).slice(2, 8);

test.describe('the audit trail, as a Super-Admin sees it', () => {
  test.use({ role: 'super' });

  test('lists an access change newest first, under four filters that combine and stay in its address, and opens it', async ({
    page,
  }) => {
    const folder = await page.request.post('/api/documents', {
      data: { kind: 'folder', title: `Audited ${RUN}`, folderId: 'root' },
    });
    const folderId = ((await folder.json()) as { id: string }).id;
    try {
      const changed = await page.request.put(`/api/folders/${folderId}/access`, {
        data: { readOnly: ['sales-ro'], readWrite: ['sales-rw'] },
      });
      expect(changed.status()).toBe(200);

      // The four filters chosen on the page, together (pin 2), each kept in
      // the address (pin 1).
      await page.goto('/security/audit');
      const main = page.getByRole('main');
      await expect(
        main
          .getByRole('navigation', { name: 'Security' })
          .getByRole('link', { name: 'Audit trail' }),
      ).toHaveAttribute('aria-current', 'page');
      const table = main.getByRole('table', { name: 'Audit trail' });
      await expect(table).toBeVisible();
      // Newest first, always (pin 9): each row's time no later than the one above it.
      const times = await table
        .locator('tbody time')
        .evaluateAll((all) => all.map((time) => time.getAttribute('datetime') ?? ''));
      expect(times.length).toBeGreaterThan(1);
      expect(times).toEqual(times.toSorted().toReversed());
      await main.getByLabel('User').selectOption({ label: 'super@wechart.test' });
      // The Event picker's kinds only when it's opened.
      const kinds = main.getByRole('checkbox', { name: 'Access change' });
      await expect(kinds).toBeHidden();
      await main.getByRole('button', { name: /^Event/ }).click();
      await kinds.check();
      await page.keyboard.press('Escape');
      await expect(kinds).toBeHidden();
      await main.getByLabel('Folder', { exact: true }).selectOption({ label: `Audited ${RUN}` });
      await main.getByLabel('Time', { exact: true }).selectOption({ label: 'Last 24 hours' });
      await expect(page).toHaveURL(
        new RegExp(`\\?user=[^&]+&event=access-change&folder=${folderId}&time=day$`),
      );
      const chips = main.getByRole('list', { name: 'Active filters' });
      await expect(chips.getByRole('listitem')).toHaveText([
        'User: super@wechart.test',
        'Event: Access change',
        `Folder: Audited ${RUN}`,
        'Time: Last 24 hours',
      ]);

      // Every row matches them: only this folder's access change, by super, today.
      const row = table.getByRole('row').nth(1);
      await expect(table.getByRole('row')).toHaveCount(2);
      await expect(row.getByRole('cell')).toHaveText([
        /^Today \d\d:\d\d:\d\d$/,
        'super@wechart.test',
        'Access change',
        `Audited ${RUN}`,
        `Folder · Audited ${RUN}`,
        /^Set read-write groups here, no longer inherited: sales-rw; set read-only groups here, no longer inherited: sales-ro$/,
      ]);
      await expect(main.getByText('1 record · newest first')).toBeVisible();

      // Kept on reload (AC-002), and linked straight to.
      await page.reload();
      await expect(chips.getByRole('listitem')).toHaveCount(4);
      await expect(table.getByRole('row')).toHaveCount(2);

      // The whole record in the inspector (pin 7).
      await row.getByRole('button').click();
      const inspector = main.getByRole('region', { name: /^Access change/ });
      await expect(inspector).toContainText('Super-Admin');
      await expect(inspector.getByRole('group', { name: 'Read-write groups' })).toContainText(
        'Inherited',
      );
      await expect(inspector).toContainText('Records can’t be edited or deleted here.');

      // The retention said (pin 8).
      await expect(main).toContainText('Records older than 1 year are removed.');
    } finally {
      await page.request.delete(`/api/documents/folder/${folderId}`);
    }
  });
});

test.describe('the audit trail, as a writer sees it', () => {
  test.use({ role: 'writer' });

  test('is Not found, and the API refuses it', async ({ page }) => {
    await page.goto('/security/audit');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Not found');
    expect((await page.request.get('/api/audit')).status()).toBe(403);
  });
});
