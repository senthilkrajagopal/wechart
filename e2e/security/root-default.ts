import { readFileSync } from 'node:fs';

import { API_PORT, SEED_TOKEN } from '../../playwright.security.config';
import { seedDefault } from '../../packages/api/src/seed-default';

/**
 * The shared root's `default` data source, as the install's Job seeds it
 * (T443, AC-310): compose's sample database, the same host, port, database
 * and user compose gives Cube as `CUBEJS_DB_*`. So the root's cubes keep
 * their names once it is stored (xcube 919cff8c6e; research
 * xcube-919cff8c6e.md, "wechart's case").
 *
 * A run's data reset leaves it in xcube while the root's cubes are published:
 * xcube refuses to drop it (`409 in_use`). Were it removed, from `465865f3fd`
 * (pinned with `89628a0e88`) the root would keep its names, since Cube's
 * environment reaches where it did (xcube-465865f3fd.md, findings 8 and 9;
 * correcting xcube-919cff8c6e.md, Gotcha 1). A spec that reads the root's
 * names seeds it first all the same, as wechart's own record of it; a second
 * seeding changes nothing.
 */
export const ROOT_DEFAULT_ENV = {
  WECHART_API_URL: `http://localhost:${String(API_PORT)}`,
  WECHART_SEED_TOKEN: SEED_TOKEN,
  WECHART_XCUBE_PUBLIC_KEY: readFileSync(
    new URL('../../infra/xcube/dev-credential-key.pub.jwk', import.meta.url),
    'utf8',
  ),
  WECHART_DEFAULT_DB_TYPE: 'postgres',
  WECHART_DEFAULT_DB_HOST: 'sample-db',
  WECHART_DEFAULT_DB_PORT: '5432',
  WECHART_DEFAULT_DB_DATABASE: 'sample',
  WECHART_DEFAULT_DB_USER: 'sample',
  WECHART_DEFAULT_DB_SSL: 'false',
  WECHART_DEFAULT_DB_PASSWORD: 'sample',
};

/** Seeded now, or already: the exit code and what the seeder said. */
export async function seedRootDefault(): Promise<{ code: number; said: string[] }> {
  const said: string[] = [];
  const code = await seedDefault(ROOT_DEFAULT_ENV, { log: (line) => said.push(line) });
  return { code, said };
}
