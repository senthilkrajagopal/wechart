import type { FieldValue } from '@wechart/core';
import type { Kysely } from 'kysely';

import type { Database } from '../db/schema';
import type { TestAnswer } from '../xcube/connections';

/**
 * Each connection test of a stored data source (T362, AC-163): recorded as
 * xcube answered it, and listed per source, newest first, every one of them.
 * What is kept holds no secret: xcube redacts each from its errors, and the
 * fields are the non-secret ones the test connected with.
 */
export interface ConnectionTest {
  readonly id: string;
  readonly ranAt: Date;
  readonly ok: boolean;
  readonly checks: TestAnswer['checks'];
  readonly fields: Readonly<Record<string, FieldValue>>;
  /**
   * Of the settings as stored, or of the form's changes not yet saved: a
   * wrong password tried and not kept says nothing of the stored one's health
   * (T362's review; T364).
   */
  readonly asStored: boolean;
  /**
   * The stored settings' print it tested (`DataSource.settingsPrint`), for a
   * test of them; null for a trial of changes. Once a save changes them, the
   * test is no longer the source's health (T364's review).
   */
  readonly settings: string | null;
  /** Who ran it, as wechart knew them then. */
  readonly by: { readonly key: string; readonly name: string } | null;
}

export interface ConnectionTestStore {
  record(dataSourceId: string, test: Omit<ConnectionTest, 'id' | 'ranAt'>): Promise<ConnectionTest>;
  /** Every one, newest first (AC-163: none may be missing). */
  history(dataSourceId: string): Promise<ConnectionTest[]>;
  /** Each source's newest test of its stored settings: its health (T364, AC-157). */
  latestAsStored(dataSourceIds: readonly string[]): Promise<Map<string, ConnectionTest>>;
}

/** Of each check, only what xcube says of it. */
const trimmed = (checks: TestAnswer['checks']): TestAnswer['checks'] =>
  checks.map(({ id, status, durationMs, error }) => ({
    id,
    status,
    durationMs,
    ...(error === undefined ? {} : { error }),
  }));

export function connectionTestStore(db: Kysely<Database>): ConnectionTestStore {
  const columns = [
    'id',
    'ran_at',
    'ok',
    'as_stored',
    'settings',
    'checks',
    'fields',
    'ran_by',
  ] as const;
  const toTest = (row: {
    id: string;
    ran_at: Date;
    ok: boolean;
    as_stored: boolean;
    settings: string | null;
    checks: unknown[];
    fields: Record<string, unknown>;
    ran_by: { key: string; name: string } | null;
  }): ConnectionTest => ({
    id: row.id,
    ranAt: row.ran_at,
    ok: row.ok,
    checks: row.checks as TestAnswer['checks'],
    fields: row.fields as Record<string, FieldValue>,
    asStored: row.as_stored,
    settings: row.settings,
    by: row.ran_by,
  });

  return {
    async record(dataSourceId, test) {
      const row = await db
        .insertInto('connection_tests')
        .values({
          data_source_id: dataSourceId,
          ok: test.ok,
          as_stored: test.asStored,
          settings: test.settings,
          checks: JSON.stringify(trimmed(test.checks)),
          fields: JSON.stringify(test.fields),
          ran_by: test.by === null ? null : JSON.stringify(test.by),
        })
        .returning(columns)
        .executeTakeFirstOrThrow();
      return toTest(row);
    },

    async history(dataSourceId) {
      const rows = await db
        .selectFrom('connection_tests')
        .select(columns)
        .where('data_source_id', '=', dataSourceId)
        // The order recorded in, which two in one instant keep.
        .orderBy('seq', 'desc')
        .execute();
      return rows.map(toTest);
    },

    async latestAsStored(dataSourceIds) {
      if (dataSourceIds.length === 0) return new Map();
      const rows = await db
        .selectFrom('connection_tests')
        .distinctOn('data_source_id')
        .select(['data_source_id', ...columns])
        .where('data_source_id', 'in', [...dataSourceIds])
        .where('as_stored', '=', true)
        .orderBy('data_source_id')
        .orderBy('seq', 'desc')
        .execute();
      return new Map(rows.map((row) => [row.data_source_id, toTest(row)]));
    },
  };
}
