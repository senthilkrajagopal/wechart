import { sql, type Kysely } from 'kysely';

import type { Database } from '../db/schema';

/**
 * What xcube last acknowledged of each model (T419, AC-333): its store's
 * generation, the revision, and the content hash. A new generation means
 * xcube's store was made again, and the revision recorded before it means
 * nothing there (research, Gotcha 8).
 */
export interface Publication {
  readonly generation: string;
  readonly revision: number;
  readonly contentHash: string;
}

export interface PublicationStore {
  get(model: string): Promise<Publication | undefined>;
  put(model: string, publication: Publication): Promise<void>;
}

/** For tests and for a server with no database. */
export function memoryPublications(): PublicationStore {
  const held = new Map<string, Publication>();
  return {
    get: async (model) => held.get(model),
    put: async (model, publication) => {
      held.set(model, publication);
    },
  };
}

export function publicationStore(db: Kysely<Database>): PublicationStore {
  return {
    async get(model) {
      const row = await db
        .selectFrom('model_publications')
        .select(['xcube_generation', 'xcube_revision', 'content_hash'])
        .where('model_id', '=', model)
        .executeTakeFirst();
      return row === undefined
        ? undefined
        : {
            generation: row.xcube_generation,
            revision: row.xcube_revision,
            contentHash: row.content_hash,
          };
    },
    async put(model, { generation, revision, contentHash }) {
      await db
        .insertInto('model_publications')
        .values({
          model_id: model,
          xcube_generation: generation,
          xcube_revision: revision,
          content_hash: contentHash,
        })
        .onConflict((conflict) =>
          conflict.column('model_id').doUpdateSet({
            xcube_generation: generation,
            xcube_revision: revision,
            content_hash: contentHash,
            synced_at: sql`now()`,
          }),
        )
        .execute();
    },
  };
}
