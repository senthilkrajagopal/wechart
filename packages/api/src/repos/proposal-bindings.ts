import { type Kysely } from 'kysely';

import type { Database } from '../db/schema';

/**
 * What each model of a proposal ran on when it was proposed (T456, AC-321;
 * R31, R52, "a submitted item is frozen"): an approval that would run one on
 * another data source is refused, naming both, so what lands is what was
 * submitted. Under R71 only the data source is held (T713): a name is one
 * item's, so a cube's names can't bind otherwise; rows written before keep
 * their `bindings`, which nothing reads.
 *
 * A document of its own kind beside the proposal, as a deleted folder's
 * record is (T540): no table of its own, and no migration. The record is
 * held under `bound`, so the columns generated from a document's top level
 * (`folder_id`, `title`, `owner`) are empty for it, and no listing by folder
 * or title finds one.
 */
export const PROPOSAL_BINDINGS = 'proposal-bindings';

/** One model's data source as it ran when proposed: its own, or its parent's through `extends`. */
export interface ItemBindings {
  /** `default` for a cube naming none; null where none can be told (a view). */
  readonly dataSource?: string | null;
}

/** A proposal's items' bindings, by `<kind>/<id>`. */
export type ProposalBindings = Readonly<Record<string, ItemBindings>>;

export interface ProposalBindingStore {
  /** Recorded once, as it was proposed. */
  keep(proposalId: string, bound: ProposalBindings): Promise<void>;
  /** None for a proposal made before T456, or with nothing bound. */
  get(proposalId: string): Promise<ProposalBindings | null>;
}

export function proposalBindingStore(db: Kysely<Database>): ProposalBindingStore {
  return {
    async keep(proposalId, bound) {
      await db
        .insertInto('documents')
        .values({ kind: PROPOSAL_BINDINGS, id: proposalId, body: JSON.stringify({ bound }) })
        .onConflict((conflict) => conflict.columns(['kind', 'id']).doNothing())
        .execute();
    },

    async get(proposalId) {
      const row = await db
        .selectFrom('documents')
        .select('body')
        .where('kind', '=', PROPOSAL_BINDINGS)
        .where('id', '=', proposalId)
        .executeTakeFirst();
      const bound = (row?.body as { bound?: unknown } | undefined)?.bound;
      return bound !== null && typeof bound === 'object' ? (bound as ProposalBindings) : null;
    },
  };
}
