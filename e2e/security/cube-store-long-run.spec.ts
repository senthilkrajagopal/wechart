import { landed } from '../model-files';
import { expect, test } from './fixtures';

/**
 * T650's follow-up (AC-378, AC-379; R62, R64): a Cube Store run stopped at
 * 30 seconds, on the image. Cube Store can't stop a query (xcube
 * 2099b13f2d): one its select workers run, under `ClusterSend`, runs on
 * until Cube Store's own timeout ends it, which xcube reports as `endsBy`
 * (research xcube-636ffa04b2.md, "What still runs"). The page says it is
 * still finishing, until when at the latest; it offers no Cancel, and says
 * so; and it holds its user's next run until xcube says it has ended.
 *
 * The run: a rollup of 200,000 rows (`generate.long_run_rows`, made by the
 * security suite's stack preparation), built through the usual build, and
 * summed joined with itself, 1.2 * 10^11 rows, on Cube Store's workers. A
 * join of `VALUES` or of catalog tables is refused before it runs now (T650),
 * so only Cube Store's own tables give such a run.
 *
 * AC-378's case of a router query with no `endsBy` needs a single catalog or
 * system table read without a join lasting past 30 s; compose's Cube Store
 * has no table that large, so it stays shown by the unit and component tests
 * (T549).
 *
 * Its own project, after the three browsers, once (`playwright.security.config.ts`):
 * the run holds `super`'s next SQL run, which the SQL runner's spec runs as,
 * and keeps Cube Store's workers busy, until its timeout. On its own:
 * `--project=cube-store-long-run --no-deps`.
 */
const CUBE = 't650_long_rows';
const PATH = `cubes/${CUBE}.yml`;
const CONTENT = [
  'cubes:',
  `  - name: ${CUBE}`,
  '    sql_table: generate.long_run_rows',
  '    dimensions:',
  '      - name: id',
  '        sql: id',
  '        type: number',
  '        primary_key: true',
  '    measures:',
  '      - name: count',
  '        type: count',
  '    pre_aggregations:',
  '      - name: rows',
  '        dimensions: [CUBE.id]',
  '        measures: [CUBE.count]',
  '',
].join('\n');

test.use({ role: 'super' });

test.describe.configure({ mode: 'serial' });

test.describe('a Cube Store run stopped at 30 seconds (T650’s follow-up, AC-378, AC-379)', () => {
  let table = '';

  test('builds the rollup the run reads', async ({ page }) => {
    test.setTimeout(240_000);
    const { request } = page;
    expect(await landed(request, 'root', [{ path: PATH, content: CONTENT }])).toEqual([
      { path: PATH, content: CONTENT },
    ]);
    const started = await request.post('/api/builds', {
      data: { preAggregation: `${CUBE}.rows` },
      timeout: 90_000,
    });
    expect(started.status(), await started.text()).toBeLessThan(300);
    const { tokens } = (await started.json()) as { tokens: string[] };
    const statusOf = async () =>
      (await (await request.post('/api/builds/status', { data: { tokens } })).json()) as {
        status: string;
        table?: string;
      }[];
    await expect.poll(async () => (await statusOf())[0]?.status, { timeout: 180_000 }).toBe('done');
    table = (await statusOf())[0]?.table ?? '';
    expect(table).toMatch(new RegExp(`^prod_pre_aggregations_\\w+\\.${CUBE}_rows`));
  });

  test('says it is still finishing until when, offers no Cancel, and holds the next run until it has ended', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    expect(table).not.toBe('');
    const on = await page.request.put('/api/cube-store/sql-runner', {
      data: { on: true, readOnlyConfirmed: true },
    });
    expect(on.status(), await on.text()).toBe(200);
    // A sum over every row, which Cube Store can't answer from the counts
    // alone, as it does a count over a join: 1.2 * 10^11 rows. Two of the
    // tables, 4 * 10^10 rows, took 23–29 s on compose (2026-10-08); thrice
    // that runs past the cap and ends within Cube Store's own 120 s.
    const id = `${CUBE}__id`;
    const sql = `SELECT sum(a.${id} + b.${id} + c.${id}) AS n FROM ${table} a CROSS JOIN ${table} b CROSS JOIN ${table} c WHERE c.${id} <= 3`;
    try {
      await page.goto('/explore/data-sources/cubestore');
      const panel = page.getByRole('tabpanel', { name: 'SQL' });
      await panel.locator('.sql-editor .cm-content').click();
      await page.keyboard.insertText(sql);
      await panel.getByRole('button', { name: 'Run', exact: true }).click();
      await expect(panel.getByRole('button', { name: 'Running…' })).toBeDisabled();
      // Nothing to cancel, and said so: Cube Store can't stop it (AC-379, R64).
      await expect(panel.getByRole('button', { name: 'Cancel', exact: true })).toHaveCount(0);
      await expect(panel.getByTestId('sql-no-cancel')).toHaveText(
        'Cube Store can’t stop a query, so there’s no Cancel.',
      );
      // At the cap, as soon as xcube answers: up to about 40 s with Cube
      // Store's workers busy, as observed on compose (2026-10-08).
      await expect(panel.getByTestId('sql-result-head')).toHaveText(
        /^Stopped at 30 seconds at \d\d:\d\d:\d\d$/,
        { timeout: 90_000 },
      );

      // Until when at the latest, as xcube says: Cube Store's timeout ends it (AC-378, R62).
      const going = (await (await page.request.get('/api/sql-runs/going')).json()) as {
        going: { stopping?: boolean; endsBy?: string | null; cubeStore?: boolean } | null;
      };
      expect(going.going).toMatchObject({ cubeStore: true, stopping: true });
      const endsBy = going.going?.endsBy;
      expect(typeof endsBy, JSON.stringify(going)).toBe('string');
      const until = new Date(endsBy!).toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
      await expect(panel.getByTestId('sql-result-note')).toHaveText(
        `The run hadn’t finished after 30 seconds, so wechart stopped waiting for it. Cube Store can’t stop a query, so it is still finishing this one, until ${until} at the latest. Your next run waits until it has ended. Nothing came back. Narrow it with WHERE or LIMIT, or EXPLAIN it to see its plan.`,
      );
      const held = panel.getByTestId('sql-going-elsewhere');
      await expect(held).toHaveText(
        `Cube Store is still finishing your last query, until ${until} at the latest. One run at a time: your next one runs once it has ended.`,
      );
      await expect(panel.getByRole('button', { name: 'Run', exact: true })).toBeDisabled();
      // The API holds it too, nothing run (AC-379).
      const again = await page.request.post('/api/cube-store/sql', { data: { sql: 'SELECT 1' } });
      expect(again.status(), await again.text()).toBe(409);

      // Ended, by itself or by Cube Store's timeout: Run is offered again, by its end at the latest.
      const wait = Math.max(0, new Date(endsBy!).getTime() - Date.now()) + 60_000;
      await expect(held).toHaveCount(0, { timeout: wait });
      await expect(panel.getByRole('button', { name: 'Run', exact: true })).toBeEnabled();
      await panel.locator('.sql-editor .cm-content').click();
      await page.keyboard.press('ControlOrMeta+A');
      await page.keyboard.insertText('SELECT 1 AS one');
      await panel.getByRole('button', { name: 'Run', exact: true }).click();
      await expect(panel.getByTestId('sql-result-head')).toHaveText(/^Finished 1 row/);
    } finally {
      await page.request.put('/api/cube-store/sql-runner', { data: { on: false } });
    }
  });

  test('removes the rollup’s cube again', async ({ page }) => {
    const removed = await page.request.delete(
      `/api/model/files?folder=root&path=${encodeURIComponent(PATH)}`,
      { timeout: 90_000 },
    );
    expect([200, 404], await removed.text()).toContain(removed.status());
  });
});
