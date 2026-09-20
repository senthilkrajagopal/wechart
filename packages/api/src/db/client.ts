import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';

import type { Database } from './schema';

/**
 * One pool per process, created lazily so importing this module does not open a
 * connection. `closeDb()` drops it; the next `getDb()` builds a fresh one,
 * which is how the tests reproduce a service restart (AC-014).
 */
let db: Kysely<Database> | null = null;

export const DEFAULT_DB_URL = 'postgres://wechart:wechart@localhost:55432/wechart_meta';

export function databaseUrl(): string {
  return process.env['WECHART_DB_URL'] ?? DEFAULT_DB_URL;
}

export function getDb(): Kysely<Database> {
  if (db) return db;

  const pool = new pg.Pool({ connectionString: databaseUrl(), max: 10 });

  // node-postgres emits this on behalf of idle clients when the backend dies or
  // the network partitions. Without a handler it becomes an uncaught exception
  // and takes the process down (node-postgres "pooling" docs).
  pool.on('error', (error) => {
    console.error('[wechart] idle postgres client error', error);
  });

  db = new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
  return db;
}

export async function closeDb(): Promise<void> {
  if (!db) return;
  const closing = db;
  db = null;
  await closing.destroy();
}
