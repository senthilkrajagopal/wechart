import { expect, test, type APIRequestContext } from '@playwright/test';
import { refreshLagSeconds } from '@wechart/core';

import { landed, ownCubeFile, ownModelCopy, PUBLISHED } from './model-files';

/**
 * T159, T377 / AC-153: WHEN the user sets a pre-aggregation's refresh
 * schedule in the model editor as a cron expression and time zone, THE SYSTEM
 * SHALL accept only expressions Cube's refresh worker can run, show the next
 * runs Cube's refresh key implies, listed only up to its zone's next
 * daylight-saving change and then followed by a warning …, with a note that a
 * run can start up to about five minutes after its time, and write the
 * schedule into the model as that pre-aggregation's `refresh_key`, validated
 * and published as any model change.
 * `Fails when: a shown run differs from when Cube's refresh key turns over,
 * an expression Cube cannot run is published, the pre-aggregation is not
 * rebuilt within one of Cube's check periods of a shown run; or a run after
 * the zone's next daylight-saving change is listed, or the list stops at the
 * change with no warning.`
 *
 * On the real Cube and its refresh worker, with a cube file of this browser's
 * own: set in Model's pre-aggregation form, published, and then seen rebuilt.
 * A `* * * * *` key turns over each minute, and its own check period is 36 s:
 * 6 s of staleness and the worker's 30 s beat (research/cube/
 * refresh-key-schedule.md, "Refresh worker cadence"; `refreshLagSeconds`).
 * The rebuild is held to that, the AC's bound (T377; T159's review), with
 * slack for the queue and the build, which the research's bound adds.
 *
 * The turn-over is counted from a build under the new key. The build under
 * Cube's default key can land minutes before the publish, while the form is
 * used, and the new key's first build comes whenever the worker next reads it,
 * not at a minute's turn: so it is the build after that one that is timed.
 *
 * The runs the form shows are the browser's clock's: a fixed one (T377), on
 * days before Los Angeles' clocks go back, so the list stops at the change
 * with its warning (design 16's Q3).
 */
const CHECK_PERIOD_MS = (refreshLagSeconds('* * * * *') ?? 0) * 1000;
/** The queue and the build: slack beyond the period. */
const SLACK_MS = 10_000;
/** How long the worker may take to build it under a new key at all: its pass over every rollup. */
const FIRST_BUILD_MS = 330_000;

const cubeText = (cube: string, refreshKey = '') => `cubes:
  - name: ${cube}
    sql_table: public.orders
    dimensions:
      - name: status
        sql: status
        type: string
    measures:
      - name: count
        type: count
    pre_aggregations:
      - name: main
        measures: [CUBE.count]
        dimensions: [CUBE.status]
${refreshKey}`;

/** When Cube last built the rollup that answered, or undefined while none did. */
async function builtAt(request: APIRequestContext, cube: string): Promise<number | undefined> {
  const response = await request.post('/api/load', {
    data: { query: { measures: [`${cube}.count`], dimensions: [`${cube}.status`] } },
  });
  if (!response.ok()) return undefined;
  const used = (
    (await response.json()) as { usedPreAggregations?: Record<string, { lastUpdatedAt?: number }> }
  ).usedPreAggregations;
  const at = Object.values(used ?? {})[0]?.lastUpdatedAt;
  return typeof at === 'number' ? at : undefined;
}

test('a refresh schedule set in Model shows its next runs, is published, and Cube rebuilds on it', async ({
  page,
  request,
  browserName,
}) => {
  // Three builds, each up to a busy worker's pass apart: more than the default.
  test.setTimeout(1_200_000);
  const cube = `schedule_${browserName}`;
  const path = await ownCubeFile(request, cube, cubeText(cube));
  const firstBuilt = { timeout: FIRST_BUILD_MS + SLACK_MS, intervals: [2_000] };
  /** Waits for a build newer than `after`, and returns when Cube made it. */
  async function builtAfter(after: number): Promise<number> {
    let at: number | undefined;
    await expect
      .poll(async () => (at = await builtAt(request, cube)) !== undefined && at > after, firstBuilt)
      .toBe(true);
    return at ?? 0;
  }
  const copy = await ownModelCopy(request, path);
  try {
    // Built under Cube's default key before the schedule is set.
    const defaultBuild = await builtAfter(0);

    // The pre-aggregation in Model, as Schedules links to it (T160), on a
    // fixed clock: Thu 29 Oct 2026, three days before Los Angeles falls back.
    // In the single user's copy in My workspace, where a shared model is
    // changed with sign-in off now (T451's switch; AC-254, R52).
    await page.clock.setFixedTime(new Date('2026-10-29T12:00:00Z'));
    await page.goto(`${copy.href}?cube=${cube}&tab=pre_aggregations`);
    const form = page.getByRole('region', { name: `Cube ${cube}` });
    await form.getByText('main', { exact: true }).click();
    const schedule = form.getByLabel('Refresh key');

    // A cron and its zone: the next runs, each at its time there, up to the
    // zone's change and then why no more, and how late one may start.
    await schedule.fill('0 8 * * *');
    await schedule.press('Tab');
    await form.getByLabel('Time zone').selectOption('America/Los_Angeles');
    const runs = form.getByRole('list', { name: 'Next refreshes' }).getByRole('listitem');
    await expect(runs).toHaveCount(3);
    for (const run of await runs.all()) await expect(run).toContainText('08:00');
    await expect(form.getByTestId('refresh-clock-change')).toHaveText(
      'The clocks go back on Sun 1 Nov. Cube may run this key an hour off after that, until it next compiles the model, so later runs aren’t listed.',
    );
    await expect(form).toContainText('can start up to about 5½ minutes after its time');

    // What Cube can't run is said, and shows no runs.
    await schedule.fill('55 7 * * 1-5');
    await expect(form.getByRole('alert')).toContainText('can’t run "55 7 * * 1-5"');
    await expect(form.getByRole('list', { name: 'Next refreshes' })).toHaveCount(0);

    // Every minute, published through the model's own path: saved in the
    // copy, proposed, and approved by the single user, which lands it.
    await schedule.fill('* * * * *');
    await schedule.press('Tab');
    await expect(
      form.getByRole('list', { name: 'Next refreshes' }).getByRole('listitem'),
    ).toHaveCount(5);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Saved' })).toHaveText(
      'Saved. Previews in My workspace use it now.',
      PUBLISHED,
    );
    await copy.land();
    const { files } = (await (await request.get('/api/model/files')).json()) as {
      files: { path: string; content: string }[];
    };
    expect(files.find((file) => file.path === path)?.content).toMatch(
      /every: ["']\* \* \* \* \*["']/,
    );

    // Cube's worker builds it under the new key, then rebuilds it at a minute's
    // turn, within the key's own check period of that run.
    const first = await builtAfter(defaultBuild);
    const next = await builtAfter(first);
    const turnOver = Math.ceil((first + 1) / 60_000) * 60_000;
    expect(next).toBeGreaterThanOrEqual(turnOver);
    expect(next).toBeLessThanOrEqual(turnOver + CHECK_PERIOD_MS + SLACK_MS);
  } finally {
    // The copy taken out of My workspace, and the root's file back to Cube's
    // hourly default, so the worker stops rebuilding it each minute.
    await copy.drop();
    await landed(request, 'root', [{ path, content: cubeText(cube) }]);
  }
});
