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
  // A row each: the header's "every table on this page" is not a table's (T491).
  await expect(tables.locator(':scope > tbody').getByRole('checkbox')).toHaveCount(2);
  await expect(
    tables.getByRole('checkbox', { name: 'Choose every table on this page' }),
  ).not.toBeChecked();

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

  // Added as drafts, none published (R36, T488, AC-345): both in the tree, marked
  // unpublished, and neither in Cube's model.
  await pane.getByRole('button', { name: 'Add 2 cubes as drafts' }).click();
  await expect(pane.getByText('Added 2 cubes as drafts.')).toBeVisible();
  const tree = page.getByRole('navigation', { name: 'Model files' });
  const row = (name: string) => tree.getByRole('link', { name: new RegExp(`^${name}\\.yml`) });
  await expect(row(stores)).toContainText('unpublished');
  await expect(row(visits)).toContainText('unpublished');
  const cubesInMeta = async () =>
    ((await (await request.get('/api/meta')).json()) as { cubes: { name: string }[] }).cubes.map(
      (cube) => cube.name,
    );
  expect(await cubesInMeta()).not.toContain(visits);
  expect(await cubesInMeta()).not.toContain(stores);

  // The visits draft joins the stores draft: named beside Save, and published with it (AC-346).
  await pane.getByRole('button', { name: `Open cubes/${visits}.yml` }).click();
  await expect(page).toHaveURL(new RegExp(`/model/files/cubes%2F${visits}\\.yml$`));
  await expect(page.getByRole('dialog', { name: 'Generate cubes' })).toHaveCount(0);
  const form = page.getByRole('region', { name: 'Form editor' });
  const head = form.locator('.model-editor__head');
  const said = `Saves with cubes/${stores}.yml, which defines a cube this file joins.`;
  const note = form.locator('.model-editor__with');
  await expect(note).toHaveText(said);
  // Whole on screen, under Save, not clipped (T488's review).
  await expect(note).toBeVisible();
  expect(await note.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
  const save = head.getByRole('button', { name: 'Save & reload Cube' });
  const [saveBox, noteBox] = await Promise.all([save.boundingBox(), note.boundingBox()]);
  expect(Math.round(noteBox?.y ?? 0)).toBeGreaterThanOrEqual(
    Math.round((saveBox?.y ?? 0) + (saveBox?.height ?? 0)),
  );
  await expect(save).toHaveAccessibleDescription(said);
  // One publish of both, each new to the model's clash check (AC-249).
  const publishing = page.waitForRequest(
    (request) => request.url().endsWith('/api/model/publish') && request.method() === 'POST',
  );
  await save.click();
  const body = (await publishing).postDataJSON() as {
    files: { path: string }[];
    create: string[];
  };
  expect([body.files.map((file) => file.path), body.create]).toEqual([
    [`cubes/${visits}.yml`, `cubes/${stores}.yml`],
    [`cubes/${visits}.yml`, `cubes/${stores}.yml`],
  ]);
  await expect(head).toContainText('Published. Cube is reading the new model.', {
    timeout: 30_000,
  });
  await expect(row(stores)).not.toContainText('unpublished');
  await expect(row(visits)).not.toContainText('unpublished');
  await expect(note).toHaveCount(0);

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
  // Said before generating: the seed's `orders` cube reads this table (T489, AC-347).
  const row = tables
    .getByRole('row')
    .filter({ has: page.getByRole('checkbox', { name: 'orders', exact: true }) });
  // The seed's `monthly_orders` reads it too; other browsers' own cubes may.
  await expect(row.locator('.generate-pane__in-model')).toHaveText(
    /^In model · (?=.*\bmonthly_orders\b)(?=(?:.*, )?orders\b)/,
  );
  await tables.getByRole('checkbox', { name: 'orders', exact: true }).check();
  await pane.getByRole('button', { name: 'Generate 1 cube' }).click();

  // Marked, with its status and a bar naming the cube it clashes with; adding refused, saying why.
  const orders = pane.getByRole('region', { name: 'cubes/orders.yml' });
  await expect(orders.locator('.generate-pane__status')).toHaveText('Clashes');
  await expect(
    orders.locator('.generate-pane__file-body > .generate-pane__note.is-err p'),
  ).toHaveText('orders is already a cube in cubes/orders.yml.');
  await expect(pane.locator('.source-pane__foot-note')).toHaveText('Resolve 1 clash first');
  const add = pane.getByRole('button', { name: 'Add 1 cube as a draft' });
  await expect(add).toHaveAttribute('aria-disabled', 'true');
  await add.click({ force: true });
  await expect(pane.getByText('Added 1 cube as a draft.')).toHaveCount(0);

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

/**
 * T490 / AC-348: WHEN Generate cubes lists the data sources to generate from,
 * THE SYSTEM SHALL show beside each its health as Data sources shows it — its
 * icon, its label and how long ago it was tested — or that it has not been
 * tested. The root's `default`, read on both pages.
 */
test('the Source step shows the root’s default with the health Data sources gives it', async ({
  page,
}) => {
  const listed = (await (await page.request.get('/api/data-sources')).json()) as {
    name: string;
    folderId: string;
  }[];
  const inRoot = listed.some((each) => each.name === 'default' && each.folderId === 'root');
  // Its words and state, as Data sources gives them; the age is each page's own reading.
  let expected: { state: string; label: string } | undefined;
  if (inRoot) {
    await page.goto('/data-sources');
    const row = page
      .getByRole('row')
      .filter({ has: page.getByRole('cell', { name: 'default', exact: true }) })
      .filter({ has: page.getByRole('link', { name: 'Shared', exact: true }) });
    const there = row.getByTestId('source-health');
    expected = {
      state: (await there.getAttribute('data-state')) ?? '',
      label: ((await there.textContent()) ?? '').split(' · ')[0] ?? '',
    };
  }

  await page.goto('/model');
  await page
    .getByRole('navigation', { name: 'Model files' })
    .getByRole('button', { name: 'Generate from a data source…' })
    .click();
  const pane = page.getByRole('dialog', { name: 'Generate cubes' });
  const radio = pane.getByRole('radio', { name: 'default PostgreSQL' });
  await expect(radio).toBeVisible();
  if (expected === undefined) {
    // No record Data sources shows (compose's Cube has its `default` from its
    // own settings): nothing said here either (T490's review).
    await expect(radio).not.toHaveAttribute('aria-describedby', /.+/);
    await expect(pane.getByTestId('source-health')).toHaveCount(0);
    return;
  }
  await expect(radio).toHaveAttribute('aria-describedby', /.+/);
  const health = pane.locator(`[id="${(await radio.getAttribute('aria-describedby')) ?? ''}"]`);
  await expect(health).toHaveAttribute('data-state', expected.state);
  await expect(health).toHaveText(new RegExp(`^${expected.label}( · |$)`));
  await expect(health.locator('svg')).toBeVisible();
});
