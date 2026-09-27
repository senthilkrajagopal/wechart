import { expect, test } from '@playwright/test';

import { ownCubeFile, PUBLISHED } from './model-files';

/**
 * T160 / AC-154: THE SYSTEM SHALL list every pre-aggregation's refresh
 * schedule in Schedules, label each with its owner, Cube's refresh worker or
 * wechart's scheduler, show Cube-owned schedules read-only there with a link
 * opening the pre-aggregation in the model editor, and say when one is not
 * scheduled (direction.md rule 34).
 * `Fails when: a refresh_key schedule is editable on the Schedules page, is
 * unlabelled, or its link does not open the model editor.`
 *
 * On the real Cube, with a cube file of this browser's own: a cron in its
 * zone, and a rollup Cube never refreshes.
 */
test('Schedules lists each refresh schedule as Cube’s, read-only, and opens it in Model', async ({
  page,
  request,
  browserName,
}) => {
  const cube = `schedules_${browserName}`;
  const path = await ownCubeFile(
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

  await page.goto('/schedules');
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { level: 1 })).toHaveText('Schedules');
  const table = main.getByRole('table', { name: 'Refresh schedules' });
  const mornings = table.getByRole('row').filter({ hasText: `${cube}.mornings` });
  await expect(mornings).toContainText('At "0 8 * * *" in America/Los_Angeles', PUBLISHED);
  // Labelled with its owner.
  await expect(mornings).toContainText('Cube’s refresh worker');
  // One Cube never refreshes says so.
  await expect(table.getByRole('row').filter({ hasText: `${cube}.on_demand` })).toContainText(
    'Not scheduled',
  );
  // The seed rollup, with its interval.
  await expect(
    table.getByRole('row').filter({ hasText: 'monthly_orders.by_status_month' }),
  ).toContainText('Every 1 hour');

  // Read-only: nothing on the page edits a schedule.
  await expect(main.locator('input, select, textarea, [role="switch"]')).toHaveCount(0);
  await expect(table.getByRole('button')).toHaveCount(0);

  // Its link opens the pre-aggregation in the model editor: its file, on its
  // cube's Pre-aggregations tab.
  await mornings.getByRole('link', { name: `Edit ${cube}.mornings in Model` }).click();
  await expect(page).toHaveURL(new RegExp(`/model/files/${encodeURIComponent(path)}`));
  const form = page.getByRole('region', { name: `Cube ${cube}` });
  await expect(form.getByRole('tab', { name: /^Pre-aggs/ })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(form.getByText('mornings').first()).toBeVisible();
});
