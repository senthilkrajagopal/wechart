import { fileURLToPath } from 'node:url';

import { runner as migrationRunner } from 'node-pg-migrate';

import { databaseUrl } from './client';

const MIGRATIONS_DIR = fileURLToPath(new URL('./migrations', import.meta.url));

/**
 * Apply every pending migration. In production this runs as its own step before
 * the API starts, never inside the API process (docs/research/db-access.md);
 * the test global setup calls it directly so a test run always meets a
 * migrated database.
 */
export async function migrateToLatest(): Promise<void> {
  await migrationRunner({
    databaseUrl: databaseUrl(),
    dir: MIGRATIONS_DIR,
    direction: 'up',
    migrationsTable: 'pgmigrations',
    log: () => {},
  });
}
