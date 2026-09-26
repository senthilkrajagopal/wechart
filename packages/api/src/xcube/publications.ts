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
  /**
   * Recorded over what's held, except a lower revision of the same
   * generation: within one store xcube's revisions only rise, so a replica
   * that read xcube before another's publish was recorded can't put the older
   * revision back, for every token to name (T421's review, AC-334).
   */
  put(model: string, publication: Publication): Promise<void>;
}

const lowers = (held: Publication | undefined, next: Publication) =>
  held !== undefined && held.generation === next.generation && next.revision < held.revision;

/** For tests and for a server with no database. */
export function memoryPublications(): PublicationStore {
  const held = new Map<string, Publication>();
  return {
    get: async (model) => held.get(model),
    put: async (model, publication) => {
      if (!lowers(held.get(model), publication)) held.set(model, publication);
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
          conflict
            .column('model_id')
            .doUpdateSet({
              xcube_generation: generation,
              xcube_revision: revision,
              content_hash: contentHash,
              synced_at: sql`now()`,
            })
            // In one statement, so two replicas' writes can't interleave.
            .where((row) =>
              row.or([
                row('model_publications.xcube_generation', '<>', generation),
                row('model_publications.xcube_revision', '<=', revision),
              ]),
            ),
        )
        .execute();
    },
  };
}
