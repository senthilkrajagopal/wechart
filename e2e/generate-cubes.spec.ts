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
