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

  // Read-only: nothing on the page edits a refresh key's schedule. The only
  // controls are wechart schedules' own On switches (T556), on their rows,
  // and the list's filters, Folder (T559), Search (T610) and State (T558,
  // R66), which edit none.
  const cubeRows = table
    .getByRole('row')
    .filter({ has: page.getByTestId('owner').filter({ hasText: 'Cube’s refresh worker' }) });
  await expect(cubeRows.first()).toBeVisible();
  await expect(cubeRows.locator('input, select, textarea, button, [role="switch"]')).toHaveCount(0);
  await expect(
    main.locator(':is(input:not([role="switch"]), select, textarea):not(.schedules__filters *)'),
  ).toHaveCount(0);
  await expect(main.locator('.schedules__filters').locator('input, select, textarea')).toHaveCount(
    4,
  );
  await expect(main.getByRole('combobox', { name: 'Folder' })).toHaveCount(1);
  await expect(main.getByRole('checkbox', { name: 'Include subfolders' })).toHaveCount(1);
  await expect(main.getByRole('searchbox', { name: 'Search schedules' })).toHaveCount(1);
  await expect(main.getByRole('combobox', { name: 'State' })).toHaveCount(1);
  // Search as tall as the pills beside it, as Pre-aggregations' (T610's review).
  const pillOf = (name: string) =>
    main.locator('.select-pill').filter({ has: page.getByRole('combobox', { name }) });
  const heights = await Promise.all(
    [
      main.getByRole('searchbox', { name: 'Search schedules' }),
      pillOf('Folder'),
      pillOf('State'),
    ].map(async (control) => (await control.boundingBox())?.height),
  );
  expect(new Set(heights).size, JSON.stringify(heights)).toBe(1);
  const switches = await main
    .getByRole('switch')
    .evaluateAll((all) =>
      all.map((each) => [
        each.getAttribute('aria-label')?.startsWith('On: ') ?? false,
        each.closest('tr')?.querySelector('[data-testid="owner"]')?.textContent ?? '',
      ]),
    );
  expect(switches.filter(([on, owner]) => on !== true || owner !== 'wechart')).toEqual([]);
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
      // Sign-in off: the one user is "you" (design 16, G7; T610).
      has: page.getByTestId('starter').filter({ hasText: `Run now · ${name}, by you` }),
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

/**
 * T556 / AC-396 (design 16, P3): WHEN the user pauses a wechart schedule,
 * THE SYSTEM SHALL start none of its runs until it is resumed, and show it
 * as paused, with who paused it, as an icon and a label. Once resumed, its
 * next run SHALL be its first time after the resume.
 *
 * A `* * * * *` schedule in UTC on a rollup of this browser's own, paused
 * from its row's On switch: it reads "Paused · by admin" with the idle icon,
 * and across a minute that falls while paused it starts nothing. Resumed
 * from its pane's switch, its next run starts at its first minute after the
 * resume, not at once for the minute that fell while it was paused.
 */
test('a paused schedule starts no run, says who paused it, and resumed, runs from its next time', async ({
  page,
  request,
  browserName,
}) => {
  test.setTimeout(300_000);
  const cube = `paused_${browserName}`;
  const rollup = `${cube}.main`;
  const name = `Paused ${browserName} ${String(Date.now())}`;
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
  /** Its runs, as Run history lists them. */
  const runs = async () =>
    (
      (await (
        await request.get(
          `/api/jobs/builds?${new URLSearchParams({ starter: `schedule:${id ?? ''}`, within: 'all' }).toString()}`,
        )
      ).json()) as { records: { startedAt: string }[] }
    ).records;
  try {
    // Made early in a minute, so the pause comes well before its next one.
    const second = new Date().getUTCSeconds();
    if (second > 20) await page.waitForTimeout((62 - second) * 1000);
    await expect
      .poll(
        async () =>
          (
            await request.post('/api/wechart-schedules', {
              data: { preAggregation: rollup, name, cron: '* * * * *', timezone: 'UTC' },
            })
          ).status(),
        PUBLISHED,
      )
      .toBe(201);
    id = (
      (await (await request.get('/api/wechart-schedules')).json()) as { id: string; name: string }[]
    ).find((each) => each.name === name)!.id;

    // Paused from its row's switch, before its next minute.
    await page.goto('/schedules');
    const row = page
      .getByRole('table', { name: 'Refresh schedules' })
      .getByRole('row')
      .filter({ hasText: name });
    await row.getByRole('switch', { name: `On: ${name}` }).uncheck();
    const state = row.getByTestId('schedule-state');
    await expect(state).toHaveText('Paused · by admin');
    const pausedAt = Date.now();
    await expect(state).toHaveAttribute('data-state', 'paused');
    await expect(state.locator('svg[data-icon="idle"]')).toHaveCount(1);
    // The switch on its row opens no pane.
    await expect(page.getByRole('complementary', { name: 'Schedule details' })).toHaveCount(0);
    // Paused before its first minute came: not one run of it.
    expect(new Date(pausedAt).getUTCSeconds()).toBeLessThan(55);

    // A whole minute falls while it is paused, and more: no run.
    await page.waitForTimeout(Math.max(0, pausedAt + 75_000 - Date.now()));
    expect(await runs()).toEqual([]);

    // Resumed from its pane, early in a minute.
    await row.click();
    const pane = page.getByRole('complementary', { name: 'Schedule details' });
    await expect(pane.getByTestId('schedule-state')).toHaveText('Paused · by admin');
    const now = new Date().getUTCSeconds();
    if (now > 40) await page.waitForTimeout((62 - now) * 1000);
    await pane.getByRole('switch', { name: `On: ${name}` }).check();
    await expect(pane.getByTestId('schedule-state')).toHaveText('Active');
    const resumedAt = Date.now();
    // Its next run: its first minute after the resume, never the one that fell while paused.
    const nextMinute = Math.ceil(resumedAt / 60_000) * 60_000;
    await expect.poll(async () => (await runs()).length, { timeout: 120_000 }).toBeGreaterThan(0);
    const started = (await runs()).map((each) => Date.parse(each.startedAt));
    expect(started.filter((at) => at < nextMinute)).toEqual([]);
  } finally {
    if (id !== undefined) await request.delete(`/api/wechart-schedules/${id}`);
  }
});

/**
 * T557 / AC-397 (design 16, P4, keeping design 07's filter): THE SYSTEM
 * SHALL offer on Schedules an owner filter, All, Cube's refresh worker or
 * wechart, each with the count of the schedules it lists in the folders the
 * user sees there.
 *
 * With a wechart schedule of this browser's own beside compose's refresh
 * keys: each choice lists as many rows as its count says, and only its own
 * owner's; All's count is the other two's.
 */
test('the owner filter counts each owner’s schedules, and each choice lists only that owner’s', async ({
  page,
  request,
  browserName,
}) => {
  test.setTimeout(180_000);
  const cube = `owners_${browserName}`;
  const rollup = `${cube}.main`;
  const name = `Owners ${browserName} ${String(Date.now())}`;
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
    id = (
      (await (await request.get('/api/wechart-schedules')).json()) as { id: string; name: string }[]
    ).find((each) => each.name === name)!.id;

    await page.goto('/schedules');
    const table = page.getByRole('table', { name: 'Refresh schedules' });
    await expect(table.getByRole('row').filter({ hasText: name })).toHaveCount(1);
    const filter = page.getByRole('radiogroup', { name: 'Owner' });
    /** A choice, chosen, and its count. */
    const choose = async (label: string) => {
      const radio = filter.getByRole('radio', { name: new RegExp(`^${label}`) });
      await radio.click();
      await expect(radio).toHaveAttribute('aria-checked', 'true');
      return Number(/(\d+)$/.exec((await radio.innerText()).trim())?.[1]);
    };
    /** Each listed row's owner, from its Owner cell. */
    const owners = () => table.locator('tbody tr td:last-child').allInnerTexts();

    // All's count is the other two's, read at once: the file's other tests
    // make and delete schedules meanwhile (T557's review).
    const all = await choose('All');
    expect(await owners()).toHaveLength(all);
    const counts = (await filter.getByRole('radio').allInnerTexts()).map((each) =>
      Number(/(\d+)$/.exec(each.trim())?.[1]),
    );
    expect(counts[0]).toBe((counts[1] ?? NaN) + (counts[2] ?? NaN));

    const cubes = await choose('Cube’s refresh worker');
    const cubeRows = await owners();
    expect(cubeRows).toHaveLength(cubes);
    expect(cubes).toBeGreaterThan(0);
    expect(cubeRows.filter((owner) => owner.trim() !== 'Cube’s refresh worker')).toEqual([]);

    const wecharts = await choose('wechart');
    const wechartRows = await owners();
    expect(wechartRows).toHaveLength(wecharts);
    expect(wecharts).toBeGreaterThan(0);
    expect(wechartRows.filter((owner) => !owner.startsWith('wechart'))).toEqual([]);
    await expect(table.getByRole('row').filter({ hasText: name })).toHaveCount(1);

    // And still, with wechart chosen: All's count is the other two's.
    const [allNow, cubesNow, wechartsNow] = (await filter.getByRole('radio').allInnerTexts()).map(
      (each) => Number(/(\d+)$/.exec(each.trim())?.[1]),
    );
    expect(allNow).toBe((cubesNow ?? NaN) + (wechartsNow ?? NaN));
  } finally {
    if (id !== undefined) await request.delete(`/api/wechart-schedules/${id}`);
  }
});

/**
 * T560 / AC-399 (design 16, state G8): below 1,024 px, drawn at 390,
 * Schedules lists each schedule's name, next run and owner; its pane is a
 * full-screen sheet, and × goes back to the list.
 */
test('below 1,024 px Schedules lists name, next run and owner, and its pane is a full-screen sheet', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/schedules');
  const table = page.getByRole('table', { name: 'Refresh schedules' });
  const row = table.getByRole('row').filter({ hasText: 'monthly_orders.by_status_month' }).first();
  await expect(row).toBeVisible(PUBLISHED);
  for (const shown of ['Pre-aggregation', 'Next run', 'Owner'])
    await expect(table.getByRole('columnheader', { name: shown, exact: true })).toBeVisible();
  for (const moved of ['Folder', 'Schedule', 'Last run'])
    await expect(table.getByRole('columnheader', { name: moved, exact: true })).toBeHidden();

  await row.click();
  const pane = page.getByRole('complementary', { name: 'Schedule details' });
  await expect(pane.getByRole('heading', { level: 2 })).toHaveText(
    'monthly_orders.by_status_month',
  );
  const sheet = await pane.boundingBox();
  expect([sheet?.x, sheet?.width]).toEqual([0, 390]);
  // Opened, the sheet has focus, at its head; × leads the head (rule 85).
  await expect(pane.getByRole('heading', { level: 2 })).toBeFocused();
  // Its actions pinned at the sheet's foot (G8; T610).
  const actions = await pane.getByRole('link', { name: 'Open in Model' }).boundingBox();
  expect((actions?.y ?? 0) + (actions?.height ?? 0)).toBeGreaterThan(844 - 48);

  await pane.getByRole('button', { name: 'Back to the list' }).click();
  await expect(pane).toHaveCount(0);
  await expect(row).toBeVisible();
  await expect(row).toBeFocused();
});

/**
 * T610's review (AC-399; design 16, G8): the sheet's pinned foot hides none
 * of the sheet's last lines, however tall it wraps at 390 px, and its
 * dialog is over it, the foot's actions out of reach behind it.
 */
test('below 1,024 px the sheet’s pinned foot hides nothing, and its dialog is over it', async ({
  page,
  request,
  browserName,
}) => {
  const name = `Sheet foot ${browserName} ${String(Date.now())}`;
  let id = '';
  await expect
    .poll(async () => {
      const made = await request.post('/api/wechart-schedules', {
        data: {
          preAggregation: 'monthly_orders.by_status_month',
          name,
          cron: '0 5 * * *',
          timezone: 'UTC',
        },
      });
      if (made.ok()) id = ((await made.json()) as { id: string }).id;
      return made.status();
    }, PUBLISHED)
    .toBe(201);
  expect(id).toMatch(/\S/);
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/schedules');
    const pane = page.getByRole('complementary', { name: 'Schedule details' });
    /** Scrolled to its end: the last line's bottom, and the foot's top. */
    const atEnd = () =>
      pane.evaluate((sheet) => {
        // Its body scrolls, under its head and over its foot, as `.source-pane`'s (T640).
        const body = sheet.querySelector('.admin-pane__body') ?? sheet;
        body.scrollTop = body.scrollHeight;
        const foot = sheet.querySelector('.source-pane__foot');
        const lines = [...sheet.querySelectorAll('*')].filter(
          (each) =>
            foot?.contains(each) !== true &&
            each.children.length === 0 &&
            each.getBoundingClientRect().height > 0,
        );
        return {
          last: Math.max(...lines.map((each) => each.getBoundingClientRect().bottom)),
          foot: foot?.getBoundingClientRect().top ?? NaN,
        };
      });

    // New schedule: its Cancel and Create pinned, its last line above them.
    await page.getByRole('button', { name: 'New schedule' }).click();
    await expect(pane.getByRole('heading', { level: 2 })).toHaveText('New schedule');
    const form = await atEnd();
    expect(form.last).toBeLessThanOrEqual(form.foot);

    // One of wechart's: its last line above the foot, and Delete's dialog over the foot.
    await pane.getByRole('button', { name: 'Cancel' }).click();
    await page
      .getByRole('table', { name: 'Refresh schedules' })
      .getByRole('row')
      .filter({ hasText: name })
      .click();
    await expect(pane.getByRole('heading', { level: 2 })).toHaveText(name);
    const own = await atEnd();
    expect(own.last).toBeLessThanOrEqual(own.foot);
    const runNow = pane.getByRole('button', { name: 'Run now' });
    const box = await runNow.boundingBox();
    await pane.getByRole('button', { name: 'Delete…' }).click();
    const dialog = page.getByRole('alertdialog', { name: `Delete “${name}”?` });
    await expect(dialog).toBeVisible();
    const over = await page.evaluate(
      ({ x, y }) => document.elementFromPoint(x, y)?.closest('.source-pane__foot') === null,
      { x: (box?.x ?? 0) + (box?.width ?? 0) / 2, y: (box?.y ?? 0) + (box?.height ?? 0) / 2 },
    );
    expect(over).toBe(true);
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toHaveCount(0);
  } finally {
    await request.delete(`/api/wechart-schedules/${id}`);
  }
});
