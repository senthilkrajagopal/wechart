import type { Kysely } from 'kysely';

import { CUBE_STORE_TARGET } from '../repos/sql-runner-switches';
import type { Database } from './schema';

/**
 * Removes the SQL runner switches whose data source is gone; Cube Store's,
 * which belongs to no data source, stays. Says how many went.
 *
 * The test database's own hygiene (lane MCP, batch 4): the route removes a
 * switch with its data source (T531's review), but tests remove their data
 * sources' rows directly, leaving the switches behind. They had grown to
 * 364, every one asked after in turn by `GET /api/cube-store` for a user who
 * isn't a Super-Admin (`allowedOnASwitchedFolder`), about 370 queries a
 * request, which ran the route matrix's Cube Store cases into their 5 s
 * timeout under load. `vitest.globalSetup.ts` runs this before each run.
 */
export async function removeOrphanSwitches(db: Kysely<Database>): Promise<number> {
  const removed = await db
    .deleteFrom('sql_runner_switches')
    .where('target', '<>', CUBE_STORE_TARGET)
    .where('target', 'not in', db.selectFrom('data_sources').select('id'))
    .executeTakeFirst();
  return Number(removed.numDeletedRows);
}
