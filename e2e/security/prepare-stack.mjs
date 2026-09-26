#!/usr/bin/env node
/**
 * Readies what the security-on suite's API needs before it starts (T320):
 * the metadata Postgres and Dex from docker-compose (Dex only runs under the
 * `security` profile), and a database of the suite's own, so its fixtures
 * never reach the phase-1 suite's or the development app's.
 *
 * Run by `playwright.security.config.ts` as the first half of the API's
 * webServer command, so nothing depends on the order Playwright runs its
 * global setup and web servers in (research/test-stack.md, T320 addendum).
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath, URL } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));
/** Must match `WECHART_DB_URL` in playwright.security.config.ts. */
const DATABASE = 'wechart_security';

const run = (command, args) =>
  execFileSync(command, args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  });

run('docker', ['compose', '--profile', 'security', 'up', '-d', '--wait', 'wechart-meta', 'dex']);

const psql = (sql) =>
  run('docker', [
    'exec',
    'wechart-meta',
    'psql',
    '-U',
    'wechart',
    '-d',
    'wechart_meta',
    '-Atc',
    sql,
  ]);

if (psql(`SELECT 1 FROM pg_database WHERE datname = '${DATABASE}'`).trim() !== '1') {
  psql(`CREATE DATABASE ${DATABASE}`);
}
