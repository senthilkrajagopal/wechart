import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { closeDb, getDb } from './db/client';
import { declaredIn } from './model/split';
import { readModelDir } from './model/read-dir';
import { ROOT_FOLDER_ID } from './repos/catalog';
import { dataSourceStore } from './repos/data-sources';
import { seedDevData } from './seed';

/**
 * The browser tests' reset (`WECHART_RESET_DATA=1`): each run starts from
 * the seed, with nothing a run before left behind. A data source is a
 * folder's item (T335), so it goes with the folders it was in, its secrets
 * with it: left, it would name a folder no longer there, and xcube would be
 * told of it no more (T442's reconcile), while wechart still lists it.
 */
const saved = process.env['WECHART_RESET_DATA'];
afterEach(() => {
  if (saved === undefined) delete process.env['WECHART_RESET_DATA'];
  else process.env['WECHART_RESET_DATA'] = saved;
});
afterAll(async () => {
  await closeDb();
});

/**
 * AC-426's grammar (`[R72]`): an ASCII letter, then ASCII letters, digits and
 * single underscores, never ending in one, at most 40 characters. A cube or
 * view may not be a reserved word, in any case: Python's keywords (research
 * `xcube-slice-3a.md`, "Reserved"), `None`, `True`, `False`, and Cube's own
 * symbols (`xcube-slice-3a.md`, "Never rewritten").
 */
const NAME = /^[A-Za-z][A-Za-z0-9]*(?:_[A-Za-z0-9]+)*$/;
const RESERVED = new Set(
  (
    'and as assert async await break class continue def del elif else except finally for ' +
    'from global if import in is lambda nonlocal not or pass raise return try while with yield ' +
    'none true false cube table filter_params filter_group sql_utils security_context ' +
    'securitycontext compile_context'
  ).split(' '),
);
const inGrammar = (name: string) => NAME.test(name) && name.length <= 40;

/** The model the API seeds at start: `config.ts`'s default `WECHART_MODEL_DIR`. */
const ROOT_MODEL_DIR = fileURLToPath(new URL('../../../infra/cube/model', import.meta.url));

/**
 * The cubes and views a seed file declares. A Jinja file (AC-140) is read
 * with its tags taken out, as Cube renders it before reading the YAML.
 */
const namesIn = (content: string) =>
  declaredIn(content.replace(/{%-?[\s\S]*?-?%}/g, '').replace(/{{[\s\S]*?}}/g, 'x'));

const sharing = (names: readonly string[]) => {
  const seen = new Map<string, string[]>();
  for (const name of names)
    seen.set(name.toLowerCase(), [...(seen.get(name.toLowerCase()) ?? []), name]);
  return [...seen.values()].filter((same) => same.length > 1);
};

describe('the development seed under one name per item (T700; AC-421, AC-426, AC-310)', () => {
  it('declares every cube and view of the root model once, in any case, each in the grammar', async () => {
    const files = await readModelDir(ROOT_MODEL_DIR);
    const declared = files.flatMap((file) => namesIn(file.content));
    // Every file is read: one cube or view each (AC-337), the Jinja one included.
    expect(declared.map((each) => each.name).filter((name) => name === '')).toEqual([]);
    expect(declared.length).toBe(files.length);

    const names = declared.map((each) => each.name);
    expect(sharing(names)).toEqual([]);
    expect(names.filter((name) => !inGrammar(name))).toEqual([]);
    expect(names.filter((name) => RESERVED.has(name.toLowerCase()))).toEqual([]);
  });

  /**
   * The seed makes none: the root's `default` is the install Job's to make
   * (`seed-default.ts`, AC-310), and every other is a test's own. So a
   * seeded `default` in a folder, or a second of one name, can't arise.
   */
  it('makes no data source, so none shares a name and none but the root’s is `default`', async () => {
    process.env['WECHART_RESET_DATA'] = '1';
    await seedDevData(getDb());

    const sources = await getDb()
      .selectFrom('data_sources')
      .select(['name', 'folder_id'])
      .execute();
    expect(sources).toEqual([]);
    expect(sharing(sources.map((each) => each.name))).toEqual([]);
    expect(sources.filter((each) => !inGrammar(each.name))).toEqual([]);
    expect(
      sources.filter(
        (each) => each.name.toLowerCase() === 'default' && each.folder_id !== ROOT_FOLDER_ID,
      ),
    ).toEqual([]);
  });
});

describe('the browser tests’ reset', () => {
  it('removes every data source with the folders, its secrets with it', async () => {
    const made = await dataSourceStore(getDb()).create({
      folderId: `folder-${randomUUID()}`,
      name: 'warehouse',
      driver: 'postgres',
      authMethod: 'password',
      fields: { host: 'db', port: 5432, database: 'sales', user: 'cube', ssl: true },
      sealed: {
        password: {
          v: 1,
          kid: 'kid-1',
          enc: Buffer.alloc(32, 'enc').toString('base64url'),
          ct: Buffer.alloc(272, 'ct').toString('base64url'),
        },
      },
    });

    process.env['WECHART_RESET_DATA'] = '1';
    await seedDevData(getDb());

    expect(await getDb().selectFrom('data_sources').select('id').execute()).toEqual([]);
    expect(
      await getDb()
        .selectFrom('data_source_secrets')
        .select('field')
        .where('data_source_id', '=', made.id)
        .execute(),
    ).toEqual([]);
    // And the seed is there again.
    expect(
      (await getDb().selectFrom('documents').select('id').where('kind', '=', 'folder').execute())
        .length,
    ).toBeGreaterThan(0);
  });

  it('removes every wechart schedule with the folders, so none runs on in the next run (T552)', async () => {
    const at = new Date();
    const id = `reset-${randomUUID()}`;
    await getDb()
      .insertInto('schedules')
      .values({
        id,
        name: 'Every minute',
        pre_aggregation: 'orders.main',
        folder_id: `folder-${randomUUID()}`,
        cron: '* * * * *',
        timezone: 'UTC',
        missed: 'once',
        created_by_key: 'wren',
        created_by_name: 'Wren Writer',
        created_at: at,
        updated_by_key: 'wren',
        updated_by_name: 'Wren Writer',
        updated_at: at,
      })
      .execute();

    process.env['WECHART_RESET_DATA'] = '1';
    await seedDevData(getDb());

    expect(await getDb().selectFrom('schedules').select('id').execute()).toEqual([]);
  });
});
