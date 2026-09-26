import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runner as migrationRunner } from 'node-pg-migrate';

import { databaseUrl } from './client';

/**
 * Migrations are `.cjs` files loaded from disk at runtime, not modules the
 * bundler can see, so the path is resolved from the package root rather than
 * from this file: under `vitest` this module runs from `src/`, and in the
 * built service from `dist/`, and only the package root is the same in both.
 */
function migrationsDir(): string {
  const fromEnv = process.env['WECHART_MIGRATIONS_DIR'];
  if (fromEnv) return fromEnv;

  let dir = dirname(fileURLToPath(import.meta.url));
  while (!existsSync(join(dir, 'package.json'))) {
    const parent = dirname(dir);
    if (parent === dir) throw new Error('Could not locate the api package root for migrations');
    dir = parent;
  }
  return join(dir, 'src', 'db', 'migrations');
}

/**
 * Apply every pending migration. In production this runs as its own step before
 * the API starts, never inside the API process (docs/research/db-access.md);
 * the test global setup calls it directly so a test run always meets a
 * migrated database.
 */
export async function migrateToLatest(): Promise<void> {
  await migrationRunner({
    databaseUrl: databaseUrl(),
    dir: migrationsDir(),
    direction: 'up',
    migrationsTable: 'pgmigrations',
    advisoryLockMode: migrationLockMode,
    log: () => {},
  });
}

/**
 * Replicas starting at once wait for one another's migrations rather than
 * throwing "Another migration is already running", node-pg-migrate's default
 * (T421, AC-319; research `cube/ha-topology.md`, table row 6).
 */
export const migrationLockMode = 'wait' as const;
