import { expect, test } from '@playwright/test';

import { modelFilesIn, ownCubeFile, PUBLISHED } from './model-files';

/**
 * T160, T551 / AC-154: THE SYSTEM SHALL list every pre-aggregation's refresh
 * schedule in Schedules, those of cubes marked `public: false` included, …;
 * label each with its owner … as an icon and a label; show each schedule in
 * words and as written, with its zone, its next run …, and its last run …;
 * show Cube-owned schedules read-only there with a link opening the
 * pre-aggregation in the model editor, and say when one is not scheduled.
 * `Fails when: a refresh_key schedule is editable on the Schedules page, is
 * unlabelled, or its link does not open the model editor; a pre-aggregation
 * of a cube marked public: false is missing; …`
 *
 * On the real Cube, through xcube's admin meta with hidden=true (research
 * xcube-jobs-schedules-routes.md §2), with cube files of this browser's own:
 * a cron in its zone, a rollup Cube never refreshes, and a cube that isn't
 * public.
 */
test('Schedules lists each refresh schedule as Cube’s, a hidden cube’s too, read-only, and opens the pre-aggregation in Model', async ({
  page,
  request,
  browserName,
}) => {
  const cube = `schedules_${browserName}`;
  const hidden = `schedules_hidden_${browserName}`;
  await ownCubeFile(
    request,
    cube,
    `cubes:
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
      - name: mornings
        measures: [CUBE.count]
        dimensions: [CUBE.status]
        refresh_key:
          every: "0 8 * * *"
          timezone: America/Los_Angeles
      - name: on_demand
        measures: [CUBE.count]
        scheduled_refresh: false
`,
  );
  const hiddenPath = await ownCubeFile(
    request,
    hidden,
    `cubes:
  - name: ${hidden}
    sql_table: public.orders
    public: false
    measures:
      - name: count
        type: count
    pre_aggregations:
      - name: main
        measures: [CUBE.count]
        scheduled_refresh: false
        refresh_key:
          every: 1 day
`,
  );

  await page.goto('/schedules');
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { level: 1 })).toHaveText('Schedules');
  const table = main.getByRole('table', { name: 'Refresh schedules' });
  const mornings = table.getByRole('row').filter({ hasText: `${cube}.mornings` });
  // In words and as written, with its zone: as written on a line of its own (T551's review).
  await expect(mornings).toContainText('Daily at 08:00, Los Angeles', PUBLISHED);
  const written = mornings.getByText('every: "0 8 * * *" · timezone: America/Los_Angeles');
  const words = mornings.getByText('Daily at 08:00, Los Angeles');
  const below = async () =>
    ((await written.boundingBox())?.y ?? 0) >=
    ((await words.boundingBox())?.y ?? 0) + ((await words.boundingBox())?.height ?? 0) - 1;
  expect(await below()).toBe(true);
  // Labelled with its owner, as an icon and a label.
  const owner = mornings.getByTestId('owner');
  await expect(owner).toHaveText('Cube’s refresh worker');
  await expect(owner.locator('svg[data-icon="cube"]')).toHaveCount(1);
  // Its next run, with UTC; its pane's five, a grid of day, time and UTC.
  await expect(mornings.getByRole('cell').nth(3)).toContainText(/\d{2}:\d{2} UTC · in /);
  await mornings.click();
  const runs = page
    .getByRole('complementary', { name: 'Schedule details' })
    .getByRole('list', { name: 'Next runs' });
  await expect(runs).toHaveCSS('display', 'grid');
  await expect(runs).toHaveCSS('list-style-type', 'none');
  // One Cube never refreshes says so, with its icon.
  const onDemand = table.getByRole('row').filter({ hasText: `${cube}.on_demand` });
  await expect(onDemand).toContainText('Not scheduled');
  await expect(onDemand.locator('svg[data-icon="off"]')).toHaveCount(1);
  // The seed rollup, with its interval.
  await expect(
    table.getByRole('row').filter({ hasText: 'monthly_orders.by_status_month' }),
  ).toContainText('Every hour');
  // A cube marked public: false: listed all the same.
  const hiddenRow = table.getByRole('row').filter({ hasText: `${hidden}.main` });
  await expect(hiddenRow).toContainText('Not scheduled', PUBLISHED);

  // Read-only: nothing on the page edits a schedule.
  await expect(main.locator('input, select, textarea, [role="switch"]')).toHaveCount(0);
  await expect(table.getByRole('button')).toHaveCount(0);

  // Its pane opens the pre-aggregation itself in the model editor: its file,
  // on its cube's Pre-aggregations tab, with this one open (T160's review).
  await hiddenRow.click();
  const pane = page.getByRole('complementary', { name: 'Schedule details' });
  await expect(pane.getByTestId('schedule-written')).toHaveText('scheduled_refresh: false');
  // Jobs reads only what queries reach, so it isn't there: said, not linked (T551's review).
  await expect(pane.getByRole('link', { name: 'Open in Jobs' })).toHaveCount(0);
  await expect(pane.getByTestId('schedule-not-in-jobs')).toHaveText(
    'Its cube isn’t public, so Jobs doesn’t list it.',
  );
  await pane.getByRole('link', { name: 'Open in Model' }).click();
  await expect(page).toHaveURL(
    new RegExp(
      `/model/files/${encodeURIComponent(hiddenPath)}\\?cube=${hidden}&tab=pre_aggregations&member=main$`,
    ),
  );
  const form = page.getByRole('region', { name: `Cube ${hidden}` });
  await expect(form.getByRole('tab', { name: /^Pre-aggs/ })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(
    form
      .locator('details.model-member')
      .filter({ has: page.locator('summary', { hasText: 'main' }) }),
  ).toHaveAttribute('open', '');
});

/**
 * T552 / AC-234: WHEN the user creates a schedule for a pre-aggregation
 * build, THE SYSTEM SHALL accept a five-field cron expression and a time
 * zone, …, read the cron back in words, show the next five runs …, and start
 * each run at its time through Cube's jobs API, building every partition of
 * the pre-aggregation. `Fails when: … a due run does not start; …`
 *
 * Made on the page, `* * * * *` in UTC, on a rollup of this browser's own
 * that Cube's refresh worker never builds: within its minute wechart's
 * scheduler starts its build against compose's Cube, and Run history lists
 * it as started by the schedule, followed to Done. Schedules then lists the
 * rollup's two schedules, the last run Done (AC-154); the schedule is
 * changed and deleted in its pane. The form says a rollup's refresh key
 * runs too, where Cube runs one; and making, changing and deleting leave the
 * model's file as published (AC-392).
 */
test('a schedule made on the page starts its build within its minute, and Run history lists it as started by the schedule', async ({
  page,
  request,
  browserName,
}) => {
  test.setTimeout(240_000);
  const cube = `scheduled_${browserName}`;
  const rollup = `${cube}.main`;
  // This run's alone: Run history keeps an earlier run's builds of this rollup.
  const name = `Every minute ${browserName} ${String(Date.now())}`;
  const content = `cubes:
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
        scheduled_refresh: false
      - name: nightly
        measures: [CUBE.count]
        refresh_key:
          every: "0 3 * * *"
`;
  const path = await ownCubeFile(request, cube, content);
  /** The rollup's model file, as stored: what no schedule changes (AC-392). */
  const stored = async () =>
    (await modelFilesIn(request, 'root')).find((file) => file.path === path)?.content;
  try {
    // Once Jobs lists the rollups, published: the form reads them once (T552's review).
    await expect
      .poll(
        async () =>
          ((await (await request.get('/api/preaggregations')).json()) as { id: string }[]).some(
            (each) => each.id === rollup,
          ),
        PUBLISHED,
      )
      .toBe(true);
    await page.goto('/schedules');
    await page.getByRole('button', { name: 'New schedule' }).click();
    const pane = page.getByRole('complementary', { name: 'Schedule details' });
    const picker = pane.getByRole('combobox', { name: 'Pre-aggregation' });
    // A rollup whose refresh key Cube's refresh worker runs: it runs too, and both run (AC-392).
    await picker.selectOption(`${cube}.nightly`);
    await expect(pane.getByTestId('refresh-key-runs')).toContainText(
      `Its refresh key also runs: Cube’s refresh worker rebuilds ${cube}.nightly`,
    );
    await expect(pane).not.toContainText('scheduled_refresh');
    // One Cube's refresh worker never runs: nothing to say.
    await picker.selectOption(rollup);
    await expect(pane.getByTestId('refresh-key-runs')).toHaveCount(0);
    await pane.getByRole('textbox', { name: /^Name/ }).fill(name);
    await pane.getByRole('textbox', { name: 'Cron expression' }).fill('* * * * *');
    await pane.getByRole('combobox', { name: 'Time zone' }).fill('UTC');
    // Read back in words, with its next five runs.
    await expect(pane.getByText('Every minute.', { exact: true })).toBeVisible();
    await expect(pane.getByRole('list', { name: 'Next runs' }).getByRole('listitem')).toHaveCount(
      5,
    );
    await pane.getByRole('button', { name: 'Create schedule' }).click();

    // Made at once: its pane, and its row beside the rollup's refresh key.
    await expect(pane.getByRole('heading', { level: 2 })).toHaveText(name);
    const row = page
      .getByRole('table', { name: 'Refresh schedules' })
      .getByRole('row')
      .filter({ hasText: name });
    await expect(row).toContainText(rollup);
    await expect(row.getByTestId('owner')).toHaveText('wechart');
    // Nothing of the model changed: its file, refresh key and all, as published (AC-392).
    expect(await stored()).toBe(content);

    // Within its minute, a build of every partition, started by the schedule.
    await page.goto(`/jobs?tab=history&preagg=${encodeURIComponent(rollup)}`);
    const built = page
      .getByTestId(/^build-row-/)
      .filter({ has: page.getByTestId('starter').filter({ hasText: name }) })
      .first();
    await expect(built).toBeVisible({ timeout: 100_000 });
    await expect(built.getByTestId('build-outcome')).toHaveText('Done', { timeout: 60_000 });

    // Back on Schedules: the rollup's two rows, Cube's and wechart's, the last run Done (AC-154).
    await page.goto('/schedules');
    const rows = page
      .getByRole('table', { name: 'Refresh schedules' })
      .getByRole('row')
      .filter({ hasText: rollup });
    await expect(rows).toHaveCount(2);
    const own = rows.filter({ hasText: name });
    await expect(own.getByTestId('last-run')).toHaveText('Done');

    // Changed in its pane, at once, with no proposal; the model as it was.
    await own.click();
    const opened = page.getByRole('complementary', { name: 'Schedule details' });
    const cron = opened.getByRole('textbox', { name: 'Cron expression' });
    await cron.fill('0 5 * * *');
    await expect(opened.getByText('At 05:00 every day.', { exact: true })).toBeVisible();
    await opened.getByRole('button', { name: 'Save changes' }).click();
    await expect(own).toContainText('0 5 * * * · UTC');
    expect(await stored()).toBe(content);

    // Deleted, asked first; its row gone, the model as it was.
    await opened.getByRole('button', { name: 'Delete…' }).click();
    const dialog = page.getByRole('alertdialog', { name: `Delete “${name}”?` });
    await expect(dialog.getByRole('paragraph').last()).toHaveText('You can’t undo this.');
    await dialog.getByRole('button', { name: 'Delete schedule' }).click();
    await expect(own).toHaveCount(0);
    await expect(rows).toHaveCount(1);
    expect(await stored()).toBe(content);
  } finally {
    // It runs no more: every schedule of this name, this browser's, deleted.
    const listed = await request.get('/api/wechart-schedules');
    for (const each of (await listed.json()) as { id: string; name: string }[])
      if (each.name === name) await request.delete(`/api/wechart-schedules/${each.id}`);
  }
});

/**
 * T379 / AC-155: IF a wechart-owned schedule's runs fail as many times in a
 * row as that schedule sets, THEN THE SYSTEM SHALL suspend the schedule, …
 * say so on its row and in its pane, and offer Resume (design 16, E4).
 *
 * A `* * * * *` schedule in UTC that suspends after 1, on a rollup the model
 * then no longer has: Cube refuses its next run, and it is suspended, with
 * Cube's words. Resume starts it again, from its next time. Deleted after.
 */
test('a schedule whose pre-aggregation the model no longer has is suspended after its failed runs, and Resume starts it again', async ({
  page,
  request,
  browserName,
}) => {
  test.setTimeout(240_000);
  const cube = `suspended_${browserName}`;
  const rollup = `${cube}.main`;
  const name = `Suspends ${browserName} ${String(Date.now())}`;
  const measures = `    measures:
      - name: count
        type: count
`;
  const withRollup = `cubes:
  - name: ${cube}
    sql_table: public.orders
${measures}    pre_aggregations:
      - name: main
        measures: [CUBE.count]
        scheduled_refresh: false
`;
  await ownCubeFile(request, cube, withRollup);
  /** Once Jobs lists the rollup, or doesn't, as the model now has it. */
  const listed = (has: boolean) =>
    expect
      .poll(
        async () =>
          ((await (await request.get('/api/preaggregations')).json()) as { id: string }[]).some(
            (each) => each.id === rollup,
          ),
        PUBLISHED,
      )
      .toBe(has);
  let id: string | undefined;
  try {
    await listed(true);
    const made = await request.post('/api/wechart-schedules', {
      data: { preAggregation: rollup, name, cron: '* * * * *', timezone: 'UTC', suspendAfter: 1 },
    });
    expect(made.status(), await made.text()).toBe(201);
    id = ((await made.json()) as { id: string }).id;
    // The model no longer has the rollup.
    await ownCubeFile(
      request,
      cube,
      `cubes:\n  - name: ${cube}\n    sql_table: public.orders\n${measures}`,
    );

    // Within its minute, Cube refuses the run, and at 1 in a row it is suspended (pin 7).
    await page.goto('/schedules');
    const row = page
      .getByRole('table', { name: 'Refresh schedules' })
      .getByRole('row')
      .filter({ hasText: name });
    await expect(async () => {
      await page.reload();
      await expect(row.getByTestId('schedule-state')).toHaveText('Suspended after 1 failure', {
        timeout: 2_000,
      });
    }).toPass({ timeout: 120_000 });

    // Its pane: suspended, Cube's words, what to do, and Resume (E1, E4).
    await row.click();
    const pane = page.getByRole('complementary', { name: 'Schedule details' });
    await expect(pane.getByTestId('suspended-note')).toContainText(
      'Suspended after 1 failed run in a row,',
    );
    await expect(pane.getByTestId('last-error')).toHaveText(
      "A user's selector doesn't match any of the pre-aggregations defined in the data model.",
    );
    await expect(pane.getByTestId('not-in-model')).toBeVisible();
    const resume = pane.getByRole('button', { name: 'Resume' });
    await expect(resume).toBeFocused();
    // Its failed run, newest first: a run before the model changed may follow it.
    const failed = pane.getByRole('table', { name: 'The failed runs' }).getByRole('row').first();
    await expect(failed).toContainText('Failed');
    await expect(failed).toContainText('1 of 1');

    // The rollup back in the model, then resumed: active again, its count at 0,
    // and its next run builds (E4's "resume it once the pre-aggregation is back").
    await ownCubeFile(request, cube, withRollup);
    await listed(true);
    await resume.click();
    await expect(pane.getByRole('status')).toContainText(`Resumed “${name}”.`);
    await expect(pane.getByTestId('schedule-state')).toHaveText('Active');
  } finally {
    if (id !== undefined) await request.delete(`/api/wechart-schedules/${id}`);
  }
});

/**
 * T555 / AC-395 (design 16, P2): WHEN the user chooses Run now on a wechart
 * schedule, THE SYSTEM SHALL start the schedule's build at once through
 * Cube's jobs API, recorded in Run history as started by Run now on that
 * schedule, by that user, and leave the schedule's times unchanged.
 *
 * A daily schedule on a rollup of this browser's own that Cube's refresh
 * worker never builds: Run now in its pane starts its build against
 * compose's Cube, Run history lists it as Run now on the schedule, by admin,
 * followed to Done, and the schedule's next runs are as they were.
 */
test('Run now starts a schedule’s build at once, Run history names the schedule and who chose it, and its times stay', async ({
  page,
  request,
  browserName,
}) => {
  test.setTimeout(180_000);
  const cube = `run_now_${browserName}`;
  const rollup = `${cube}.main`;
  const name = `Daily ${browserName} ${String(Date.now())}`;
  await ownCubeFile(
    request,
    cube,
    `cubes:
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
        scheduled_refresh: false
`,
  );
  let id: string | undefined;
  try {
    await expect
      .poll(
        async () =>
          (
            await request.post('/api/wechart-schedules', {
              data: { preAggregation: rollup, name, cron: '0 4 * * *', timezone: 'UTC' },
            })
          ).status(),
        PUBLISHED,
      )
      .toBe(201);
    const made = (
      (await (await request.get('/api/wechart-schedules')).json()) as {
        id: string;
        name: string;
        runs: string[];
      }[]
    ).find((each) => each.name === name)!;
    id = made.id;

    await page.goto('/schedules');
    await page
      .getByRole('table', { name: 'Refresh schedules' })
      .getByRole('row')
      .filter({ hasText: name })
      .click();
    const pane = page.getByRole('complementary', { name: 'Schedule details' });
    await pane.getByRole('button', { name: 'Run now' }).click();
    await expect(pane.getByTestId('ran-now')).toHaveText(
      `Started “${name}” now. Run history lists it.`,
    );

    // Run history: Run now on the schedule, by admin, followed to Done.
    await page.goto(`/jobs?tab=history&preagg=${encodeURIComponent(rollup)}`);
    const built = page.getByTestId(/^build-row-/).filter({
      has: page.getByTestId('starter').filter({ hasText: `Run now · ${name}, by admin` }),
    });
    await expect(built).toHaveCount(1, { timeout: 30_000 });
    await expect(built.getByTestId('build-outcome')).toHaveText('Done', { timeout: 60_000 });

    // Its times as they were.
    const after = (
      (await (await request.get('/api/wechart-schedules')).json()) as {
        id: string;
        runs: string[];
      }[]
    ).find((each) => each.id === id);
    expect(after?.runs).toEqual(made.runs);
  } finally {
    if (id !== undefined) await request.delete(`/api/wechart-schedules/${id}`);
  }
});
