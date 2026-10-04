import { landed } from '../model-files';
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

/**
 * T505 (AC-294; design 16, state I): a build started from Jobs and a wechart
 * schedule made and deleted are recorded with who, what, the folder and
 * when, each its own kind with its icon, and the Event filter finds them.
 */
test.describe('builds and schedule changes in the trail', () => {
  test.use({ role: 'super' });

  test('records Build now and a schedule made and deleted, and opens what the schedule was made with', async ({
    page,
  }) => {
    // A model landed and read by Cube, then a build: longer than a page's test.
    test.setTimeout(180_000);
    const cube = `audited_${RUN}`;
    const made = await page.request.post('/api/documents', {
      data: { kind: 'folder', title: `Built ${RUN}`, folderId: 'root' },
    });
    expect(made.status()).toBe(201);
    const folderId = ((await made.json()) as { id: string }).id;
    try {
      // A rollup that isn't partitioned, through a proposal `super` approves (T451).
      const file = {
        path: `cubes/${cube}.yml`,
        content: [
          'cubes:',
          `  - name: ${cube}`,
          '    sql_table: public.orders',
          '    measures:',
          '      - name: count',
          '        type: count',
          '    dimensions:',
          '      - name: status',
          '        sql: status',
          '        type: string',
          '    pre_aggregations:',
          '      - name: main',
          '        measures: [count]',
          '        dimensions: [status]',
          '',
        ].join('\n'),
      };
      expect(await landed(page.request, folderId, [file])).toEqual([file]);
      const preAggregation = `f${folderId.replaceAll('-', '')}__${cube}.main`;
      // Build now, once Cube serves the model it landed in.
      await expect
        .poll(
          async () =>
            (await page.request.post('/api/builds', { data: { preAggregation } })).status(),
          {
            timeout: 60_000,
          },
        )
        .toBe(200);
      const schedule = await page.request.post('/api/wechart-schedules', {
        data: { name: `Nightly ${RUN}`, preAggregation, cron: '0 5 * * *', timezone: 'UTC' },
      });
      expect(schedule.status(), await schedule.text()).toBe(201);
      const scheduleId = ((await schedule.json()) as { id: string }).id;
      expect((await page.request.delete(`/api/wechart-schedules/${scheduleId}`)).status()).toBe(
        204,
      );

      await page.goto(`/security/audit?folder=${folderId}`);
      const main = page.getByRole('main');
      await main.getByRole('button', { name: /^Event/ }).click();
      for (const kind of ['Build started', 'Build cancelled', 'Schedule change'])
        await main.getByRole('checkbox', { name: kind }).check();
      await page.keyboard.press('Escape');
      await expect(page).toHaveURL(
        new RegExp(
          `\\?event=build-started%2Cbuild-cancelled%2Cschedule-change&folder=${folderId}$`,
        ),
      );
      await expect(main.getByRole('list', { name: 'Active filters' })).toContainText(
        'Event: Build started, Build cancelled, Schedule change',
      );
      const table = main.getByRole('table', { name: 'Audit trail' });
      // Newest first: the schedule deleted, made, then the build.
      const rows = table.getByRole('row');
      await expect(rows).toHaveCount(4);
      const expected = [
        ['Schedule change', `Schedule · Nightly ${RUN}`, 'Deleted'],
        ['Schedule change', `Schedule · Nightly ${RUN}`, 'Made · 0 5 * * *'],
        ['Build started', `Pre-aggregation · ${cube}.main`, 'Build now · whole'],
      ];
      for (const [at, [kind, item, summary]] of expected.entries())
        await expect(rows.nth(at + 1).getByRole('cell')).toHaveText([
          /^Today \d\d:\d\d:\d\d$/,
          'super@wechart.test',
          kind!,
          `Built ${RUN}`,
          item!,
          summary!,
        ]);
      // Each kind with its icon beside its label (rule 3).
      for (const at of [1, 3])
        await expect(rows.nth(at).getByRole('cell').nth(2).locator('svg path')).toHaveCount(1);

      // What it was made with, in the inspector (I1).
      await rows.nth(2).getByRole('button', { name: 'Made · 0 5 * * *' }).click();
      const inspector = main.getByRole('region', { name: /^Schedule change · Made/ });
      await expect(inspector.getByRole('definition').nth(1)).toHaveText(`Nightly ${RUN} · wechart`);
      await expect(inspector.getByRole('definition').nth(2)).toHaveText(`${cube}.main`);
      await expect(
        inspector
          .getByRole('table', { name: 'What changed' })
          .getByRole('row')
          .nth(3)
          .getByRole('cell'),
      ).toHaveText(['Cron', '—', '0 5 * * *']);
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
