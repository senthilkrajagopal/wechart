import { migrateChartDocument } from '@wechart/core';
import { sql, type Kysely } from 'kysely';

import type { Database } from '../db/schema';

/**
 * Everything wechart saves, as named by AC-014: "a dashboard, chart, folder,
 * bookmark or setting".
 */
export const DOCUMENT_KINDS = ['dashboard', 'chart', 'folder', 'bookmark', 'setting'] as const;

export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

export interface StoredDocument {
  readonly kind: DocumentKind;
  readonly id: string;
  readonly body: Record<string, unknown>;
  readonly version: number;
  readonly updatedAt: Date;
}

/** The same document more than once in one `updateTogether`. */
export class DuplicateWriteError extends Error {
  constructor() {
    super('The same document appears more than once in one save.');
    this.name = 'DuplicateWriteError';
  }
}

/**
 * AC-015: the save is refused and the user is told the object changed. The
 * current version travels on the error so the UI can say what it is now,
 * rather than only that something went wrong.
 */
export class StaleDocumentError extends Error {
  constructor(
    readonly kind: DocumentKind,
    readonly id: string,
    readonly expectedVersion: number,
    readonly currentVersion: number,
  ) {
    super(
      `This ${kind} changed since you opened it: you are saving over version ` +
        `${String(expectedVersion)}, and it is now at version ${String(currentVersion)}.`,
    );
    this.name = 'StaleDocumentError';
  }
}

export class DocumentNotFoundError extends Error {
  constructor(
    readonly kind: DocumentKind,
    readonly id: string,
  ) {
    super(`No ${kind} found with id ${id}`);
    this.name = 'DocumentNotFoundError';
  }
}

export interface CreateInput {
  readonly kind: DocumentKind;
  readonly id: string;
  readonly body: Record<string, unknown>;
}

export interface UpdateInput extends CreateInput {
  /** The version the caller last read. */
  readonly expectedVersion: number;
}

/**
 * A document written at version 0 in `updateTogether`: not yet stored —
 * documents start at 1 — so created (T132, a chart made on a dashboard and
 * written with it). One already stored is not written over: that is a stale
 * save, as any other write at a version the document has moved past.
 */
async function created(db: Kysely<Database>, write: UpdateInput): Promise<StoredDocument> {
  const row = await db
    .insertInto('documents')
    .values({ kind: write.kind, id: write.id, body: JSON.stringify(write.body) })
    .onConflict((conflict) => conflict.columns(['kind', 'id']).doNothing())
    .returningAll()
    .executeTakeFirst();
  if (row !== undefined) return toDocument(row);
  const current = await db
    .selectFrom('documents')
    .select('version')
    .where('kind', '=', write.kind)
    .where('id', '=', write.id)
    .executeTakeFirstOrThrow();
  throw new StaleDocumentError(write.kind, write.id, 0, current.version);
}

export function documents(db: Kysely<Database>) {
  return {
    async create({ kind, id, body }: CreateInput): Promise<StoredDocument> {
      const row = await db
        .insertInto('documents')
        .values({ kind, id, body: JSON.stringify(body) })
        .returningAll()
        .executeTakeFirstOrThrow();

      return toDocument(row);
    },

    async get(kind: DocumentKind, id: string): Promise<StoredDocument | null> {
      const row = await db
        .selectFrom('documents')
        .selectAll()
        .where('kind', '=', kind)
        .where('id', '=', id)
        .executeTakeFirst();

      return row ? toDocument(row) : null;
    },

    /**
     * Compare-and-set on `version`. The update matches only when the row is
     * still at `expectedVersion`, so two sessions racing cannot both win: the
     * second matches no row, and we then read the row back to report what it
     * actually is now (AC-015).
     */
    async update({ kind, id, body, expectedVersion }: UpdateInput): Promise<StoredDocument> {
      const updated = await db
        .updateTable('documents')
        .set({ body: JSON.stringify(body), version: expectedVersion + 1, updated_at: new Date() })
        .where('kind', '=', kind)
        .where('id', '=', id)
        .where('version', '=', expectedVersion)
        .returningAll()
        .executeTakeFirst();

      if (updated) return toDocument(updated);

      const current = await db
        .selectFrom('documents')
        .select('version')
        .where('kind', '=', kind)
        .where('id', '=', id)
        .executeTakeFirst();

      if (!current) throw new DocumentNotFoundError(kind, id);
      throw new StaleDocumentError(kind, id, expectedVersion, current.version);
    },

    /**
     * Write several documents all-or-nothing, each checked against the version
     * its caller read (T192, AC-183: a dashboard and the charts edited from
     * its tiles). Returned in the order given.
     *
     * Following docs/research/db-access.md, "Query-time transactions":
     *
     * - **One transaction.** A throw inside it rolls back every write already
     *   made and is rethrown unchanged, so a `StaleDocumentError` still
     *   reaches the caller as itself and maps to a 409. It must be let out:
     *   caught in here and returned from, the writes before it would commit.
     * - **The repo is built from the transaction**, never from `db`: a query
     *   through `db` runs on another pool connection, outside the
     *   transaction, where it is neither rolled back nor isolated — and it can
     *   wait forever on a row this transaction has locked.
     * - **One write at a time**, never `Promise.all`: rows have been seen to
     *   persist after a failure under it.
     * - **Sorted by (kind, id)**, the table's key, so two saves over
     *   overlapping documents take their row locks in the same order — the
     *   documented defence against deadlock.
     * - **READ COMMITTED**, Postgres's default. The version predicate still
     *   catches a lost race there: the second writer waits for the first's
     *   lock, then re-checks its WHERE against the committed row and matches
     *   nothing. A stricter level would turn that case into a raw 40001
     *   instead of the stale error this relies on.
     *
     * The same document twice is refused before anything is written: the
     * second write would be stale against the first.
     *
     * Not to be called on a repo already built from a transaction — Kysely
     * does not nest them, and throws.
     */
    async updateTogether(writes: readonly UpdateInput[]): Promise<StoredDocument[]> {
      const key = (write: UpdateInput) => `${write.kind}\u0000${write.id}`;
      if (new Set(writes.map(key)).size !== writes.length) {
        throw new DuplicateWriteError();
      }

      const ordered = [...writes].sort((a, b) =>
        a.kind !== b.kind ? (a.kind < b.kind ? -1 : 1) : a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
      );

      const written = await db
        .transaction()
        .setIsolationLevel('read committed')
        .execute(async (trx) => {
          const inside = documents(trx);
          const out = new Map<string, StoredDocument>();
          for (const write of ordered)
            out.set(
              key(write),
              // Only a chart is made this way (T132); anything else at 0 is an
              // update of a version no document has, refused.
              await (write.expectedVersion === 0 && write.kind === 'chart'
                ? created(trx, write)
                : inside.update(write)),
            );
          return out;
        });

      return writes.map((write) => written.get(key(write)) as StoredDocument);
    },

    /**
     * Several made together, or none (T344): a dashboard copied into a
     * workspace with its charts, so a copy is never left without a chart it
     * shows.
     */
    async createTogether(creates: readonly CreateInput[]): Promise<StoredDocument[]> {
      if (creates.length === 0) return [];
      const rows = await db.transaction().execute(async (trx) =>
        trx
          .insertInto('documents')
          .values(creates.map(({ kind, id, body }) => ({ kind, id, body: JSON.stringify(body) })))
          .returningAll()
          .execute(),
      );
      return rows.map(toDocument);
    },

    /**
     * The items of a kind copied from `originId` (T344), each naming it in
     * its `origin`, in `inFolders` when given (a workspace's: T344's review),
     * in a fixed order.
     */
    async withOrigin(
      kind: DocumentKind,
      originId: string,
      inFolders?: readonly string[],
    ): Promise<StoredDocument[]> {
      if (inFolders !== undefined && inFolders.length === 0) return [];
      const rows = await db
        .selectFrom('documents')
        .selectAll()
        .where('kind', '=', kind)
        .where(sql<boolean>`body -> 'origin' ->> 'id' = ${originId}`)
        .$if(inFolders !== undefined, (query) =>
          query.where(sql<string>`body ->> 'folderId'`, 'in', [...inFolders!]),
        )
        .orderBy('id')
        .execute();
      return rows.map(toDocument);
    },

    /** Remove an object. Returns false when there was nothing to remove. */
    async remove(kind: DocumentKind, id: string): Promise<boolean> {
      const result = await db
        .deleteFrom('documents')
        .where('kind', '=', kind)
        .where('id', '=', id)
        .executeTakeFirst();

      return (result.numDeletedRows ?? 0n) > 0n;
    },

    /**
     * Add a library chart to a dashboard (AC-022). Idempotent: adding a chart
     * a dashboard already uses changes nothing, so a double click does not
     * produce two copies of the same tile reference.
     */
    async attachChart(dashboardId: string, chartId: string): Promise<StoredDocument> {
      const current = await db
        .selectFrom('documents')
        .selectAll()
        .where('kind', '=', 'dashboard')
        .where('id', '=', dashboardId)
        .executeTakeFirst();

      if (!current) throw new DocumentNotFoundError('dashboard', dashboardId);

      const currentBody = current.body as Record<string, unknown>;
      const charts = Array.isArray(currentBody['charts'])
        ? (currentBody['charts'] as unknown[]).filter((id): id is string => typeof id === 'string')
        : [];

      const body = {
        ...currentBody,
        charts: charts.includes(chartId) ? charts : [...charts, chartId],
      };

      const updated = await db
        .updateTable('documents')
        .set({ body: JSON.stringify(body), version: current.version + 1, updated_at: new Date() })
        .where('kind', '=', 'dashboard')
        .where('id', '=', dashboardId)
        .where('version', '=', current.version)
        .returningAll()
        .executeTakeFirstOrThrow();

      return toDocument(updated);
    },

    /**
     * Rename or move, merging into the existing body (AC-021).
     *
     * The id never changes, which is what keeps references working: everything
     * that points at this object points at its id, not at its title or the
     * folder it happens to sit in. A move is a change of one field, not a
     * re-creation, and nothing referring to it has to be told.
     */
    async relocate({
      kind,
      id,
      title,
      folderId,
    }: {
      kind: DocumentKind;
      id: string;
      title?: string;
      folderId?: string;
    }): Promise<StoredDocument> {
      const current = await db
        .selectFrom('documents')
        .selectAll()
        .where('kind', '=', kind)
        .where('id', '=', id)
        .executeTakeFirst();

      if (!current) throw new DocumentNotFoundError(kind, id);

      const body = {
        ...(current.body as Record<string, unknown>),
        ...(title === undefined ? {} : { title }),
        ...(folderId === undefined ? {} : { folderId }),
      };

      const updated = await db
        .updateTable('documents')
        .set({ body: JSON.stringify(body), version: current.version + 1, updated_at: new Date() })
        .where('kind', '=', kind)
        .where('id', '=', id)
        .where('version', '=', current.version)
        .returningAll()
        .executeTakeFirstOrThrow();

      return toDocument(updated);
    },
  };
}

interface DocumentRow {
  kind: string;
  id: string;
  body: unknown;
  version: number;
  updated_at: Date;
}

/**
 * The single place a stored row becomes a document, and therefore the single
 * place an older chart format is upgraded (AC-181).
 *
 * Upgrading on read rather than in a batch migration means a chart saved by an
 * older wechart opens correctly the moment this version runs, with no
 * migration step to remember and no window where half the rows are converted.
 * It also never writes: the upgrade is re-applied on every read until the user
 * saves the chart, which is what Grafana's panel migrations do and is the safe
 * direction — reading a chart cannot corrupt it.
 */
function toDocument(row: DocumentRow): StoredDocument {
  const body =
    row.kind === 'chart'
      ? (migrateChartDocument(row.body) as Record<string, unknown>)
      : (row.body as Record<string, unknown>);

  return {
    kind: row.kind as DocumentKind,
    id: row.id,
    body,
    version: row.version,
    updatedAt: row.updated_at,
  };
}
