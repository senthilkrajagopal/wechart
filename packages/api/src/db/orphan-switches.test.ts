import { randomUUID } from 'node:crypto';

import { afterAll, describe, expect, it } from 'vitest';

import { closeDb, getDb } from './client';
import { removeOrphanSwitches } from './orphan-switches';
import { dataSourceStore } from '../repos/data-sources';
import { CUBE_STORE_TARGET, sqlRunnerSwitches } from '../repos/sql-runner-switches';

/**
 * The test database keeps no SQL runner switch of a data source that's gone
 * (the route-matrix timeouts, lane MCP batch 4): `removeOrphanSwitches`,
 * which the global setup runs before every run, removes them, keeping every
 * live data source's switch and Cube Store's.
 */
const MARK = `switchgone${randomUUID().slice(0, 8)}`;

afterAll(async () => {
  await getDb().deleteFrom('data_sources').where('name', 'like', `${MARK}%`).execute();
  await removeOrphanSwitches(getDb());
  await closeDb();
});

const source = () =>
  dataSourceStore(getDb()).create({
    folderId: 'root',
    name: `${MARK}_${randomUUID().slice(0, 6)}`,
    driver: 'postgres',
    authMethod: 'password',
    fields: { host: 'db', port: 5432, database: 'sales', user: 'cube', ssl: true },
    // Sized as xcube takes an envelope (as the route matrix seals one).
    sealed: {
      password: {
        v: 1,
        kid: 'kid-1',
        enc: Buffer.alloc(32, 'enc').toString('base64url'),
        ct: Buffer.alloc(272, 'ct').toString('base64url'),
      },
    },
  });

describe('switches of data sources that are gone (the test database’s hygiene)', () => {
  it('removes a switch whose data source’s row was deleted, keeping a live one’s and Cube Store’s', async () => {
    const switches = sqlRunnerSwitches(getDb());
    const [gone, kept] = [(await source()).id, (await source()).id];
    for (const id of [gone, kept]) await switches.on(id, { key: 'super', name: 'Super' });
    const cubeStoreBefore = await switches.of(CUBE_STORE_TARGET);
    // As a test's own clean-up removes it: the row alone.
    await getDb().deleteFrom('data_sources').where('id', '=', gone).execute();
    expect((await switches.of(gone))?.confirmedBy.key).toBe('super');

    expect(await removeOrphanSwitches(getDb())).toBeGreaterThanOrEqual(1);

    expect(await switches.of(gone)).toBeUndefined();
    expect((await switches.of(kept))?.confirmedBy.key).toBe('super');
    expect(await switches.of(CUBE_STORE_TARGET)).toEqual(cubeStoreBefore);
    const orphans = await getDb()
      .selectFrom('sql_runner_switches')
      .select('target')
      .where('target', '<>', CUBE_STORE_TARGET)
      .where('target', 'not in', getDb().selectFrom('data_sources').select('id'))
      .execute();
    expect(orphans).toEqual([]);
    await switches.off(kept);
  });
});
