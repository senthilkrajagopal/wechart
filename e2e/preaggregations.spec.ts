import { expect, test, type Page } from '@playwright/test';

import {
  inMyWorkspace,
  modelFilesIn,
  ownCubeFile,
  ownModelCopy,
  proposedModel,
  PUBLISHED,
} from './model-files';
import { cubePicker } from './cubePicker';
import { wellPicker } from './wells';

/**
 * F16 — pre-aggregations, on the sample model's accelerated cube,
 * `cubes/monthly_orders.yml` (T014).
 *
 * T148 / AC-142: WHEN the user opens a cube's pre-aggregations, THE SYSTEM
 * SHALL list each rollup with its measures, dimensions, time dimension,
 * granularity, partition granularity and indexes.
 * Fails when: a declared rollup or any of those attributes is missing.
 */
test('a cube’s pre-aggregations list each rollup with what it declares', async ({ page }) => {
  await page.goto('/model/files/cubes%2Fmonthly_orders.yml');
  const form = page.getByRole('region', { name: 'Cube monthly_orders' });
  await form.getByRole('tab', { name: /^Pre-aggs/ }).click();

  const rollups = form.getByRole('list', { name: 'Pre-aggregations' }).locator(':scope > li');
  await expect(rollups).toHaveCount(1);
  const rollup = rollups.first();
  await expect(rollup.locator('.model-member__name').first()).toHaveText('by_status_month');

  const facts = rollup.locator('.rollup-facts > div');
  await expect(facts.locator('dt')).toHaveText([
    'Measures',
    'Dimensions',
    'Time dimension',
    'Granularity',
    'Partition granularity',
    'Indexes',
  ]);
  await expect(facts.locator('dd')).toHaveText([
    'count, total_amount',
    'status',
    'ordered_at',
    'month',
    'year',
    'by_status (status)',
  ]);
  // Listed without opening the rollup's form.
  await expect(facts.first()).toBeVisible();
  await expect(rollup.locator(':scope > details')).not.toHaveAttribute('open', /.*/);
});

/**
 * T149 / AC-143: WHEN the user edits a rollup in the form, THE SYSTEM SHALL
 * write it into the model file as YAML, subject to the same validation and
 * publishing as any model change.
 * Fails when: the change is applied to Cube without being written to the
 * model file.
 *
 * On a cube file of this browser's own (the browsers publish at once), with a
 * rollup, against the real Cube: the edit is YAML in the file first, and goes
 * to Cube only through "Save & reload Cube" — compiled by Cube as a draft,
 * published if it compiles (T142).
 */
const withRollup = (cube: string) => `cubes:
  - name: ${cube}
    sql_table: public.orders

    dimensions:
      - name: id
        sql: id
        type: number
        primary_key: true
      - name: status
        sql: status
        type: string
      - name: ordered_at
        sql: ordered_at
        type: time

    measures:
      - name: count
        type: count

    pre_aggregations:
      - name: by_status
        measures:
          - count
        dimensions:
          - status
        time_dimension: ordered_at
        granularity: month
`;

/** The one rollup's form, opened. */
async function openRollup(page: Page, cube: string) {
  const form = page.getByRole('region', { name: `Cube ${cube}` });
  await form.getByRole('tab', { name: /^Pre-aggs/ }).click();
  const rollup = form
    .getByRole('list', { name: 'Pre-aggregations' })
    .locator(':scope > li')
    .filter({ has: page.locator('.model-member__name', { hasText: /^by_status$/ }) });
  await rollup.locator(':scope > details > summary').click();
  const own = (key: string) =>
    rollup.locator(`:scope > details > .model-form__fields > [data-key="${key}"]`);
  return { rollup, own };
}

/** A copy's save, in My workspace (T347). */
const SAVED = 'Saved. Previews in My workspace use it now.';

const storedFile = async (page: Page, path: string) =>
  (
    (await (await page.request.get('/api/model/files')).json()) as {
      files: { path: string; content: string }[];
    }
  ).files.find((file) => file.path === path)?.content ?? '';

test('a rollup edited in its form is YAML in its file, and published as any model change', async ({
  page,
}, testInfo) => {
  const cube = `e2e_rollup_${testInfo.project.name}`;
  const path = await ownCubeFile(page.request, cube, withRollup(cube));
  // Changed as a shared model is with sign-in off now (T451's switch;
  // AC-254, R52): in the single user's copy, saved, then landed.
  const copy = await ownModelCopy(page.request, path);
  try {
    await page.goto(copy.href);
    const yaml = page.getByRole('textbox', { name: `${path}, as YAML` });
    const { rollup, own } = await openRollup(page, cube);

    // Free text: a model may define granularities of its own.
    await own('granularity').getByLabel('Granularity', { exact: true }).fill('day');

    // In the file's YAML at once; not in the stored model until it is saved.
    await expect(yaml).toContainText('granularity: day');
    expect(await storedFile(page, path)).toContain('granularity: month');
    await expect(rollup.locator('.rollup-facts dd').nth(3)).toHaveText('day');

    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Saved' })).toHaveText(
      SAVED,
      PUBLISHED,
    );
    // Saved in the copy, the shared model as it was until it lands.
    expect(await storedFile(page, path)).toContain('granularity: month');
    await copy.land();
  } finally {
    await copy.drop();
  }
  const stored = await storedFile(page, path);
  expect(stored).toContain('granularity: day');
  expect(stored).not.toContain('granularity: month');
});

test('a rollup edit Cube refuses is not published', async ({ page }, testInfo) => {
  const cube = `e2e_rollup_refused_${testInfo.project.name}`;
  const path = await ownCubeFile(page.request, cube, withRollup(cube));
  // Changed in the single user's copy in My workspace (T451's switch;
  // AC-254, R52), and refused when proposed: xcube's dry run of the landing
  // compiles the rollup, which a workspace's overlay strips (research
  // xcube-slice-5.md, gotcha 15), so its save keeps it.
  const copy = await ownModelCopy(page.request, path);
  try {
    await refusedWhenProposed(page, cube, path, copy);
  } finally {
    await copy.drop();
  }
});

/** A time dimension's granularity cleared in `copy`, saved, and refused when proposed. */
async function refusedWhenProposed(
  page: Page,
  cube: string,
  path: string,
  copy: { readonly folderId: string; readonly path: string; readonly href: string },
) {
  await page.goto(copy.href);
  const { own } = await openRollup(page, cube);

  /**
   * A time dimension with its granularity cleared: one of the rollup mistakes
   * Cube's compile refuses (research/cube/pre-aggregations.md, "Observed
   * locally"). An unknown member it lets through is refused by wechart
   * instead (T207, below).
   */
  await own('granularity').getByLabel('Granularity', { exact: true }).fill('');
  await expect(page.getByRole('textbox', { name: `${path}, as YAML` })).not.toContainText(
    'granularity:',
  );
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Saved' })).toHaveText(SAVED, PUBLISHED);
  expect(
    (await modelFilesIn(page.request, copy.folderId)).find((file) => file.path === path)?.content,
  ).not.toContain('granularity:');

  // Proposed: Cube's refusal, on the file; nothing proposed, nothing published.
  const proposed = await proposedModel(page.request, copy.folderId, copy.path);
  expect(proposed.status(), await proposed.text()).toBe(422);
  const { errors } = (await proposed.json()) as {
    errors?: { path: string; message: string }[];
  };
  expect(errors).toEqual([
    expect.objectContaining({
      path,
      message: expect.stringContaining('preAggregations.by_status.granularity) is required'),
    }),
  ]);
  expect(await storedFile(page, path)).toContain('granularity: month');
}

/**
 * The Propose dialog for a model in My workspace, opened from its row in
 * Explore (T358, AC-284): a refusal is said as it opens, as a count of what
 * would break (`[R60]`, "Just the count").
 */
async function proposeRefused(
  page: Page,
  copy: { readonly folderId: string; readonly path: string },
) {
  await page.goto(`/explore?folder=${encodeURIComponent(copy.folderId)}`);
  await page
    .getByTestId(`item-${copy.path}`)
    .getByRole('button', { name: `Actions for ${copy.path.slice(copy.path.lastIndexOf('/') + 1)}` })
    .click();
  // Named for its target where it has one (T694; design 04, pin 7).
  await page.getByRole('menuitem', { name: /^Propose( to .+)?…$/ }).click();
  const dialog = page.getByRole('dialog', { name: /^Propose to / });
  await expect(dialog.getByRole('alert')).toHaveText(
    'Can’t propose: 1 item would break, so it wasn’t proposed.',
    { timeout: 90_000 },
  );
  await expect(dialog.getByRole('button', { name: 'Propose', exact: true })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(dialog).toHaveCount(0);
}

/**
 * T207 / AC-189 (amended 2026-10-04, `[R60]`): IF a model change being
 * proposed or approved leaves a pre-aggregation naming a measure, dimension,
 * segment, time dimension or index column that the model does not have, THEN
 * THE SYSTEM SHALL refuse the proposal or the approval, and a refused
 * approval's review SHALL name each unknown name with its pre-aggregation and
 * file (design 05, state L).
 * Fails when: a change whose rollup names `CUBE.no_such_member` is proposed,
 * or lands (the shared file changes); or a refused approval's review doesn't
 * name the member the rollup lacks.
 *
 * Against the real Cube, which compiles such a rollup and then fails queries
 * on its cube (research/cube/pre-aggregations.md, "Observed locally"). Here,
 * the proposal's half: saved in My workspace, which checks no rollup (R60),
 * and refused when proposed. The approval's half, a refused review naming
 * the member, is `folder-models.spec.ts`'s.
 */
test('a rollup naming a member the model doesn’t have is refused when proposed, naming it', async ({
  page,
}, testInfo) => {
  const cube = `e2e_rollup_unknown_${testInfo.project.name}`;
  const path = await ownCubeFile(page.request, cube, withRollup(cube));
  const copy = await ownModelCopy(page.request, path);
  try {
    await page.goto(copy.href);
    const { own } = await openRollup(page, cube);

    // Written in the code: the form's picker names only what the model has
    // (AC-224). The rollup's `- status`, line 26, made a name it doesn't have.
    await page.locator('.cm-line', { hasText: /^\s+- status$/ }).click();
    await page.keyboard.press('End');
    await page.keyboard.press('Shift+Home');
    await page.keyboard.type('- CUBE.no_such_member');
    await expect(page.getByRole('textbox', { name: `${path}, as YAML` })).toContainText(
      'CUBE.no_such_member',
    );
    // The form reads it, and keeps the name picked, until it is taken away.
    await expect(
      own('dimensions').getByRole('button', { name: 'CUBE.no_such_member', pressed: true }),
    ).toBeVisible();
    // Saved in My workspace: its save checks no rollup (R60).
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Saved' })).toHaveText(
      SAVED,
      PUBLISHED,
    );

    // Proposed: the dialog counts what would break, and nothing is proposed.
    await proposeRefused(page, copy);
    // The refusal names the member, on the file at the rollup's line (its `- name: by_status`).
    const proposed = await proposedModel(page.request, copy.folderId, copy.path);
    expect(proposed.status()).toBe(422);
    const { errors } = (await proposed.json()) as {
      errors?: { path: string; line?: number; message: string }[];
    };
    expect(errors?.map((each) => [each.path, each.line])).toEqual([[path, 22]]);
    expect(errors?.[0]?.message).toContain('CUBE.no_such_member (dimensions)');
    expect(await storedFile(page, path)).not.toContain('no_such_member');
  } finally {
    await copy.drop();
  }
});

/**
 * T265 / AC-235 (amended 2026-10-04, `[R60]`): WHEN the user proposes or
 * approves a model change in which a rollup names members of cubes Cube
 * cannot join, THE SYSTEM SHALL refuse it: the Propose dialog SHALL say how
 * many items would break, and a refused approval's review SHALL name the
 * rollup and its file and give Cube's reason (design 05, state L).
 * `Fails when: such a change is proposed, or lands; the Propose dialog's
 * refusal doesn't say how many items would break; or a refused approval's
 * review names no rollup or gives no reason.`
 *
 * The seed's `products` joins nothing, and nothing but `orders` joins it: a
 * cube on the customers table naming `products.category` in a rollup can't
 * be joined. The real Cube, under the draft, says why (research/cube/
 * rollup-join-paths.md, Q5); the same rollup on a cube that joins products
 * publishes. Here, the proposal's half; the approval's is the next test.
 */
test('a rollup naming a cube its own can’t be joined to is refused, naming it, its file and Cube’s reason', async ({
  page,
  request,
}, testInfo) => {
  const cube = `e2e_unjoinable_${testInfo.project.name}`;
  const path = `cubes/${cube}.yml`;
  // A key, which Cube asks of a cube that joins (its compile says so).
  const file = (table: string, joins: string) => `cubes:
  - name: ${cube}
    sql_table: public.${table}
${joins}
    dimensions:
      - name: id
        sql: id
        type: number
        primary_key: true
    measures:
      - name: count
        type: count

    pre_aggregations:
      - name: by_category
        measures: [count]
        dimensions: [products.category]
`;
  const joined = file(
    'orders',
    `    joins:
      - name: products
        sql: "{CUBE}.product_id = {products.id}"
        relationship: many_to_one
`,
  );
  // With the join, the rollup publishes: what the store holds from here, on a rerun too.
  expect(await ownCubeFile(request, cube, joined)).toBe(path);

  /**
   * Published as a shared model is changed with sign-in off now (T451's
   * switch; AC-254, R52): saved in the single user's copy, whose overlay
   * plans no rollup (research xcube-slice-5.md, gotcha 15), and refused when
   * proposed, by the dry run of the change's landing.
   */
  const copy = await ownModelCopy(request, path);
  try {
    const saved = await request.post('/api/model/publish', {
      data: { folderId: copy.folderId, files: [{ path, content: file('customers', '') }] },
      timeout: 90_000,
    });
    expect(saved.status(), await saved.text()).toBe(200);
    const refused = await proposedModel(request, copy.folderId, copy.path);
    const { errors } = (await refused.json()) as {
      errors?: { path: string; line?: number; message: string }[];
    };
    expect(refused.status()).toBe(422);
    expect(errors).toHaveLength(1);
    // `- name: by_category`, the fifteenth line of the file.
    expect(errors?.[0]).toMatchObject({ path, line: 15 });
    expect(errors?.[0]?.message).toMatch(
      /^Pre-aggregation by_category can't be built: Cube cannot join its cubes\. Can't find join path to join .*'products'.*\.$/,
    );
    expect(await storedFile(page, path)).toBe(joined);

    // In the Model workspace: the copy back as it landed, its rollup made to
    // name a cube this one doesn't join, in the code, saved, and refused as
    // that, on its line, when proposed: counted in the Propose dialog (R60).
    const again = await request.post('/api/model/publish', {
      data: { folderId: copy.folderId, files: [{ path, content: joined }] },
      timeout: 90_000,
    });
    expect(again.status(), await again.text()).toBe(200);
    await page.goto(copy.href);
    await page.locator('.cm-line', { hasText: /^\s+dimensions: \[products\.category\]$/ }).click();
    await page.keyboard.press('End');
    await page.keyboard.press('Shift+Home');
    await page.keyboard.type('dimensions: [customers.country]');
    await expect(page.getByRole('textbox', { name: `${path}, as YAML` })).toContainText(
      'customers.country',
    );
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Saved' })).toHaveText(
      SAVED,
      PUBLISHED,
    );
    await proposeRefused(page, copy);
    const proposed = await proposedModel(request, copy.folderId, copy.path);
    expect(proposed.status()).toBe(422);
    const [problem] =
      ((await proposed.json()) as { errors?: { path: string; line?: number; message: string }[] })
        .errors ?? [];
    expect(problem?.message).toMatch(/by_category can't be built: Cube cannot join its cubes/);
    expect(problem?.message).toMatch(/Can't find join path to join .*'customers'/);
    // `- name: by_category`, the nineteenth line of the file with its join.
    expect([problem?.path, problem?.line]).toEqual([path, 19]);
    expect(await storedFile(page, path)).toBe(joined);
  } finally {
    await copy.drop();
  }
});

/**
 * AC-235's approval half (amended 2026-10-04, `[R60]`): a rollup that could
 * be joined when it was proposed — through a cube of its own that joins
 * `products` — can't be once that cube's join is taken away and landed
 * meanwhile. Approved, it is refused, and the review names the rollup, its
 * file and Cube's reason (design 05, state L); nothing lands.
 */
test('a rollup whose join path went while it waited is refused at approval, the review naming it and Cube’s reason', async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(240_000);
  const project = testInfo.project.name;
  const bridge = `e2e_bridge_${project}`;
  const cube = `e2e_bridged_${project}`;
  const bridgeFile = (joins: string) =>
    `cubes:\n  - name: ${bridge}\n    sql_table: public.orders\n${joins}    dimensions:\n      - name: id\n        sql: id\n        type: number\n        primary_key: true\n    measures:\n      - name: count\n        type: count\n`;
  const bridgePath = await ownCubeFile(
    request,
    bridge,
    bridgeFile(
      `    joins:\n      - name: products\n        sql: "{CUBE}.product_id = {products.id}"\n        relationship: many_to_one\n`,
    ),
  );
  // New, to go to the root, its rollup on products through the bridge alone.
  const path = `cubes/${cube}.yml`;
  const held = await inMyWorkspace(request, 'root', [
    {
      path,
      content: `cubes:\n  - name: ${cube}\n    sql_table: public.orders\n    joins:\n      - name: ${bridge}\n        sql: "{CUBE}.id = {${bridge}}.id"\n        relationship: one_to_one\n    dimensions:\n      - name: id\n        sql: id\n        type: number\n        primary_key: true\n    measures:\n      - name: count\n        type: count\n\n    pre_aggregations:\n      - name: by_category\n        measures: [count]\n        dimensions: [products.category]\n`,
    },
  ]);
  const bridgeCopy = await ownModelCopy(request, bridgePath);
  let proposal = '';
  try {
    // Proposed while it can be joined: the dry run passes.
    const proposed = await proposedModel(request, held.folderOf(path), path);
    expect(proposed.status(), await proposed.text()).toBe(201);
    proposal = ((await proposed.json()) as { id: string }).id;

    // Meanwhile the bridge's join to products is taken away, and lands.
    const saved = await request.post('/api/model/publish', {
      data: {
        folderId: bridgeCopy.folderId,
        files: [{ path: bridgePath, content: bridgeFile('') }],
      },
      timeout: 90_000,
    });
    expect(saved.status(), await saved.text()).toBe(200);
    await bridgeCopy.land();

    // Approved now, it is refused, the review naming the rollup, its file and why.
    await page.goto(`/reviews/${proposal}`);
    await page.getByRole('button', { name: 'Approve my own proposal' }).click();
    await page.getByRole('button', { name: 'Approve and publish' }).click();
    await expect(page.getByRole('alert')).toHaveText('Can’t approve: 1 item would break', {
      timeout: 90_000,
    });
    const broken = page.locator('.review-refusal__break');
    await expect(broken).toHaveCount(1);
    await expect(broken).toContainText(`${path} · Shared`);
    await expect(broken).toContainText(
      /Pre-aggregation by_category can't be built: Cube cannot join its cubes\. Can't find join path to join /,
    );
    // Nothing landed.
    expect((await modelFilesIn(request, 'root')).map((file) => file.path)).not.toContain(path);
  } finally {
    if (proposal !== '') await request.post(`/api/proposals/${proposal}/reject`, { data: {} });
    await held.drop();
    await bridgeCopy.drop();
  }
});

/**
 * T207's review: a change to one file that leaves another file's rollup
 * naming what the model no longer has is refused too, the refusal naming
 * that rollup's file and the member it lacks. Proposed, as a shared model is
 * changed now (T451's switch; AC-189 amended, `[R60]`): the copy's save in My
 * workspace checks no rollup, and the proposal is refused.
 */
test('taking away a member another file’s rollup names is refused when proposed, naming that file', async ({
  page,
}, testInfo) => {
  const base = `e2e_rollup_base_${testInfo.project.name}`;
  const user = `e2e_rollup_user_${testInfo.project.name}`;
  const basePath = await ownCubeFile(
    page.request,
    base,
    `cubes:\n  - name: ${base}\n    sql_table: public.orders\n    dimensions:\n      - name: id\n        sql: id\n        type: number\n        primary_key: true\n      - name: status\n        sql: status\n        type: string\n      - name: region\n        sql: status\n        type: string\n    measures:\n      - name: count\n        type: count\n`,
  );
  // Joined to the base cube, so the rollup is one Cube can plan: without a
  // join path, Cube compiles it and then fails every plan of it — the
  // refresh worker's whole run for this model included, which starved the
  // other tests' rollups (T159's e2e; research/cube/refresh-key-schedule.md,
  // gotcha 1).
  const userPath = await ownCubeFile(
    page.request,
    user,
    `cubes:\n  - name: ${user}\n    sql_table: public.orders\n    joins:\n      - name: ${base}\n        relationship: one_to_one\n        sql: "{CUBE}.id = {${base}}.id"\n    dimensions:\n      - name: id\n        sql: id\n        type: number\n        primary_key: true\n    measures:\n      - name: count\n        type: count\n    pre_aggregations:\n      - name: by_region\n        measures: [CUBE.count]\n        dimensions: [${base}.region]\n`,
  );

  const copy = await ownModelCopy(page.request, basePath);
  try {
    await page.goto(copy.href);
    const form = page.getByRole('region', { name: `Cube ${base}` });
    await form.getByRole('tab', { name: /^Dimensions/ }).click();
    // Remove is inside the open member since T480.
    await form.locator('.model-member__name', { hasText: /^region$/ }).click();
    await form.getByRole('button', { name: /^Remove .* region$/ }).click();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Saved' })).toHaveText(
      SAVED,
      PUBLISHED,
    );

    // Proposed: counted in the dialog; the refusal is about the other file's
    // rollup, naming it and what it lacks; nothing changes.
    await proposeRefused(page, copy);
    const proposed = await proposedModel(page.request, copy.folderId, copy.path);
    expect(proposed.status()).toBe(422);
    const { errors } = (await proposed.json()) as {
      errors?: { path: string; message: string }[];
    };
    expect(errors?.map((each) => each.path)).toEqual([userPath]);
    expect(errors?.[0]?.message).toContain(`${base}.region (dimensions)`);
    expect(await storedFile(page, basePath)).toContain('name: region');
  } finally {
    await copy.drop();
  }
});

/**
 * T152 / AC-146: WHEN the user defines an index on a rollup, THE SYSTEM SHALL
 * let the columns be ordered and mark aggregate indexes as such.
 * Fails when: the column order cannot be changed, or an aggregate index is
 * written as a regular one.
 *
 * On a cube file of this browser's own with an indexed rollup, against the
 * real Cube: the order and the type are what the file says, and Cube compiles
 * it.
 */
test('an index’s columns are moved into order, and an aggregate one is written so', async ({
  page,
}, testInfo) => {
  const cube = `e2e_index_${testInfo.project.name}`;
  const content = withRollup(cube)
    .replace(
      '      - name: status\n        sql: status\n        type: string\n',
      '      - name: status\n        sql: status\n        type: string\n' +
        '      - name: customer_id\n        sql: customer_id\n        type: number\n',
    )
    .replace(
      '        dimensions:\n          - status\n',
      '        dimensions:\n          - status\n          - customer_id\n' +
        '        indexes:\n          - name: by_customer\n            columns:\n' +
        '              - status\n              - customer_id\n',
    );
  const path = await ownCubeFile(page.request, cube, content);
  // In the single user's copy, saved, then landed (T451's switch; AC-254).
  const copy = await ownModelCopy(page.request, path);
  try {
    await page.goto(copy.href);
    await indexOrdered(page, cube);
    await copy.land();
  } finally {
    await copy.drop();
  }
  // The file, in the order moved into, the index marked aggregate.
  expect(await storedFile(page, path)).toContain(
    '        indexes:\n          - name: by_customer\n            columns:\n' +
      '              - customer_id\n              - status\n            type: aggregate\n',
  );
});

/** The rollup's index `by_customer` reordered and made aggregate, and saved. */
async function indexOrdered(page: Page, cube: string) {
  const yaml = page.getByRole('textbox', { name: /, as YAML$/ });
  const { rollup } = await openRollup(page, cube);
  await rollup.locator('.model-member__name', { hasText: /^by_customer$/ }).click();
  const index = rollup.locator('.model-member').filter({
    has: page.locator(':scope > summary .model-member__name', { hasText: /^by_customer$/ }),
  });
  const columns = index.getByRole('list', { name: 'Columns' });
  await expect(columns.locator('.ordered-references__name')).toHaveText(['status', 'customer_id']);

  await columns.getByRole('button', { name: 'Move customer_id up' }).click();
  await index.getByLabel('Type', { exact: true }).selectOption('aggregate');

  await expect(columns.locator('.ordered-references__name')).toHaveText(['customer_id', 'status']);
  await expect(yaml).toContainText('type: aggregate');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Saved' })).toHaveText(SAVED, PUBLISHED);
}

/**
 * T150 / AC-144: WHEN the user opens a chart's acceleration panel, THE SYSTEM
 * SHALL say whether the chart's query matches a pre-aggregation, and when it
 * does not, name the member that prevents the match.
 * Fails when: the panel reports a match that Cube does not use, or names no
 * reason for a miss.
 *
 * In the chart editor, against the real Cube and the seed rollup: the match
 * the panel reports is the one Cube serves the chart from (`/api/load`'s
 * `usedPreAggregations`), and a miss names its member.
 */
test('a chart’s acceleration panel says which rollup serves it, and what stops one', async ({
  page,
}) => {
  const served = async (query: Record<string, unknown>) =>
    Object.values(
      (
        (await (await page.request.post('/api/load', { data: { query } })).json()) as {
          usedPreAggregations?: Record<string, { preAggregationId?: string }>;
        }
      ).usedPreAggregations ?? {},
    ).map((each) => each.preAggregationId);
  const byStatus = { measures: ['monthly_orders.count'], dimensions: ['monthly_orders.status'] };
  // The refresh worker builds the rollup a little after Cube starts.
  await expect(async () => {
    expect(await served(byStatus)).toEqual(['monthly_orders.by_status_month']);
  }).toPass({ timeout: 90_000, intervals: [2_000] });

  await page.goto('/explore/charts/seed-chart-empty/edit');
  await cubePicker(page).selectOption({ value: 'monthly_orders' });
  await wellPicker(page, 'measures').selectOption('monthly_orders.count');
  await wellPicker(page, 'dimensions').selectOption('monthly_orders.status');
  /**
   * Waited for longer than the default: the other browsers publish cube files
   * of their own at the same time, and Cube compiles the store's model again
   * after each — so a query just after one can take several seconds.
   */
  const cube = { timeout: 30_000 };
  await expect(page.getByTestId('result-row-count')).toHaveText('3 rows', cube);
  await page.getByRole('tab', { name: 'Results', exact: true }).click();
  await page.getByTestId('drawer-tab-acceleration').click();

  // The rollup Cube serves the chart from, and no other.
  // "by", as the badge's words have it (chart-editor-Q5; T690, EDI-22).
  await expect(page.getByTestId('acceleration-matched')).toHaveText(
    'Served by the pre-aggregation monthly_orders.by_status_month.',
    cube,
  );

  // The time, asked by day (every time field is, `QUERY_GRANULARITY`): finer
  // than the rollup's month — a miss, and the member named.
  await wellPicker(page, 'timeDimensions').selectOption('monthly_orders.ordered_at');
  // By its title from the model, never its internal name (T403, AC-220).
  await expect(page.getByTestId('acceleration-member')).toHaveText(
    'Monthly Orders Ordered at',
    cube,
  );
  await expect(page.getByTestId('acceleration-miss')).toContainText(
    'the nearest is monthly_orders.by_status_month. Stopped by Monthly Orders Ordered at: ' +
      'Monthly Orders Ordered at is grouped by day, and the rollup keeps it by month.',
  );
  // And Cube does answer that chart from the database.
  expect(
    await served({
      measures: ['monthly_orders.count'],
      dimensions: ['monthly_orders.status'],
      timeDimensions: [{ dimension: 'monthly_orders.ordered_at', granularity: 'day' }],
    }),
  ).toEqual([]);

  // A cube with no rollups says so, by titles (T403, AC-220): the re-critique
  // read "Stopped by orders.count: orders has no pre-aggregations."
  await cubePicker(page).selectOption({ label: 'Orders' });
  await wellPicker(page, 'measures').selectOption('orders.count');
  await expect(page.getByTestId('acceleration-miss')).toHaveText(
    'Not served by a pre-aggregation. Stopped by Orders Count: Orders has no pre-aggregations.',
    cube,
  );
});

/**
 * T153 / AC-147 as amended by R76 (chart-editor-Q4; T690): IF a query would
 * fail under rollup-only mode, THEN THE SYSTEM SHALL say on the chart that
 * the source database answered it (its query badge reads "Live", with the
 * rollup-only sentence in the badge's tooltip), SHALL say in the chart
 * editor's Acceleration tab that Cube would refuse the chart in rollup-only
 * mode, and, WHERE wechart knows that Cube runs in rollup-only mode, SHALL
 * show that as a warning banner on the chart.
 * `Fails when: such a chart's badge doesn't say Live, its Acceleration tab
 * has no rollup-only note, or, while rollup-only mode is known to be on, the
 * chart shows no banner.`
 *
 * Under rollup-only mode Cube refuses what no pre-aggregation serves
 * (research/cube/pre-aggregations.md §2): on the real Cube, a chart on
 * `orders`, which has no rollups, is such a chart, and one the seed rollup
 * serves is not. Compose's Cube runs without CUBEJS_ROLLUP_ONLY, so xcube
 * says `rollupOnly: false` (research `xcube-407622a6b8.md`): no banner; the
 * known-on case is xcube saying true, answered here in its place.
 */
test('a chart no rollup serves reads Live, says rollup-only would refuse it, and warns only where that mode is known on', async ({
  page,
}) => {
  const cube = { timeout: 30_000 };
  await page.goto('/explore/charts/seed-chart-empty/edit');
  await cubePicker(page).selectOption({ label: 'Orders' });
  await wellPicker(page, 'measures').selectOption('orders.count');

  // On the chart: its head's badge, "● Live", and the sentence in its tooltip.
  const head = page.getByTestId('editor-bar');
  const badge = head.getByTestId('acceleration');
  await expect(badge).toHaveText('● Live', cube);
  await expect(badge).toHaveAttribute(
    'title',
    'Not served by a pre-aggregation · Cube queried the source database. If Cube runs in rollup-only mode, it would refuse this chart.',
  );
  // No banner: the mode isn't known to be on.
  await expect(page.getByTestId('rollup-only-warning')).toHaveCount(0);
  // The Acceleration tab's note.
  await page.getByRole('tab', { name: 'Results', exact: true }).click();
  await page.getByTestId('drawer-tab-acceleration').click();
  const note = page.getByRole('tabpanel', { name: 'Acceleration' }).getByTestId('rollup-only-note');
  await expect(note).toHaveText(
    'If Cube runs in rollup-only mode (CUBEJS_ROLLUP_ONLY), it would refuse this chart.',
    cube,
  );

  // A chart the rollup serves: "✓ Pre-agg", no note, no banner.
  await cubePicker(page).selectOption({ value: 'monthly_orders' });
  await wellPicker(page, 'measures').selectOption('monthly_orders.count');
  await wellPicker(page, 'dimensions').selectOption('monthly_orders.status');
  await expect(page.getByTestId('acceleration-matched')).toBeVisible(cube);
  await expect(badge).toHaveText('✓ Pre-agg', cube);
  await expect(page.getByTestId('rollup-only-note')).toHaveCount(0);
  await expect(page.getByTestId('rollup-only-warning')).toHaveCount(0);
});

/**
 * T690's review: in a real rollup-only deployment Cube refuses the chart, so
 * the banner is on the failed query's path. Cube's own words for the mode
 * bring it, where xcube says on or can't say (null); no other refusal does —
 * a matched rollup not yet built is refused in other words.
 */
for (const said of [null, true] as const)
  test(`a query Cube refuses for rollup-only mode carries the banner, xcube saying ${String(said)}; another refusal doesn't`, async ({
    page,
  }) => {
    const cube = { timeout: 30_000 };
    await page.route('**/api/rollup-only', (route) =>
      route.fulfill({ json: { rollupOnly: said } }),
    );
    let refusal =
      'No pre-aggregation table has been built for this query yet. Please check your refresh worker configuration if it persists.';
    await page.route('**/api/load', (route) =>
      route.request().method() === 'POST'
        ? route.fulfill({ status: 400, json: { error: refusal } })
        : route.continue(),
    );
    await page.goto('/explore/charts/seed-chart-empty/edit');
    await cubePicker(page).selectOption({ label: 'Orders' });
    await wellPicker(page, 'measures').selectOption('orders.count');
    const warning = page.getByTestId('rollup-only-warning');
    await expect(warning).toHaveText(
      'Cube runs in rollup-only mode: it refuses this chart, which no pre-aggregation serves.',
      cube,
    );
    // Cube's own message stays, beneath it (AC-012).
    await expect(page.getByText(refusal)).toBeVisible();

    // A matched rollup not built yet: refused, but not for the mode.
    refusal =
      'No pre-aggregation partitions were built yet for the pre-aggregation serving this query and this API instance wasn’t set up to build pre-aggregations.';
    await page.getByRole('button', { name: 'Retry' }).click();
    await expect(page.getByText(refusal)).toBeVisible(cube);
    await expect(warning).toHaveCount(0);
  });

test('where xcube says Cube runs rollup-only, a chart no rollup serves carries the banner', async ({
  page,
}) => {
  const cube = { timeout: 30_000 };
  // xcube's answer, as 407622a6b8 gives it with CUBEJS_ROLLUP_ONLY set.
  await page.route('**/api/rollup-only', (route) => route.fulfill({ json: { rollupOnly: true } }));
  await page.goto('/explore/charts/seed-chart-empty/edit');
  await cubePicker(page).selectOption({ label: 'Orders' });
  await wellPicker(page, 'measures').selectOption('orders.count');
  const warning = page.getByTestId('rollup-only-warning');
  await expect(warning).toHaveText(
    'Cube runs in rollup-only mode: it refuses this chart, which no pre-aggregation serves.',
    cube,
  );
  await expect(warning).toHaveAttribute('role', 'status');
  await expect(warning.locator('[data-icon="warning"]')).toHaveCount(1);

  // One a rollup serves: none.
  await cubePicker(page).selectOption({ value: 'monthly_orders' });
  await wellPicker(page, 'measures').selectOption('monthly_orders.count');
  await wellPicker(page, 'dimensions').selectOption('monthly_orders.status');
  await expect(page.getByTestId('editor-bar').getByTestId('acceleration')).toHaveText(
    '✓ Pre-agg',
    cube,
  );
  await expect(warning).toHaveCount(0);
});
