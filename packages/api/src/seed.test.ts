import { randomUUID } from 'node:crypto';

import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { closeDb, getDb } from './db/client';
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
});
