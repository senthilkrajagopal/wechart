import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import pg from 'pg';

import { closeDb, databaseUrl, getDb } from './src/db/client';
import { migrateToLatest } from './src/db/migrate';
import { removeOrphanSwitches } from './src/db/orphan-switches';

const run = promisify(execFile);
const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const SERVICE = 'wechart-meta';

/**
 * AC-014 is a claim about what survives a restart and AC-015 about two sessions
 * racing on one row. Neither can be shown against a fake, so `pnpm test` runs
 * the api package against the real Postgres in docker-compose.yml: this brings
 * the service up, waits for its healthcheck, and applies the migrations.
 *
 * If Docker is not running, this fails loudly. It must not skip the tests —
 * a green run that silently proved nothing is worse than a red one.
 */
/**
 * Must match `test.env.WECHART_DB_URL` in vitest.config.ts. Vitest applies
 * `test.env` to the workers, not to this file, so setting it here is what makes
 * the two agree — without it this ran against the development database and
 * created nothing.
 */
const TEST_DB_URL = 'postgres://wechart:wechart@localhost:55432/wechart_test';

export async function setup(): Promise<void> {
  process.env['WECHART_DB_URL'] = TEST_DB_URL;
  await startDatabase();
  await waitForConnection(adminUrl());
  await createTestDatabase();
  await waitForConnection(databaseUrl());
  await migrateToLatest();
  // Switches left by tests' own clean-ups slow every Cube Store ask (orphan-switches.ts).
  const db = getDb();
  try {
    await removeOrphanSwitches(db);
  } finally {
    await closeDb();
  }
}

/** The maintenance database on the same server, used to create the test one. */
function adminUrl(): string {
  const url = new URL(databaseUrl());
  url.pathname = '/wechart_meta';
  return url.toString();
}

/**
 * The tests run against their own database so fixtures never reach the catalog
 * the development app lists.
 */
async function createTestDatabase(): Promise<void> {
  const name = new URL(databaseUrl()).pathname.replace(/^\//, '');
  const client = new pg.Client({ connectionString: adminUrl() });
  await client.connect();
  try {
    const exists = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
    if (exists.rowCount === 0) {
      // Identifier, so it cannot be a bound parameter; the name comes from our
      // own configuration, not from input.
      await client.query(`CREATE DATABASE "${name.replace(/"/g, '""')}"`);
    }
  } finally {
    await client.end();
  }
}

async function startDatabase(): Promise<void> {
  try {
    // Dex too (T315): the sign-in tests ask the development provider itself.
    await run(
      'docker',
      ['compose', '--profile', 'security', 'up', '-d', '--wait', SERVICE, 'dex'],
      { cwd: REPO_ROOT },
    );
  } catch (cause) {
    throw new Error(
      `Could not start the "${SERVICE}" and "dex" services from docker-compose.yml.\n` +
        'The api tests run against a real Postgres and the development OIDC provider (Dex, on ' +
        'port 5556), so Docker has to be running and the ports free.\n' +
        'Start Docker Desktop and run `pnpm test` again, or point WECHART_DB_URL at ' +
        'your own Postgres.\n' +
        `Underlying error: ${cause instanceof Error ? cause.message : String(cause)}`,
      { cause },
    );
  }
}

/** `--wait` honours the healthcheck, but the first connection can still race it. */
async function waitForConnection(connectionString: string, attempts = 30): Promise<void> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const client = new pg.Client({ connectionString });
    try {
      await client.connect();
      await client.end();
      return;
    } catch (error) {
      lastError = error;
      await client.end().catch(() => {});
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  throw new Error(
    `Postgres at ${connectionString} did not accept a connection after ${String(attempts)} attempts. ` +
      `Last error: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
  );
}
