import type { FieldValue } from '@wechart/core';
import { sql, type Kysely } from 'kysely';

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
  /**
   * A stored one's test, with `shape` the print of the change it tried, if
   * any, which a save of that change names (T461, AC-158).
   */
  record(
    dataSourceId: string,
    test: Omit<ConnectionTest, 'id' | 'ranAt'>,
    shape?: string,
  ): Promise<ConnectionTest>;
  /** Every one, newest first (AC-163: none may be missing). */
  history(dataSourceId: string): Promise<ConnectionTest[]>;
  /** Each source's newest test of its stored settings: its health (T364, AC-157). */
  latestAsStored(
    dataSourceIds: readonly string[],
    /** Each source's settings print now: a test of those comes first (T461's review). */
    current?: ReadonlyMap<string, string>,
  ): Promise<Map<string, ConnectionTest>>;
  /**
   * The wizard's test of one not yet made (T363, AC-158): kept under `shape`,
   * the print of what it tested, with no data source until one is made from it.
   */
  recordTrial(
    test: Pick<ConnectionTest, 'ok' | 'checks' | 'fields' | 'by'>,
    shape: string,
  ): Promise<ConnectionTest>;
  /**
   * Takes such a test for one create, if it is one not yet made into a data
   * source, that passed, of exactly `shape`, run by `byKey` (null: nobody
   * signed in); false if not. In one statement, so no two creates take it
   * (T363's review).
   */
  claimTrial(testId: string, shape: string, byKey: string | null): Promise<boolean>;
  /** Gives it back, for a create that was refused after taking it. */
  releaseTrial(testId: string, shape: string): Promise<void>;
  /**
   * Takes a stored one's test for one save of the change it tried: of that
   * data source, passed, of exactly `shape`, run by `byKey`, not taken
   * before (T461, AC-158). False if not.
   */
  claimChange(
    dataSourceId: string,
    testId: string,
    shape: string,
    byKey: string | null,
  ): Promise<boolean>;
  /** Gives it back, for a save that was refused after taking it. */
  releaseChange(dataSourceId: string, testId: string, shape: string): Promise<void>;
  /** The saved change's test is a test of its stored settings now: its health (AC-163). */
  adoptChange(dataSourceId: string, testId: string, settings: string): Promise<void>;
  /**
   * The data source made from it takes it as the first test of its stored
   * settings (AC-163). False if it wasn't taken.
   */
  adoptTrial(testId: string, dataSourceId: string, settings: string): Promise<boolean>;
  /**
   * The wizard's other tests, of its earlier settings, join that history as
   * trials not stored (AC-163; T363's review): only the maker's, not yet any
   * data source's.
   */
  adoptTrials(
    testIds: readonly string[],
    dataSourceId: string,
    byKey: string | null,
  ): Promise<void>;
}

/** A taken test's print, until its data source is made or the create refused. */
const claimed = (shape: string) => `claimed:${shape}`;

/** A test's id as the table holds it: anything else is no test's. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

  /** Who ran it, as a condition: the user's key, or nobody signed in. */
  const ranBy = (byKey: string | null) =>
    byKey === null ? sql<boolean>`ran_by is null` : sql<boolean>`ran_by ->> 'key' = ${byKey}`;

  return {
    async record(dataSourceId, test, shape) {
      const row = await db
        .insertInto('connection_tests')
        .values({
          data_source_id: dataSourceId,
          ok: test.ok,
          as_stored: test.asStored,
          settings: test.settings,
          ...(shape === undefined ? {} : { shape }),
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

    async latestAsStored(dataSourceIds, current) {
      if (dataSourceIds.length === 0) return new Map();
      const newest = (only?: readonly (readonly [string, string])[]) =>
        db
          .selectFrom('connection_tests')
          .distinctOn('data_source_id')
          .select(['data_source_id', ...columns])
          .where('data_source_id', 'in', [...dataSourceIds])
          .where('as_stored', '=', true)
          .$if(only !== undefined, (query) =>
            query.where((eb) =>
              eb.or(
                only!.map(([id, settings]) =>
                  eb.and([eb('data_source_id', '=', id), eb('settings', '=', settings)]),
                ),
              ),
            ),
          )
          .orderBy('data_source_id')
          .orderBy('seq', 'desc')
          .execute();
      const found = new Map((await newest()).map((row) => [row.data_source_id!, toTest(row)]));
      // A test of the settings as they are now is the health, before a newer
      // test of settings since changed (T461's review): a change's test is
      // older than a test of what was stored when it was saved.
      const pairs = [...(current ?? new Map<string, string>())].filter(
        ([id, settings]) => found.get(id)?.settings !== settings,
      );
      if (pairs.length > 0)
        for (const row of await newest(pairs)) found.set(row.data_source_id!, toTest(row));
      return found;
    },

    async recordTrial(test, shape) {
      const row = await db
        .insertInto('connection_tests')
        .values({
          data_source_id: null,
          ok: test.ok,
          as_stored: false,
          settings: null,
          shape,
          checks: JSON.stringify(trimmed(test.checks)),
          fields: JSON.stringify(test.fields),
          ran_by: test.by === null ? null : JSON.stringify(test.by),
        })
        .returning(columns)
        .executeTakeFirstOrThrow();
      return toTest(row);
    },

    async claimTrial(testId, shape, byKey) {
      if (!UUID.test(testId)) return false;
      const taken = await db
        .updateTable('connection_tests')
        .set({ shape: claimed(shape) })
        .where('id', '=', testId)
        .where('data_source_id', 'is', null)
        .where('ok', '=', true)
        .where('shape', '=', shape)
        .where(
          byKey === null ? sql<boolean>`ran_by is null` : sql<boolean>`ran_by ->> 'key' = ${byKey}`,
        )
        .executeTakeFirst();
      return taken.numUpdatedRows === 1n;
    },

    async releaseTrial(testId, shape) {
      if (!UUID.test(testId)) return;
      await db
        .updateTable('connection_tests')
        .set({ shape })
        .where('id', '=', testId)
        .where('data_source_id', 'is', null)
        .where('shape', '=', claimed(shape))
        .execute();
    },

    async adoptTrial(testId, dataSourceId, settings) {
      if (!UUID.test(testId)) return false;
      const adopted = await db
        .updateTable('connection_tests')
        .set({ data_source_id: dataSourceId, as_stored: true, settings })
        .where('id', '=', testId)
        .where('data_source_id', 'is', null)
        .where('shape', 'like', 'claimed:%')
        .executeTakeFirst();
      return adopted.numUpdatedRows === 1n;
    },

    async adoptTrials(testIds, dataSourceId, byKey) {
      const ids = testIds.filter((id) => UUID.test(id));
      if (ids.length === 0) return;
      await db
        .updateTable('connection_tests')
        .set({ data_source_id: dataSourceId, as_stored: false, settings: null })
        .where('id', 'in', ids)
        .where('data_source_id', 'is', null)
        .where(
          byKey === null ? sql<boolean>`ran_by is null` : sql<boolean>`ran_by ->> 'key' = ${byKey}`,
        )
        .execute();
    },

    async claimChange(dataSourceId, testId, shape, byKey) {
      if (!UUID.test(testId)) return false;
      const taken = await db
        .updateTable('connection_tests')
        .set({ shape: claimed(shape) })
        .where('id', '=', testId)
        .where('data_source_id', '=', dataSourceId)
        .where('ok', '=', true)
        .where('shape', '=', shape)
        .where(ranBy(byKey))
        .executeTakeFirst();
      return taken.numUpdatedRows === 1n;
    },

    async releaseChange(dataSourceId, testId, shape) {
      if (!UUID.test(testId)) return;
      await db
        .updateTable('connection_tests')
        .set({ shape })
        .where('id', '=', testId)
        .where('data_source_id', '=', dataSourceId)
        .where('shape', '=', claimed(shape))
        .execute();
    },

    async adoptChange(dataSourceId, testId, settings) {
      if (!UUID.test(testId)) return;
      await db
        .updateTable('connection_tests')
        .set({ as_stored: true, settings })
        .where('id', '=', testId)
        .where('data_source_id', '=', dataSourceId)
        .where('shape', 'like', 'claimed:%')
        .execute();
    },
  };
}
