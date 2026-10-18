import { randomUUID } from 'node:crypto';

import type { Kysely } from 'kysely';

import type { Database, SavedParameter } from '../db/schema';

export type { SavedParameter };

/** A saved query as its owner reads it back (T812, AC-457). */
export interface SavedQuery {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly sourceId: string;
  readonly sql: string;
  readonly parameters: readonly SavedParameter[];
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** What a save holds: everything but its id and times. */
export interface SavedQueryInput {
  readonly name: string;
  readonly description: string;
  readonly sourceId: string;
  readonly sql: string;
  readonly parameters: readonly SavedParameter[];
}

/** The answer of a save: the query, or its owner already has one by that name. */
export type SaveResult = { readonly saved: SavedQuery } | { readonly taken: true };

const queryOf = (row: {
  id: string;
  name: string;
  description: string;
  source_id: string;
  sql: string;
  parameters: SavedParameter[];
  created_at: Date;
  updated_at: Date;
}): SavedQuery => ({
  id: row.id,
  name: row.name,
  description: row.description,
  sourceId: row.source_id,
  sql: row.sql,
  parameters: row.parameters,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

/** PostgreSQL's unique violation: the owner's name clash (`saved_queries_owner_name`). */
const isTaken = (error: unknown) => (error as { code?: unknown } | null)?.code === '23505';

/**
 * Each user's saved queries (T812, AC-457, AC-483; R78 "saved queries (no
 * sharing)"): every read and write is by its owner's key, so no other user,
 * a Super-Admin included, reaches one. A name is unique to its owner.
 */
export function savedQueryStore(db: Kysely<Database>) {
  return {
    async create(ownerKey: string, input: SavedQueryInput): Promise<SaveResult> {
      try {
        const row = await db
          .insertInto('saved_queries')
          .values({
            id: randomUUID(),
            owner_key: ownerKey,
            name: input.name,
            description: input.description,
            source_id: input.sourceId,
            sql: input.sql,
            parameters: JSON.stringify(input.parameters),
          })
          .returningAll()
          .executeTakeFirstOrThrow();
        return { saved: queryOf(row) };
      } catch (error) {
        if (isTaken(error)) return { taken: true };
        throw error;
      }
    },

    /** Replaced in place: undefined where the owner has none by that id. */
    async update(ownerKey: string, id: string, input: SavedQueryInput): Promise<SaveResult | undefined> {
      try {
        const row = await db
          .updateTable('saved_queries')
          .set({
            name: input.name,
            description: input.description,
            source_id: input.sourceId,
            sql: input.sql,
            parameters: JSON.stringify(input.parameters),
            updated_at: new Date(),
          })
          .where('id', '=', id)
          .where('owner_key', '=', ownerKey)
          .returningAll()
          .executeTakeFirst();
        return row === undefined ? undefined : { saved: queryOf(row) };
      } catch (error) {
        if (isTaken(error)) return { taken: true };
        throw error;
      }
    },

    async get(ownerKey: string, id: string): Promise<SavedQuery | undefined> {
      const row = await db
        .selectFrom('saved_queries')
        .selectAll()
        .where('id', '=', id)
        .where('owner_key', '=', ownerKey)
        .executeTakeFirst();
      return row === undefined ? undefined : queryOf(row);
    },
  };
}

export type SavedQueryStore = ReturnType<typeof savedQueryStore>;
