import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';

import { sql } from 'kysely';
import { afterAll, describe, expect, it } from 'vitest';

import { plainYamlOf } from '../xcube/snapshot';
import { closeDb, getDb } from './client';

/**
 * T446, AC-335: the seed's `cubes/product_catalog.yml` was a Jinja template,
 * which xcube never serves, so its cube would be missing once xcube serves the
 * model. The seed is plain YAML now; a store seeded before keeps the path
 * (seeding writes no stored path again), so a migration rewrites it there —
 * only where it is still the seed's own text, never over a change made in
 * wechart.
 */
const PATH = 'cubes/product_catalog.yml';
const OLD = `# A dynamic model: Cube renders the Jinja below before it reads the YAML.
# wechart shows such a file read-only, with the reason (AC-140), and publishes
# none (T142): a template runs inside Cube.
{%- set table = "public.products" %}
cubes:
  - name: product_catalog
    sql_table: {{ table }}

    measures:
      - name: count
        type: count
`;

const migration = createRequire(import.meta.url)(
  './migrations/1758290000000_product-catalog-plain-yaml.cjs',
) as { up: (pgm: { sql: (text: string) => void }) => void };

/** The migration's statements, run against the metadata database. */
async function migrate(): Promise<void> {
  const statements: string[] = [];
  migration.up({ sql: (text) => statements.push(text) });
  for (const statement of statements) await sql.raw(statement).execute(getDb());
}

const stored = async () =>
  (
    await getDb()
      .selectFrom('model_files')
      .select('content')
      .where('path', '=', PATH)
      .executeTakeFirst()
  )?.content;

let before: string | undefined;

afterAll(async () => {
  // As it was before the test.
  await getDb().deleteFrom('model_files').where('path', '=', PATH).execute();
  if (before !== undefined)
    await getDb().insertInto('model_files').values({ path: PATH, content: before }).execute();
  await closeDb();
});

const put = async (content: string) =>
  getDb()
    .insertInto('model_files')
    .values({ path: PATH, content })
    // The root's file: a path is unique within its folder (T334).
    .onConflict((conflict) => conflict.columns(['folder_id', 'path']).doUpdateSet({ content }))
    .execute();

describe('the seed’s product catalogue, as plain YAML (T446, AC-335)', () => {
  it('is plain YAML in the seed, and rewritten so where a store still holds the template', async () => {
    before = await stored();
    const seed = await readFile(
      join(import.meta.dirname, '../../../../infra/cube/model/cubes/product_catalog.yml'),
      'utf8',
    );
    expect(plainYamlOf([{ path: PATH, content: seed }])).toHaveLength(1);
    expect(seed).toContain('sql_table: public.products');

    await put(OLD);
    await migrate();

    expect(await stored()).toBe(seed);
  });

  it('leaves a catalogue changed in wechart alone', async () => {
    const changed = `${OLD}      - name: priced\n        type: count\n`;
    await put(changed);

    await migrate();

    expect(await stored()).toBe(changed);
  });
});
