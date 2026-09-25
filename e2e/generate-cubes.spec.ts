import { expect, test } from '@playwright/test';

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
 */
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

  await page.goto('/model');
  await page.getByRole('button', { name: 'Generate cubes' }).click();
  const dialog = page.getByRole('dialog', { name: 'Generate cubes from a data source' });
  await expect(dialog.getByLabel('Data source')).toHaveValue('default');
  await dialog.getByLabel('Schema').selectOption('generate');
  await dialog.getByLabel('Find a table').fill(`${project}_`);
  const tables = dialog.getByRole('table', { name: 'Tables in generate' });
  await expect(tables.getByRole('checkbox')).toHaveCount(2);

  // A look at the visits' columns: its key, and the foreign key to the stores.
  await tables.getByRole('button', { name: `Columns of ${visits}` }).click();
  const columns = dialog.getByRole('table', { name: `Columns of ${visits}` });
  await expect(columns.getByRole('row', { name: /^store_id/ })).toContainText(`→ ${stores}.id`);
  await expect(columns.getByRole('row', { name: /^id / })).toContainText('Primary key');

  await tables.getByRole('checkbox', { name: stores }).check();
  await tables.getByRole('checkbox', { name: visits }).check();
  await dialog.getByRole('button', { name: 'Generate 2 cubes' }).click();

  // A cube per table: its keys and strings and times as dimensions, a count,
  // and its measure-named number as a sum; every other column said and why.
  const storesCube = dialog.getByRole('region', { name: `cubes/${stores}.yml` });
  const storesYaml = storesCube.getByTestId('generated-yaml');
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
  await expect(storesCube.getByRole('list', { name: 'Columns left out' })).toHaveText(
    'floor_area (numeric): a number, neither a key nor named like a measure',
  );
  const visitsCube = dialog.getByRole('region', { name: `cubes/${visits}.yml` });
  const visitsYaml = visitsCube.getByTestId('generated-yaml');
  for (const member of [
    `name: ${stores}`,
    'relationship: many_to_one',
    'name: visited_at',
    'type: count',
    'name: spend_amount',
    'type: sum',
  ])
    await expect(visitsYaml).toContainText(member);
  await expect(
    visitsCube.getByRole('list', { name: 'Columns left out' }).getByRole('listitem'),
  ).toHaveText([
    'store_id (integer): a number, neither a key nor named like a measure',
    'visitors (integer): a number, neither a key nor named like a measure',
    '_loaded_at (timestamp with time zone): its name starts with an underscore',
  ]);

  // Published together, as any model change is, and opened in the tree.
  await dialog.getByRole('button', { name: 'Publish 2 cubes' }).click();
  await expect(dialog.getByText('Published 2 cubes.')).toBeVisible({ timeout: 30_000 });
  await dialog.getByRole('button', { name: `Open cubes/${stores}.yml` }).click();
  await expect(page).toHaveURL(new RegExp(`/model/files/cubes%2F${stores}\\.yml$`));
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
 * AC-139's `a column is dropped without saying so`, where Cube's scaffold
 * drops it unsaid (research, "Silent losses"; T145's review):
 * `generate.every_loss` has a time-typed key, `"Amount"` beside `amount`, a
 * `count` column and a quoted `"Visit Count"` (infra/sample-db/generate.sql).
 * The real Cube writes none of the first three as it should, and says nothing;
 * wechart says each.
 */
test('what Cube’s scaffold drops unsaid, wechart says', async ({ page }) => {
  await page.goto('/model');
  await page.getByRole('button', { name: 'Generate cubes' }).click();
  const dialog = page.getByRole('dialog', { name: 'Generate cubes from a data source' });
  await dialog.getByLabel('Schema').selectOption('generate');
  await dialog.getByLabel('Find a table').fill('every_loss');
  const tables = dialog.getByRole('table', { name: 'Tables in generate' });
  await tables.getByRole('checkbox', { name: 'every_loss' }).check();
  await dialog.getByRole('button', { name: 'Generate 1 cube' }).click();

  const cube = dialog.getByRole('region', { name: 'cubes/every_loss.yml' });
  await expect(cube.getByTestId('generated-yaml')).toContainText('sql: "{CUBE}.\\"Visit Count\\""');
  await expect(cube.getByRole('list', { name: 'Columns left out' })).toHaveText(
    'Amount (numeric): its member’s name is another column’s, and Cube kept only one',
  );
  await expect(
    cube.getByText('No count measure: a column’s measure took its name, count.'),
  ).toBeVisible();
  await expect(
    cube.getByText('Not marked as the cube’s primary key: at. A join to this cube needs one.'),
  ).toBeVisible();
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

  await page.goto('/model');
  await page.getByRole('button', { name: 'Generate cubes' }).click();
  const dialog = page.getByRole('dialog', { name: 'Generate cubes from a data source' });
  await dialog.getByLabel('Schema').selectOption('public');
  await dialog.getByLabel('Find a table').fill('orders');
  const tables = dialog.getByRole('table', { name: 'Tables in public' });
  await tables.getByRole('checkbox', { name: 'orders', exact: true }).check();
  await dialog.getByRole('button', { name: 'Generate 1 cube' }).click();

  const orders = dialog.getByRole('region', { name: 'cubes/orders.yml' });
  await expect(orders.getByRole('list', { name: 'Clashes with the model' })).toHaveText(
    '`orders` is already a cube in cubes/orders.yml.',
  );
  const publish = dialog.getByRole('button', { name: 'Publish 1 cube' });
  await expect(publish).toHaveAttribute('aria-disabled', 'true');
  await publish.click({ force: true });
  await expect(dialog.getByText('Published 1 cube.')).toHaveCount(0);

  // Whatever the browser sends, the API refuses it, naming the cube it has.
  const generated = await orders.getByTestId('generated-yaml').textContent();
  const refused = await request.post('/api/model/publish', {
    data: { files: [{ path: 'cubes/orders.yml', content: generated }], create: true },
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
