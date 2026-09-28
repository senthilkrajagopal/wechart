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
 * Each run's data reset removes it from xcube, and until it is stored again
 * the root's cubes are served from Cube's environment under aliases (that
 * research, Gotcha 1). A spec that reads the root's names seeds it first; a
 * second seeding changes nothing.
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
