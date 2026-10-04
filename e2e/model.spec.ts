import { createHash } from 'node:crypto';

import { expect, test, type Page } from '@playwright/test';

import { inMyWorkspace, modelFilesIn, ownCubeFile, ownModelCopy, PUBLISHED } from './model-files';
import { myModelCopy } from './workspace';

/**
 * With sign-in off, the single user changes a shared model only in a copy in
 * My workspace, as a Super-Admin does (T451's switch; AC-254, AC-278, R52).
 * The seed's orders.yml is edited in theirs, never saved: every spec asking
 * is given the same copy (`myModelCopy`). A test that saves edits a copy of
 * its own cube, and lands it by a proposal it approves.
 */
const ordersCopy = async (page: Page) => (await myModelCopy(page.request, 'cubes/orders.yml')).href;

/** A copy of this browser's own cube in My workspace, to land, and take out again. */
const ownCopy = (page: Page, path: string) => ownModelCopy(page.request, path);

/**
 * T137 / AC-131: WHEN the user opens the Model workspace, THE SYSTEM SHALL
 * list the model files and show the cubes, views, measures, dimensions,
 * segments, hierarchies, joins and pre-aggregations each file defines.
 * Fails when: a file's object is missing from the listing.
 *
 * On the real service: the files wechart seeded from the model directory
 * Cube reads (`infra/cube/model`), listed with what each defines.
 */
test('the Model workspace lists each model file with what it defines', async ({ page }) => {
  await page.goto('/model');
  await expect(page.getByRole('heading', { name: 'Model', level: 1 })).toBeVisible();

  // A row per cube or view (design 12, T486); every member one step away, by
  // kind, in the Members cell's tooltip on hover or focus.
  const table = page.getByRole('table', { name: 'Cubes and views' });
  const rowOf = (path: string) =>
    table.getByRole('row').filter({ has: page.getByRole('link', { name: path, exact: true }) });
  const orders = rowOf('cubes/orders.yml');
  await expect(orders.getByRole('cell').nth(1)).toHaveText('Cube');
  await expect(orders.getByRole('cell').nth(2)).toHaveText('orders');
  const members = orders.locator('.model-overview__members');
  await members.hover();
  const tip = orders.getByRole('tooltip');
  await expect(tip).toBeVisible();
  await expect(tip).toContainText('Measures · count, total_amount, average_amount');
  await expect(tip).toContainText('Dimensions · id, status, ordered_at');
  await expect(tip).toContainText('Joins · customers, products');

  for (const file of ['cubes/customers.yml', 'cubes/products.yml'])
    await expect(rowOf(file)).toHaveCount(1);
  // A view's members: what it includes from its cubes, by path.
  await expect(rowOf('views/order_summary.yml').locator('.model-overview__members')).toHaveText(
    'orders.count, orders.status',
  );
});

/**
 * T139 / AC-133: WHEN the user edits a field in the form, THE SYSTEM SHALL
 * update the YAML view within one render, and WHEN the user edits valid YAML,
 * THE SYSTEM SHALL update the form within 500 milliseconds.
 * Fails when: either view still shows the previous value after that point.
 */
test('the form and the YAML view each show what the other edits', async ({ page }) => {
  await page.goto(await ordersCopy(page));
  const form = page.getByRole('region', { name: 'Cube orders' });
  const yaml = page.getByRole('textbox', { name: 'cubes/orders.yml, as YAML' });
  await expect(yaml).toContainText('sql_table: public.orders');

  // The form, into the YAML: written in the same update, so shown at once.
  await form.getByLabel('Title', { exact: true }).fill('Orders ledger');
  await expect(yaml).toContainText('title: Orders ledger', { timeout: 250 });

  // The form's edit is shown where it is: the YAML scrolled to the new line,
  // at the cube's end — the view moved, not the cursor.
  const scroller = page.locator('.yaml-editor .cm-scroller');
  expect(await scroller.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);

  // The YAML, into the form: after the 300 ms pause, inside the 500 allowed.
  // Scrolled back up first, as a person would, so the click lands on line 3.
  await scroller.evaluate((element) => {
    element.scrollTop = 0;
  });
  await page.locator('.cm-line', { hasText: 'sql_table: public.orders' }).click();
  await page.keyboard.press('End');
  await page.keyboard.type('_2026');
  await expect(form.getByLabel('SQL table', { exact: true })).toHaveValue('public.orders_2026', {
    timeout: 500,
  });
  // And the form's own edit is still in the file, not undone by the YAML's.
  await expect(yaml).toContainText('title: Orders ledger');
});

/**
 * T140 / AC-134: IF switching from code to form would lose information, such
 * as comments or anchors, THEN THE SYSTEM SHALL warn and name what would be
 * lost before applying the change (direction.md rule 20).
 * Fails when: comments disappear from a file with no warning.
 *
 * On the real file: the `id` dimension's `public: true` carries the comment
 * about Cube hiding primary keys. Clearing Public removes the key, and the
 * comment with it.
 */
test('a form edit that would drop a comment names it first, and waits to be told', async ({
  page,
}) => {
  await page.goto(await ordersCopy(page));
  const form = page.getByRole('region', { name: 'Cube orders' });
  const yaml = page.locator('.yaml-editor .cm-scroller');
  const comment = '# Cube hides primary keys from metadata unless told otherwise.';
  await form.getByRole('tab', { name: /^Dimensions/ }).click();
  await form.locator('.model-member__name', { hasText: /^id$/ }).click();
  // A switch since T480: on, as the file writes it; a primary key's default is off.
  const publicField = form
    .getByRole('listitem')
    .filter({ has: page.locator('.model-member__name', { hasText: /^id$/ }) })
    .locator('[data-key="public"]')
    .getByRole('switch', { name: 'Public' });
  await expect(publicField).toBeChecked();

  // Warned, and nothing applied yet: the comment is still in the file.
  // Off is the default, so the key and the comment on it would go.
  await publicField.click();
  const warning = page.getByRole('alert').filter({ hasText: 'This edit would drop' });
  await expect(warning).toContainText(
    // Named by its first line, of four.
    'This edit would drop the comment “Cube hides primary keys from metadata unless told otherwise. This one …”.',
  );
  await expect(yaml).toContainText(comment);
  await expect(publicField).toBeChecked();
  await expect(publicField).toBeDisabled();
  // The focus is on the choice that loses nothing, not lost with the locked field.
  await expect(warning.getByRole('button', { name: 'Keep the file' })).toBeFocused();

  // Kept: the file as it was, and the form free again.
  await warning.getByRole('button', { name: 'Keep the file' }).click();
  await expect(warning).toHaveCount(0);
  await expect(yaml).toContainText(comment);
  await expect(publicField).toBeEnabled();

  // Applied anyway: the key and its comment go.
  await publicField.click();
  await page.getByRole('alert').getByRole('button', { name: 'Apply anyway' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'This edit would drop' })).toHaveCount(0);
  await expect(publicField).not.toBeChecked();
  // The key itself gone, not written false: off is a primary key's default.
  await expect(yaml).not.toContainText('public:');
  await yaml.evaluate((element) => {
    element.scrollTop = 0;
  });
  await expect(yaml).not.toContainText('Cube hides primary keys');
});

/**
 * T142 / AC-136: WHEN the user saves model changes, THE SYSTEM SHALL
 * validate them against Cube before publishing and refuse to publish a model
 * Cube rejects, showing Cube's error per file.
 * Fails when: an invalid model is published, or the error is not attributed
 * to a file.
 *
 * On the real Cube, under xcube (T447): xcube's dry run compiles the change
 * without storing it (T445), and it goes live only if it compiles. Saved in
 * My workspace (T451's switch), it is compiled as its overlay (T347) and
 * kept only if it compiles; nothing is published until a proposal lands.
 */
test('a model change Cube refuses is not published, and Cube’s reason is on its file', async ({
  page,
}, testInfo) => {
  // A copy of a cube of this browser's own: a refused save must leave the seed's alone.
  const cube = `e2e_refused_${testInfo.project.name}`;
  const path = await ownCubeFile(page.request, cube);
  const copy = await ownCopy(page, path);
  await page.goto(copy.href);
  const form = page.getByRole('region', { name: `Cube ${cube}` });
  const save = page.getByRole('button', { name: 'Save', exact: true });
  await expect(save).toBeDisabled();

  // A measure whose SQL names a member there is none of.
  await form.getByRole('tab', { name: /^Measures/ }).click();
  await form.getByRole('button', { name: 'Add measure' }).click();
  const measure = form
    .getByRole('listitem')
    .filter({ has: page.locator('.model-member__name', { hasText: /^measure_1$/ }) });
  // Added, it opens on its own, its name to type over (T480).
  await expect(measure.locator('.model-member')).toHaveAttribute('open', '');
  const own = (key: string) =>
    // In its named group (T236, AC-225).
    measure.locator(
      `.model-member > .model-form__fields > .model-form__group > .model-form__fields > [data-key="${key}"]`,
    );
  await own('type').getByLabel('Type', { exact: true }).selectOption('number');
  await own('sql').getByLabel('SQL', { exact: true }).fill('{no_such_member}');

  try {
    await save.click();
    await expect(page.getByRole('alert').filter({ hasText: 'Cube refused the model' })).toBeVisible(
      PUBLISHED,
    );
    const problem = page
      .getByRole('region', { name: 'Problems' })
      .getByRole('listitem')
      .filter({ hasText: 'Cube: no_such_member is not defined' });
    await expect(problem.locator('.model-problems__where')).toHaveText(path);
    // And the file is marked in the tree (T234's review, AC-222).
    await expect(
      page
        .getByRole('navigation', { name: 'Model files' })
        .getByRole('link', { name: new RegExp(`^${cube}\\.yml`) }),
    ).toContainText('problems');

    // Nothing published, nor saved: the stored files, and the model Cube serves, as they were.
    for (const folderId of ['root', copy.folderId])
      expect(
        (await modelFilesIn(page.request, folderId)).find((file) => file.path === path)?.content,
      ).not.toContain('measure_1');
    const meta = (await (await page.request.get('/api/meta')).json()) as {
      cubes: { name: string; measures: { name: string }[] }[];
    };
    expect(
      meta.cubes.find((each) => each.name === cube)?.measures.map((each) => each.name),
    ).not.toContain(`${cube}.measure_1`);
  } finally {
    await copy.drop();
  }
});

test('a model change Cube compiles is published, and Cube serves it', async ({
  page,
}, testInfo) => {
  // On a cube file of this browser's own: the browsers publish at once.
  const cube = `e2e_described_${testInfo.project.name}`;
  const path = await ownCubeFile(page.request, cube);
  const description = `Every product the shop sells, as ${testInfo.project.name} saw it.`;
  // Changed in its copy in My workspace, and published when that is approved (T451's switch).
  const copy = await ownCopy(page, path);
  try {
    await page.goto(copy.href);
    const form = page.getByRole('region', { name: `Cube ${cube}` });
    await form.getByLabel('Description', { exact: true }).fill(description);

    await page.getByRole('button', { name: 'Save', exact: true }).click();

    await expect(page.getByRole('status').filter({ hasText: 'Saved' })).toHaveText(
      'Saved. Previews in My workspace use it now.',
      PUBLISHED,
    );
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
    // Said once, in the head's one 44 px line, however long the path (T479's review).
    const head = page.getByRole('region', { name: 'Form editor' }).locator('.model-editor__head');
    expect(Math.round((await head.boundingBox())?.height ?? 0)).toBe(44);
    await expect(head.locator('.model-editor__state')).toHaveCount(0);

    await copy.land();
    const stored = await modelFilesIn(page.request, 'root');
    expect(stored.find((file) => file.path === path)?.content).toContain(
      `description: ${description}`,
    );
    const meta = (await (await page.request.get('/api/meta')).json()) as {
      cubes: { name: string; description?: string }[];
    };
    expect(meta.cubes.find((each) => each.name === cube)?.description).toBe(description);
  } finally {
    await copy.drop();
  }
});

/**
 * T144 / AC-138: WHEN the user opens the join editor for a cube, THE SYSTEM
 * SHALL show the join graph with each relationship's direction and let the
 * user add a join by choosing the target cube, the relationship and the
 * condition.
 * Fails when: the diagram omits a declared join, or shows a direction the
 * model does not declare.
 */
test('the join diagram draws each declared join its way, and adds one', async ({
  page,
}, testInfo) => {
  // The seed model: orders declares its joins to customers and products.
  await page.goto('/model/files/cubes%2Forders.yml');
  await page
    .getByRole('group', { name: 'Right pane view' })
    .getByRole('button', { name: 'Join diagram' })
    .click();
  const diagram = page.getByRole('img', { name: /^Join diagram/ });
  for (const to of ['customers', 'products']) {
    const edge = diagram.locator(`[data-join="orders→${to}"]`);
    await expect(edge).toHaveText('many to one');
    // It ends on the named cube's box, where the arrowhead is — not on orders'.
    // Its path, `M x y Q cx cy x2 y2`: where it ends is the last point. Read
    // with the box in one look: other workers' cubes, published meanwhile,
    // lay the diagram out again between two reads (T447).
    const line = edge.locator('.join-editor__edge');
    const { d, x, y, w, h } = await diagram.evaluate((svg, cube) => {
      const rect = svg.querySelector(`[data-cube="${cube}"] rect`);
      return {
        d:
          svg.querySelector(`[data-join="orders→${cube}"] .join-editor__edge`)?.getAttribute('d') ??
          '',
        x: rect?.getAttribute('x'),
        y: rect?.getAttribute('y'),
        w: rect?.getAttribute('width'),
        h: rect?.getAttribute('height'),
      };
    }, to);
    const [x2, y2] = (d.match(/-?\d+(?:\.\d+)?/g) ?? []).slice(-2);
    expect(Number(x2)).toBeGreaterThanOrEqual(Number(x) - 1);
    expect(Number(x2)).toBeLessThanOrEqual(Number(x) + Number(w) + 1);
    expect(Number(y2)).toBeGreaterThanOrEqual(Number(y) - 1);
    expect(Number(y2)).toBeLessThanOrEqual(Number(y) + Number(h) + 1);
    await expect(line).toHaveAttribute('marker-end', 'url(#join-arrow)');
  }
  const joins = page.getByRole('list', { name: 'Joins' });
  await expect(joins).toContainText('orders → customers, many to one');
  await expect(joins).toContainText('orders → products, many to one');

  // Adding one, on a cube file of this browser's own: target, relationship,
  // condition. In its copy in My workspace (T451's switch), its joins may name
  // the cubes of the folder it goes to, the root's here.
  const cube = `e2e_joins_${testInfo.project.name}`;
  const path = await ownCubeFile(page.request, cube);
  const copy = await ownCopy(page, path);
  try {
    await page.goto(copy.href);
    await page
      .getByRole('group', { name: 'Right pane view' })
      .getByRole('button', { name: 'Join diagram' })
      .click();
    const add = page.getByRole('form', { name: `Add a join to ${cube}` });
    await add.getByLabel('Target cube', { exact: true }).selectOption('customers');
    await add.getByLabel('Relationship', { exact: true }).selectOption('many_to_one');
    await add.getByLabel('Condition', { exact: true }).fill('{CUBE}.id = {customers}.id');
    await add.getByRole('button', { name: 'Add join' }).click();

    await expect(page.getByRole('list', { name: 'Joins' })).toContainText(
      `${cube} → customers, many to one`,
    );
    await expect(
      page.getByRole('img', { name: /^Join diagram/ }).locator(`[data-join="${cube}→customers"]`),
    ).toBeVisible();
    // And in the file: the form's edit, written into the YAML.
    await page
      .getByRole('group', { name: 'Right pane view' })
      .getByRole('button', { name: 'YAML' })
      .click();
    const yaml = page.getByRole('textbox', { name: `${path}, as YAML` });
    await expect(yaml).toContainText('- name: customers');
    // `yaml` quotes a new string with braces in double quotes.
    await expect(yaml).toContainText('sql: "{CUBE}.id = {customers}.id"');
    await expect(yaml).toContainText('relationship: many_to_one');
  } finally {
    await copy.drop();
  }
});

/**
 * T147 / AC-141: WHEN the user edits a member that charts use, THE SYSTEM
 * SHALL list the charts and dashboards that reference it before saving.
 * Fails when: a referencing chart is missing from that list. As amended
 * (R55, T546): a model saved in My workspace lists the shared charts and
 * dashboards that landing it would change, naming the folder it goes to.
 *
 * On the seed data: `orders.count` is used by the seed charts. In the single
 * user's copy of orders.yml, going to the root; cancelled, so the copy every
 * other test opens is never changed.
 */
test('a save that edits a member charts use lists them first, and saves only if told', async ({
  page,
}) => {
  const copy = await myModelCopy(page.request, 'cubes/orders.yml');
  await page.goto(copy.href);
  const form = page.getByRole('region', { name: 'Cube orders' });
  await form.getByRole('tab', { name: /^Measures/ }).click();
  await form.locator('.model-member__name', { hasText: /^count$/ }).click();
  const count = form
    .getByRole('listitem')
    .filter({ has: page.locator('.model-member__name', { hasText: /^count$/ }) });
  await count
    // In its named group (T236, AC-225).
    .locator(
      '.model-member > .model-form__fields > .model-form__group > .model-form__fields > [data-key="title"]',
    )
    .getByLabel('Title', { exact: true })
    .fill('Order lines');

  await page.getByRole('button', { name: 'Save', exact: true }).click();

  const warning = page.getByRole('alert').filter({ hasText: 'this changes members that' });
  // Landing it in the root would change them: the folder named by its path.
  await expect(warning.locator('.model-references__lead')).toHaveText(
    /^Landed in Shared, this changes members that \d+ charts? and \d+ dashboards? use\.$/,
  );
  // The seed charts on orders.count, each a link to it, saying what it uses.
  // The seeded dashboard's own, by where they link: the single user's copy
  // of that dashboard has charts and a title of the same names (T359, AC-254).
  const seeded = (list: string) =>
    warning
      .getByRole('list', { name: list })
      .getByRole('listitem')
      .filter({ has: page.locator('a[href="/explore/dashboards/seed-root-dashboard-1"]') });
  const charts = seeded('Charts');
  await expect(charts.filter({ hasText: 'Orders by category and status' })).toHaveText(
    'Orders by category and status — uses orders.count',
  );
  await expect(charts.filter({ hasText: 'Orders over time by status' })).toHaveText(
    'Orders over time by status — uses orders.count',
  );
  // Kept on its dashboard, it opens there.
  await expect(charts.getByRole('link', { name: 'Orders by category and status' })).toHaveAttribute(
    'href',
    '/explore/dashboards/seed-root-dashboard-1',
  );
  // And the dashboard drawing it on a tile.
  await expect(seeded('Dashboards').filter({ hasText: 'Company dashboard 01' })).toHaveText(
    'Company dashboard 01 — uses orders.count',
  );
  // Nothing saved yet: the copy, and the root's file, as they were.
  const stored = async () =>
    [
      ...(await modelFilesIn(page.request, copy.folderId)),
      ...(await modelFilesIn(page.request, 'root')),
    ]
      .filter((file) => file.path === 'cubes/orders.yml')
      .map((file) => file.content)
      .join('\n');
  expect(await stored()).not.toContain('Order lines');

  await warning.getByRole('button', { name: 'Cancel' }).click();
  await expect(warning).toHaveCount(0);
  expect(await stored()).not.toContain('Order lines');
});

/**
 * T146 / AC-140: WHEN a model file uses Jinja, Python or JavaScript
 * generation, THE SYSTEM SHALL open it read-only in the code view and say
 * why it cannot be edited as a form.
 * Fails when: such a file opens in an editable form, or gives no reason.
 *
 * On the seed model's own template, `cubes/templated_example.yml`, kept in
 * wechart's store and never sent to xcube (T446, AC-335).
 */
test('a Jinja template opens read-only in the code view, with the reason', async ({ page }) => {
  await page.goto('/model/files/cubes%2Ftemplated_example.yml');

  // Never served: the model is plain YAML alone (T447, AC-335), said without xcube (D3, T483).
  await expect(page.getByRole('note')).toContainText(
    'Jinja template: wechart publishes plain YAML only, so this template is never rendered or served',
  );
  await expect(page.getByRole('note')).toContainText('It opens read-only here');
  const code = page.getByRole('textbox', { name: 'cubes/templated_example.yml, read-only' });
  await expect(code).toContainText('{%- set table = "public.products" %}');
  await expect(code).toHaveAttribute('aria-readonly', 'true');
  await expect(code).not.toHaveAttribute('contenteditable', 'true');
  // No form, nothing to save, and typing changes nothing.
  await expect(page.getByRole('region', { name: /^Cube / })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Save & reload Cube' })).toHaveCount(0);
  await code.click();
  await page.keyboard.type('xyz');
  await expect(code).not.toContainText('xyz');

  // The catalogue that was the seed's template is plain YAML now (T446), in
  // the model and answering queries.
  const meta = (await (await page.request.get('/api/meta')).json()) as {
    cubes: { name: string }[];
  };
  expect(meta.cubes.map((cube) => cube.name)).toContain('product_catalog');
  await page.goto('/model/files/cubes%2Fproduct_catalog.yml');
  await expect(page.getByRole('region', { name: 'Cube product_catalog' })).toBeVisible();
  await expect(page.getByText('It opens read-only here')).toHaveCount(0);
  const counted = await page.request.post('/api/load', {
    data: { query: { measures: ['product_catalog.count'] } },
  });
  expect(counted.status()).toBe(200);
  const rows = ((await counted.json()) as { data: Record<string, unknown>[] }).data;
  expect(Number(rows[0]?.['product_catalog.count'])).toBeGreaterThan(0);
});

/**
 * T141 / AC-135: IF the YAML fails to parse, THEN THE SYSTEM SHALL name the
 * file and line in a problems list and keep the form read-only until it
 * parses (direction.md rule 28).
 * Fails when: the form stays editable on unparseable YAML, or the problem
 * names no line.
 */
test('YAML that does not parse is listed by file and line, and holds the form read-only', async ({
  page,
}) => {
  await page.goto(await ordersCopy(page));
  const form = page.getByRole('region', { name: 'Cube orders' });
  const problems = page.getByRole('region', { name: 'Problems' });
  const title = form.getByLabel('Title', { exact: true });
  await expect(problems).toContainText('No problems in cubes/orders.yml');
  await expect(title).toBeEditable();

  // Line 3 of the seeded file: `sql_table: public.orders`, made a nested mapping.
  await page.locator('.cm-line', { hasText: 'sql_table: public.orders' }).click();
  await page.keyboard.press('End');
  await page.keyboard.type(': x');

  const problem = problems.getByRole('listitem');
  await expect(problem).toHaveCount(1);
  await expect(problem.locator('.model-problems__where')).toHaveText('cubes/orders.yml:3');
  await expect(problem).toContainText('Nested mappings are not allowed in compact mappings');
  await expect(page.getByRole('status').filter({ hasText: 'read-only' })).toContainText('line 3');
  // Every field locked, not only the one shown: a member's too.
  await expect(title).toBeDisabled();
  await form.getByRole('tab', { name: /^Measures/ }).click();
  await form.locator('.model-member__name', { hasText: /^total_amount$/ }).click();
  await expect(
    form.getByRole('tabpanel').locator('input, select, textarea').first(),
  ).toBeDisabled();
  expect(
    await form
      .getByRole('tabpanel')
      .locator('input:enabled, select:enabled, textarea:enabled')
      .count(),
  ).toBe(0);
  // The editor marks it where it is: the one mark is on line 3.
  await expect(page.locator('.cm-lintRange-error')).toHaveCount(1);
  await expect(
    page
      .locator('.cm-line', { hasText: 'sql_table: public.orders: x' })
      .locator('.cm-lintRange-error'),
  ).toHaveCount(1);

  // Picking the problem puts the cursor on its line — from another line, so
  // the mend below lands only if it did — and mending it frees the form.
  await page.locator('.cm-line', { hasText: 'description: One row' }).click();
  await problem.getByRole('button').click();
  await page.keyboard.press('End');
  for (let i = 0; i < 3; i += 1) await page.keyboard.press('Backspace');
  await expect(problems).toContainText('No problems in cubes/orders.yml');
  await expect(page.getByRole('status').filter({ hasText: 'read-only' })).toHaveCount(0);
  await form.getByRole('tab', { name: 'General' }).click();
  await expect(title).toBeEditable();
  await expect(form.getByLabel('SQL table', { exact: true })).toHaveValue('public.orders');
});

test('typing that never pauses still reaches the form within 500 ms', async ({ page }) => {
  // T139's review: a pause-only wait held the form as long as the typing went on.
  await page.goto(await ordersCopy(page));
  const table = page
    .getByRole('region', { name: 'Cube orders' })
    .getByLabel('SQL table', { exact: true });
  await expect(table).toHaveValue('public.orders');
  await page.locator('.cm-line', { hasText: 'sql_table: public.orders' }).click();
  await page.keyboard.press('End');

  // A key every 150 ms for 1.5 s, each under the 300 ms pause; every text parses.
  const typing = page.keyboard.type('_abcdefghij', { delay: 150 });
  await expect(table).toHaveValue(/^public\.orders_/, { timeout: 500 });
  await typing;
});

test('an entry typed as far as its dash is waited for, not a crash', async ({ page }) => {
  // T139's review: `- ` parses as null, and the form read it as an object.
  await page.goto(await ordersCopy(page));
  const form = page.getByRole('region', { name: 'Cube orders' });
  await form.getByRole('tab', { name: /^Measures/ }).click();
  await page.locator('.cm-line', { hasText: /^\s+measures:$/ }).click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('- ');

  // The pause passes, and the page still stands: the null is a member with no keys yet.
  await expect(
    form.getByRole('list', { name: 'Measures' }).locator('.model-member__name'),
  ).toContainText(['Measure 1']);
  await expect(page.getByRole('textbox', { name: 'cubes/orders.yml, as YAML' })).toBeVisible();
});

/**
 * T138 / AC-132: THE SYSTEM SHALL offer a form for every key Cube's validator
 * accepts on a cube or a view, with enumerations offering exactly the
 * validator's allowed values.
 * Fails when: a key the validator accepts has no form field, or an
 * enumeration offers a value the validator rejects.
 *
 * `form/schema.test.ts` holds every key to the research's inventory; here,
 * the real file opened on its form.
 */
test('a model file opens on a form for its cube, its enumerations the validator’s own', async ({
  page,
}) => {
  await page.goto('/model');
  await page.getByRole('link', { name: 'cubes/orders.yml' }).click();
  await expect(page.getByTestId('selected-object')).toHaveText('cubes/orders.yml');

  const form = page.getByRole('region', { name: 'Cube orders' });
  await expect(form.getByLabel('SQL table', { exact: true })).toHaveValue('public.orders');
  // The refresh key's own fields, in General's Refresh group (T481, design 03 state B).
  await expect(
    form.getByRole('group', { name: 'Refresh' }).getByLabel('Every', { exact: true }),
  ).toBeVisible();

  await form.getByRole('tab', { name: /^Measures/ }).click();
  await form.locator('.model-member__name', { hasText: /^total_amount$/ }).click();
  // Its own row: another's drill-member picker names total_amount too (AC-224).
  const measure = form
    .getByRole('listitem')
    .filter({ has: page.locator('.model-member__name', { hasText: /^total_amount$/ }) });
  const type = measure.locator('[data-key="type"]').first().getByLabel('Type', { exact: true });
  await expect(type).toHaveValue('sum');
  expect(
    (await type.locator('option').allTextContents()).filter((option) => option !== '(not set)'),
  ).toEqual([
    'count',
    'number',
    'string',
    'boolean',
    'time',
    'sum',
    'avg',
    'min',
    'max',
    'count_distinct',
    'count_distinct_approx',
    // Not `number_agg` or `rank`: Joi takes those only on a multi-stage
    // measure (research §Y.17), and total_amount is not one.
  ]);
  await expect(measure.locator('[data-key="format"]').getByRole('textbox')).toHaveValue('currency');

  await form.getByRole('tab', { name: /^Joins/ }).click();
  await form.locator('.model-member__name', { hasText: /^customers$/ }).click();
  const relationship = form
    .getByRole('listitem')
    .filter({ has: page.locator('.model-member__name', { hasText: /^customers$/ }) })
    .getByLabel('Relationship', { exact: true });
  await expect(relationship).toHaveValue('many_to_one');
  expect(
    (await relationship.locator('option').allTextContents()).filter((o) => o !== '(not set)'),
  ).toEqual([
    'many_to_one',
    'one_to_many',
    'one_to_one',
    // Also accepted by the validator (research Y.5), offered apart.
    'belongs_to',
    'has_many',
    'has_one',
    'manyToOne',
    'oneToMany',
    'oneToOne',
    'belongsTo',
    'hasMany',
    'hasOne',
  ]);
});

/**
 * T234 / AC-222: WHILE the Model workspace is open, THE SYSTEM SHALL show a
 * tree of the model's files beside the editor, open the chosen file in place
 * with its path in the URL, offer New cube and New view from the tree, and
 * mark each file that has problems.
 * `Fails when: moving to another file requires leaving the editor, New cube or
 * New view is missing, or a file with an error carries no mark in the tree.`
 *
 * AC-223: THE SYSTEM SHALL lay the model editor out as full-height panes,
 * each with its own header row and scrolling — the form, and the code with
 * its Problems panel docked beneath it counting errors and warnings — with
 * code and file paths in direction.md's code face.
 * `Fails when: the page itself scrolls at 1,440 × 900, Problems gives no count
 * of warnings, or code is set in a face other than IBM Plex Mono.`
 */
test('Model is one workspace: a tree beside full-height form and code panes, Problems docked', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  // The shared root's model, read-only: its tree, its panes, and another file in place.
  await page.goto('/model/files/cubes%2Forders.yml');
  const tree = page.getByRole('navigation', { name: 'Model files' });
  const yaml = page.getByRole('textbox', { name: 'cubes/orders.yml, as YAML' });
  await expect(yaml).toContainText('sql_table: public.orders');
  await expect(tree.getByRole('link', { name: /^orders\.yml/ })).toHaveAttribute(
    'aria-current',
    'page',
  );

  // AC-223: the page does not scroll; the panes do, each under its header.
  const scrolls = await page.evaluate(() => {
    const root = document.scrollingElement ?? document.documentElement;
    return root.scrollHeight > root.clientHeight;
  });
  expect(scrolls).toBe(false);
  const form = page.getByRole('region', { name: 'Form editor' });
  const code = page.getByRole('region', { name: 'YAML and join diagram' });
  for (const pane of [form, code]) {
    const box = await pane.boundingBox();
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeGreaterThan(900 - 24);
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(900);
  }
  await expect(form.locator('.model-editor__head')).toContainText('cubes/orders.yml');
  await expect(code.getByRole('group', { name: 'Right pane view' })).toBeVisible();
  // Problems beneath the code, counting warnings as well as errors.
  const problems = code.getByRole('region', { name: 'Problems' });
  await expect(problems.getByRole('heading')).toHaveText('Problems · 0 errors · 0 warnings');
  // Docked: below where the code ends, not merely below where it starts.
  const editor = code.locator('.cm-editor');
  const [codeBox, problemsBox] = [await editor.boundingBox(), await problems.boundingBox()];
  expect(problemsBox?.y ?? 0).toBeGreaterThanOrEqual(
    Math.floor((codeBox?.y ?? 0) + (codeBox?.height ?? 0)),
  );
  // Each pane scrolls on its own: the form is longer than its pane. A file of
  // one cube scrolls its panel, under tabs that stay put (T470's review) —
  // every dimension open, since General, grouped (T481), fits.
  const formBody = form.locator('.model-form__panel');
  await form.getByRole('tab', { name: /^Dimensions/ }).click();
  for (const summary of await formBody.locator('details.model-member > summary').all())
    await summary.click();
  await formBody.evaluate((node) => {
    node.scrollTop = 200;
  });
  expect(await formBody.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
  expect(await page.evaluate(() => document.scrollingElement?.scrollTop ?? 0)).toBe(0);
  // Code and paths in the code face.
  for (const set of [page.locator('.cm-content'), form.locator('.model-editor__path')])
    expect(await set.first().evaluate((node) => getComputedStyle(node).fontFamily)).toMatch(
      /^"?IBM Plex Mono"?,/,
    );

  // AC-222: another file, opened in place — the page never reloads.
  await page.evaluate(() => {
    (window as unknown as { stayed?: boolean }).stayed = true;
  });
  await tree.getByRole('link', { name: /^customers\.yml/ }).click();
  await expect(page).toHaveURL(/\/model\/files\/cubes%2Fcustomers\.yml$/);
  await expect(page.getByRole('textbox', { name: 'cubes/customers.yml, as YAML' })).toContainText(
    'name: customers',
  );
  expect(await page.evaluate(() => (window as unknown as { stayed?: boolean }).stayed)).toBe(true);
  // Shared: nothing made here (T451's switch; AC-222's "offered in a shared folder").
  for (const name of [/New cube/, /New view/])
    await expect(tree.getByRole('button', { name })).toHaveCount(0);

  // In My workspace, a folder of two files of this browser's own, going to the root.
  const project = testInfo.project.name;
  const [a, b] = [`e2e_tree_a_${project}`, `e2e_tree_b_${project}`];
  const yamlOf = (name: string) => `cubes:\n  - name: ${name}\n    sql_table: public.products\n`;
  const own = await inMyWorkspace(page.request, 'root', [
    { path: `cubes/${a}.yml`, content: yamlOf(a) },
    { path: `cubes/${b}.yml`, content: yamlOf(b) },
  ]);
  const folder = own.folderOf(`cubes/${a}.yml`);
  try {
    await page.goto(`/explore/folders/${folder}/models/${encodeURIComponent(`cubes/${b}.yml`)}`);
    await expect(page.getByRole('textbox', { name: `cubes/${b}.yml, as YAML` })).toContainText(
      `name: ${b}`,
    );

    // A file that stops parsing is marked in the tree, in words.
    await page.locator('.cm-line', { hasText: 'sql_table:' }).first().click();
    await page.keyboard.press('End');
    await page.keyboard.type(': x');
    await expect(tree.getByRole('link', { name: new RegExp(`^${b}\\.yml`) })).toContainText(
      'problems',
    );
    await expect(tree.getByRole('link', { name: new RegExp(`^${a}\\.yml`) })).not.toContainText(
      'problems',
    );

    // New cube and New view: a file of its own, going where it is asked to
    // (AC-282), open, and said to be unpublished — once the broken file's
    // edit is let go, which it asks about first (AC-226).
    await tree.getByRole('button', { name: 'New cube' }).click();
    const asking = (kind: string) =>
      page.getByRole('dialog', { name: `New ${kind} in My workspace` });
    await asking('cube').getByRole('combobox', { name: 'Target folder' }).selectOption('root');
    await asking('cube').getByRole('button', { name: 'Create' }).click();
    await page
      .getByRole('alertdialog', { name: 'Leave with unpublished changes?' })
      .getByRole('button', { name: 'Leave without publishing' })
      .click();
    await expect(page).toHaveURL(
      new RegExp(`/explore/folders/${folder}/models/cubes%2Fnew_cube_1\\.yml$`),
    );
    await expect(
      page.getByRole('textbox', { name: 'cubes/new_cube_1.yml, as YAML' }),
    ).toContainText('name: new_cube_1');
    await expect(tree.getByRole('link', { name: /^new_cube_1\.yml/ })).toContainText('unpublished');
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeEnabled();
    await tree.getByRole('button', { name: 'New view' }).click();
    await asking('view').getByRole('combobox', { name: 'Target folder' }).selectOption('root');
    await asking('view').getByRole('button', { name: 'Create' }).click();
    await expect(page).toHaveURL(
      new RegExp(`/explore/folders/${folder}/models/views%2Fnew_view_1\\.yml$`),
    );
    // The cube made first is still there to come back to.
    await expect(tree.getByRole('link', { name: /^new_cube_1\.yml/ })).toBeVisible();
  } finally {
    await own.drop();
  }
});

/**
 * AC-138's diagram in the pane it is drawn in, which the Superset parity run
 * found clipped: "The join diagram clips nodes at the right edge". It was
 * sized for a circle plus a spare band whatever the pane, so its right-hand
 * boxes lay past the pane's edge, behind a scrollbar the Mac doesn't show.
 */
test('the join diagram fits its pane’s width, every box in view', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/model/files/cubes%2Forders.yml');
  await page
    .getByRole('group', { name: 'Right pane view' })
    .getByRole('button', { name: 'Join diagram' })
    .click();
  const diagram = page.getByRole('img', { name: /^Join diagram/ });
  await expect(diagram.locator('[data-cube="customers"]')).toBeVisible();

  const canvas = page.locator('.join-editor__canvas');
  await expect(async () => {
    const [scroll, client] = await canvas.evaluate((element) => [
      element.scrollWidth,
      element.clientWidth,
    ]);
    expect(scroll).toBeLessThanOrEqual(client);
  }).toPass({ timeout: 5_000 });
  const shown = await canvas.boundingBox();
  for (const box of await diagram.locator('[data-cube] rect').all()) {
    const drawn = await box.boundingBox();
    expect(drawn?.x).toBeGreaterThanOrEqual(shown?.x ?? Infinity);
    expect((drawn?.x ?? Infinity) + (drawn?.width ?? 0)).toBeLessThanOrEqual(
      (shown?.x ?? 0) + (shown?.width ?? 0),
    );
  }
});

/**
 * AC-222 from the overview, which the Superset parity run found lost: there
 * no file is open, and opening the new one leaves the overview's page for the
 * file's — so what New cube made must outlive the page that made it.
 */
test('New cube and New view from the overview open their new file', async ({ page }) => {
  // My workspace's overview: where the single user makes a model now (T451's switch).
  const overview = '/explore/folders/mine/models';
  const made = async (kind: 'cube' | 'view') => {
    const asking = page.getByRole('dialog', { name: `New ${kind} in My workspace` });
    await asking.getByRole('combobox', { name: 'Target folder' }).selectOption('root');
    await asking.getByRole('button', { name: 'Create' }).click();
  };
  await page.goto(overview);
  const tree = page.getByRole('navigation', { name: 'Model files' });
  await tree.getByRole('button', { name: 'New cube' }).click();
  await made('cube');
  await expect(page).toHaveURL(/\/explore\/folders\/mine\/models\/cubes%2Fnew_cube_\d+\.yml$/);
  await expect(
    page.getByRole('textbox', { name: /^cubes\/new_cube_\d+\.yml, as YAML$/ }),
  ).toContainText('name: new_cube_');
  await expect(tree.getByRole('link', { name: /^new_cube_\d+\.yml/ })).toContainText('unpublished');

  await page.goto(overview);
  await tree.getByRole('button', { name: 'New view' }).click();
  await made('view');
  await expect(page).toHaveURL(/\/explore\/folders\/mine\/models\/views%2Fnew_view_\d+\.yml$/);
  await expect(
    page.getByRole('textbox', { name: /^views\/new_view_\d+\.yml, as YAML$/ }),
  ).toContainText('name: new_view_');
});

/**
 * T236 / AC-225: THE SYSTEM SHALL show each member in a row with its name,
 * its type, a preview of its SQL and badges for primary key, public and
 * format, and when expanded, only the fields that apply to its type and to
 * how it is defined, in named groups.
 * `Fails when: a collapsed row omits its type or SQL, a primary key carries no
 * badge, or an expanded number dimension offers fields for a CASE, a switch or
 * a geographic point.`
 */
test('a member’s row shows its type, SQL and badges, and opens on the fields that apply', async ({
  page,
}) => {
  await page.goto('/model/files/cubes%2Forders.yml');
  const form = page.getByRole('region', { name: 'Cube orders' });
  await form.getByRole('tab', { name: /^Dimensions/ }).click();
  const id = form
    .getByRole('listitem')
    .filter({ has: page.locator('.model-member__name', { hasText: /^id$/ }) });

  // Collapsed: its type, its SQL, its primary-key badge.
  await expect(id.locator('.model-member__type')).toHaveText('number');
  await expect(id.locator('.model-member__sql')).toHaveText('id');
  await expect(id.locator('.model-member__sql')).toBeVisible();
  // The seed's id is made public, which design 03 badges (T480).
  await expect(id.locator('.model-member__badge')).toHaveText(['PK', 'public']);
  // Its caret says it opens, and then that it is open.
  const caret = () =>
    id
      .locator('.model-member > summary')
      .evaluate((summary) => getComputedStyle(summary, '::before').content.slice(0, 3));
  expect(await caret()).toBe('"▸"');

  // Expanded: its groups, and none for a CASE, a switch or a point.
  await id.locator('.model-member__name').click();
  expect(await caret()).toBe('"▾"');
  const groups = id.locator('.model-form__group');
  await expect(groups.first()).toHaveAccessibleName('Basics');
  const named = await groups.locator('.model-form__group-title').allTextContents();
  expect(named).toContain('Formatting');
  for (const absent of ['CASE / WHEN', 'Switch', 'Geography', 'Time'])
    expect(named).not.toContain(absent);
  await expect(id.getByLabel('Latitude', { exact: true })).toHaveCount(0);
  await expect(id.getByLabel('Values', { exact: true })).toHaveCount(0);
  await expect(id.getByRole('group', { name: 'Case' })).toHaveCount(0);
});

/**
 * T234 / AC-223, its code face: `Fails when: … code is set in a face other
 * than IBM Plex Mono.` Named in the CSS is not drawn in it: a machine without
 * the face installed drew the fallback. So the face is served with the app —
 * IBM's own file, unmodified, as the user chose (2026-09-24;
 * docs/research/ibm-plex-mono.md) — and this checks that it loaded, that the
 * app served it, and that its bytes are IBM's.
 */
test('code is drawn in IBM Plex Mono, served with the app as IBM ships it', async ({ page }) => {
  const served: string[] = [];
  page.on('response', (response) => {
    if (/IBMPlexMono-Regular-[^/]*\.woff2$/.test(response.url()) && response.ok())
      served.push(response.url());
  });
  await page.goto('/model/files/cubes%2Forders.yml');
  const code = page.locator('.cm-content');
  await expect(code).toBeVisible();
  expect(await code.evaluate((node) => getComputedStyle(node).fontFamily)).toMatch(
    /^"?IBM Plex Mono"?,/,
  );

  // Loaded — the face the CSS names, from the file the app serves (no
  // local(), so an installed copy cannot stand in for it).
  const loaded = await page.evaluate(async () => {
    await document.fonts.ready;
    return [...document.fonts]
      .filter((face) => face.family.replace(/["']/g, '') === 'IBM Plex Mono')
      .filter((face) => face.status === 'loaded')
      .map((face) => `${face.weight === 'normal' ? '400' : face.weight} ${face.style}`);
  });
  expect(loaded).toContain('400 normal');
  expect(served.length).toBeGreaterThan(0);
  expect(new URL(served[0] ?? '').origin).toBe(new URL(page.url()).origin);

  // Unmodified: IBM's own bytes (the research's hash of the package's file).
  const bytes = await (await page.request.get(served[0] ?? '')).body();
  expect(createHash('sha256').update(bytes).digest('base64')).toBe(
    'uiBEl/FrbTNM7p0eljqDG3PjpW4dYwCoSJ0Y33IUs1A=',
  );
});

/**
 * The face's notice and licence travel with it (OFL condition 2;
 * ibm-plex-mono.md, Licensing): the stylesheet names the licence, and the
 * app serves IBM's text as a file of its own — not inlined into the comment,
 * where it would be no file at all (T243's review).
 */
test('the code face’s licence is served with it, and its notice names it', async ({ page }) => {
  await page.goto('/model/files/cubes%2Forders.yml');
  await expect(page.locator('.cm-content')).toBeVisible();

  const named = await page.evaluate(() => {
    const sheet = [...document.querySelectorAll('style')]
      .map((style) => style.textContent ?? '')
      .find((text) => text.includes('SIL Open Font License'));
    return /Version 1\.1: (\S+) \*\//.exec(sheet ?? '')?.[1] ?? '';
  });
  expect(named).toMatch(/^\/.*LICENSE[^/]*\.txt$/);

  const licence = await page.request.get(named);
  expect(licence.status()).toBe(200);
  const text = await licence.text();
  expect(text.startsWith('Copyright © 2017 IBM Corp. with Reserved Font Name "Plex"')).toBe(true);
  expect(text).toContain('SIL OPEN FONT LICENSE Version 1.1');
});
