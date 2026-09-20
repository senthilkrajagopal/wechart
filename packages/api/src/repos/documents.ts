import type { Kysely } from 'kysely';

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
  };
}

interface DocumentRow {
  kind: string;
  id: string;
  body: unknown;
  version: number;
  updated_at: Date;
}

function toDocument(row: DocumentRow): StoredDocument {
  return {
    kind: row.kind as DocumentKind,
    id: row.id,
    body: row.body as Record<string, unknown>,
    version: row.version,
    updatedAt: row.updated_at,
  };
}
