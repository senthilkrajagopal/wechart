import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import pg from 'pg';

import { databaseUrl } from './src/db/client';
import { migrateToLatest } from './src/db/migrate';

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
export async function setup(): Promise<void> {
  await startDatabase();
  await waitForConnection();
  await migrateToLatest();
}

async function startDatabase(): Promise<void> {
  try {
    await run('docker', ['compose', 'up', '-d', '--wait', SERVICE], { cwd: REPO_ROOT });
  } catch (cause) {
    throw new Error(
      `Could not start the "${SERVICE}" service from docker-compose.yml.\n` +
        'The api tests run against a real Postgres, so Docker has to be running.\n' +
        'Start Docker Desktop and run `pnpm test` again, or point WECHART_DB_URL at ' +
        'your own Postgres.\n' +
        `Underlying error: ${cause instanceof Error ? cause.message : String(cause)}`,
      { cause },
    );
  }
}

/** `--wait` honours the healthcheck, but the first connection can still race it. */
async function waitForConnection(attempts = 30): Promise<void> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const client = new pg.Client({ connectionString: databaseUrl() });
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
    `Postgres at ${databaseUrl()} did not accept a connection after ${String(attempts)} attempts. ` +
      `Last error: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
  );
}
