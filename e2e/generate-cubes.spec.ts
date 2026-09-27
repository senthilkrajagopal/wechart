import { expect, test, type Locator, type Page } from '@playwright/test';

/**
 * T145 / AC-139: WHEN the user generates cubes from a data source, THE SYSTEM
 * SHALL browse that connection's schemas and tables and create a cube per
 * selected table with its columns mapped to dimensions and a count measure.
 * `Fails when: a selected table produces no cube, or a column is dropped
 * without saying so.`
 *
 * T275 / AC-250's other half: `… or a response to the browser carries a token
 * that has it.` Every answer the page gets while browsing is read for one.
 *
 * Through the compose Cube — the user's fork (T275) — from the sample
 * database's `generate` schema, whose pair of tables per browser project
 * (infra/sample-db/generate.sql) each project generates on its own: cube names
 * are global to the model, and the projects run at the same time.
 *
 * In design 11's pane (T485): Source, Tables, Review.
 */

/** Opens the pane from the tree, and goes to a schema's tables. */
async function toTables(page: Page, schema: string, search: string) {
  await page.goto('/model');
  await page
    .getByRole('navigation', { name: 'Model files' })
    .getByRole('button', { name: 'Generate from a data source…' })
    .click();
  const pane = page.getByRole('dialog', { name: 'Generate cubes' });
  await expect(pane.getByRole('radio', { name: 'default PostgreSQL' })).toBeChecked();
  await pane.getByRole('radio', { name: schema, exact: true }).check();
  await pane.getByRole('button', { name: 'Next: Tables' }).click();
  await pane.getByRole('searchbox', { name: 'Search tables' }).fill(search);
  return { pane, tables: pane.getByRole('table', { name: `Tables in ${schema}` }) };
}

/** A generated file's YAML, opened and in view: the code view draws what is near it. */
async function yamlOf(file: Locator): Promise<Locator> {
  const details = file.locator(':scope > details');
  if ((await details.getAttribute('open')) === null)
    await details.locator(':scope > summary').click();
  await file.locator('.generate-pane__yaml > summary').click();
  const yaml = file.getByRole('textbox', { name: /, as generated$/ });
  await yaml.scrollIntoViewIfNeeded();
  return yaml;
}

/** The columns a generated file left out: name, database type and reason. */
const leftOut = (file: Locator) =>
  file
    .getByRole('list', { name: 'Columns left out' })
    .getByRole('listitem')
    .evaluateAll((items) =>
      items.map((item) =>
        ['.generate-pane__left-name', '.generate-pane__raw', '.generate-pane__why']
          .map((part) => item.querySelector(part)?.textContent)
          .join(' | '),
      ),
    );

test('a data source’s tables become cubes, each column mapped or said to be left out, and published they answer', async ({
  page,
  request,
}, testInfo) => {
  const project = testInfo.project.name;
  const stores = `${project}_stores`;
  const visits = `${project}_visits`;
  const answers: string[] = [];
  page.on('response', async (response) => {
    if (response.url().includes('/api/introspection/'))
      answers.push(await response.text().catch(() => ''));
  });

  const { pane, tables } = await toTables(page, 'generate', `${project}_`);
  await expect(tables.getByRole('checkbox')).toHaveCount(2);

  // A look at the visits' columns, in place: its key, and the foreign key to the stores.
  await tables.getByRole('button', { name: `Columns of ${visits}` }).click();
  const columns = tables.getByRole('table', { name: `Columns of ${visits}` });
  await expect(columns.getByRole('row', { name: /^store_id/ })).toContainText(`→ ${stores}.id`);
  await expect(columns.getByRole('row', { name: /^id / })).toContainText('Primary key');

  await tables.getByRole('checkbox', { name: stores }).check();
  await tables.getByRole('checkbox', { name: visits }).check();
  await pane.getByRole('button', { name: 'Generate 2 cubes' }).click();

  // A cube per table: its keys and strings and times as dimensions, a count,
  // and its measure-named number as a sum; every other column said and why.
  const storesCube = pane.getByRole('region', { name: `cubes/${stores}.yml` });
  await expect(storesCube.locator('.generate-pane__status')).toHaveText('Ready');
  const storesYaml = await yamlOf(storesCube);
  await expect(storesYaml).toContainText(`name: ${stores}`);
  await expect(storesYaml).toContainText('sql_table: generate.');
  for (const member of [
    'name: id',
    'primary_key: true',
    'name: name',
    'name: city',
    'name: opened_at',
    'type: count',
  ])
    await expect(storesYaml).toContainText(member);
  expect(await leftOut(storesCube)).toEqual([
    'floor_area | numeric | a number, neither a key nor named like a measure',
  ]);
  const visitsCube = pane.getByRole('region', { name: `cubes/${visits}.yml` });
  const visitsYaml = await yamlOf(visitsCube);
  for (const member of [
    `name: ${stores}`,
    'relationship: many_to_one',
    'name: visited_at',
    'type: count',
    'name: spend_amount',
    'type: sum',
  ])
    await expect(visitsYaml).toContainText(member);
  expect(await leftOut(visitsCube)).toEqual([
    'store_id | integer | a number, neither a key nor named like a measure',
    'visitors | integer | a number, neither a key nor named like a measure',
    '_loaded_at | timestamp with time zone | its name starts with an underscore',
  ]);

  // Published together, as any model change is, and opened in the tree.
  await pane.getByRole('button', { name: 'Publish 2 cubes' }).click();
  await expect(pane.getByText('Published 2 cubes.')).toBeVisible({ timeout: 30_000 });
  await pane.getByRole('button', { name: `Open cubes/${stores}.yml` }).click();
  await expect(page).toHaveURL(new RegExp(`/model/files/cubes%2F${stores}\\.yml$`));
  await expect(page.getByRole('dialog', { name: 'Generate cubes' })).toHaveCount(0);
  const tree = page.getByRole('navigation', { name: 'Model files' });
  await expect(tree.getByRole('link', { name: `${stores}.yml` })).toBeVisible();
  await expect(tree.getByRole('link', { name: `${visits}.yml` })).toBeVisible();

  // And Cube answers them, across the join generated between them: 30 visits,
  // 10 to each of the three stores, two of them in Lisbon.
  await expect(async () => {
    const answer = (await (
      await request.post('/api/load', {
        data: {
          query: {
            measures: [`${visits}.count`],
            dimensions: [`${stores}.city`],
            order: { [`${stores}.city`]: 'asc' },
          },
        },
      })
    ).json()) as { data?: Record<string, unknown>[] };
    expect(answer.data).toEqual([
      { [`${stores}.city`]: 'Lisbon', [`${visits}.count`]: '20' },
      { [`${stores}.city`]: 'Porto', [`${visits}.count`]: '10' },
    ]);
  }).toPass({ timeout: 30_000 });

  // The introspection token stayed in wechart's API (AC-250).
  expect(answers.length).toBeGreaterThan(3);
  for (const answer of answers) expect(answer).not.toMatch(/eyJ[\w-]+\.[\w-]+\.[\w-]+/);
});

/**
 * AC-139's `a column is dropped without saying so`, on the table that caught
 * Cube's scaffold dropping columns unsaid (research, "Silent losses"; T145's
 * review): `generate.every_loss` has a time-typed key, `"Amount"` beside
 * `amount`, a `count` column and a quoted `"Visit Count"`
 * (infra/sample-db/generate.sql). The fork's introspection package keeps them
 * all, as its overlay did at f6355de982 (research/cube/introspection-api.md,
 * "Silent losses"): each column a member, the count kept, the key a key; and
 * wechart's own check (scaffoldCheck.ts) finds nothing to say.
 */
test('Cube’s scaffold keeps every column of a table that once lost three, and wechart finds nothing lost', async ({
  page,
}) => {
  const { pane, tables } = await toTables(page, 'generate', 'every_loss');
  await tables.getByRole('checkbox', { name: 'every_loss' }).check();
  await pane.getByRole('button', { name: 'Generate 1 cube' }).click();

  const cube = pane.getByRole('region', { name: 'cubes/every_loss.yml' });
  await expect(cube.locator('.generate-pane__status')).toHaveText('Ready');
  const yaml = await yamlOf(cube);
  await expect(yaml).toContainText('name: every_loss');
  // Each member as the file has it: its name, then its SQL and type, line by line.
  const lines = (await yaml.locator('.cm-line').allTextContents()).join('\n');
  const member = (name: string, ...rest: string[]) =>
    new RegExp(
      `- name: ${name}\\s+${rest.map((line) => line.replace(/[{}".\\]/g, '\\$&')).join('\\s+')}`,
    );
  expect(lines).toMatch(member('at', 'sql: at', 'type: time', 'primary_key: true'));
  expect(lines).toMatch(member('count', 'type: count'));
  expect(lines).toMatch(member('amount', 'sql: "{CUBE}.\\"Amount\\""', 'type: sum'));
  expect(lines).toMatch(member('amount_2', 'sql: amount', 'type: sum'));
  expect(lines).toMatch(member('count_2', 'sql: count', 'type: sum'));
  expect(lines).toMatch(member('visit_count', 'sql: "{CUBE}.\\"Visit Count\\""', 'type: sum'));
  await expect(cube.getByText('Every column is in the cube.')).toBeVisible();
  await expect(cube.getByText(/No count measure|Not marked as the cube’s primary key/)).toHaveCount(
    0,
  );
});

/**
 * T276 / AC-249: IF a cube generated from a data source has the name or file
 * name of a cube or file already in the model store, THEN THE SYSTEM SHALL
 * refuse to save it, name the existing cube or file, and leave the existing
 * one unchanged. `Fails when: an existing model file changes, or a clashing
 * cube is saved, or the refusal does not name what it clashes with.`
 *
 * The sample database's `public.orders` generates `orders` in `orders.yml`:
 * the seeded model's own cube, in its own file. Generated there, it is marked
 * and not published; asked of the API directly, it is refused all the same;
 * and the stored file is as it was, byte for byte.
 */
test('a generated cube the model already has is marked, named, and refused, and the stored one kept', async ({
  page,
  request,
}) => {
  const storedOrders = async () =>
    (
      (await (await request.get('/api/model/files')).json()) as {
        files: { path: string; content: string }[];
      }
    ).files.find((file) => file.path === 'cubes/orders.yml')?.content;
  const before = await storedOrders();
  expect(before).toContain('name: orders');

  const { pane, tables } = await toTables(page, 'public', 'orders');
  await tables.getByRole('checkbox', { name: 'orders', exact: true }).check();
  await pane.getByRole('button', { name: 'Generate 1 cube' }).click();

  // Marked, with its status and a bar naming the cube it clashes with; Publish refused, saying why.
  const orders = pane.getByRole('region', { name: 'cubes/orders.yml' });
  await expect(orders.locator('.generate-pane__status')).toHaveText('Clashes');
  await expect(
    orders.locator('.generate-pane__file-body > .generate-pane__note.is-err p'),
  ).toHaveText('orders is already a cube in cubes/orders.yml.');
  await expect(pane.locator('.source-pane__foot-note')).toHaveText('Resolve 1 clash to publish');
  const publish = pane.getByRole('button', { name: 'Publish 1 cube' });
  await expect(publish).toHaveAttribute('aria-disabled', 'true');
  await publish.click({ force: true });
  await expect(pane.getByText('Published 1 cube.')).toHaveCount(0);

  // Whatever the browser sends, the API refuses it, naming the cube it has.
  const scaffold = (await (
    await request.post('/api/introspection/sources/default/scaffold', {
      data: { tables: [{ schema: 'public', table: 'orders' }] },
    })
  ).json()) as { cubes: { content: string }[] };
  const refused = await request.post('/api/model/publish', {
    data: {
      files: [{ path: 'cubes/orders.yml', content: scaffold.cubes[0]?.content }],
      create: true,
    },
  });
  expect([refused.status(), await refused.json()]).toEqual([
    422,
    {
      errors: [
        { path: 'cubes/orders.yml', message: '`orders` is already a cube in cubes/orders.yml.' },
      ],
    },
  ]);
  expect(await storedOrders()).toBe(before);
});
