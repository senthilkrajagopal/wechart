import { type Kysely } from 'kysely';

import type { Database } from '../db/schema';

/**
 * What each item of a proposal bound to when it was proposed (T456, AC-321;
 * R52, "a submitted item is frozen"): an approval binding any of them
 * otherwise is refused, naming it, so what lands is what was submitted.
 *
 * A document of its own kind beside the proposal, as a deleted folder's
 * record is (T540): no table of its own, and no migration. The record is
 * held under `bound`, so the columns generated from a document's top level
 * (`folder_id`, `title`, `owner`) are empty for it, and no listing by folder
 * or title finds one.
 */
export const PROPOSAL_BINDINGS = 'proposal-bindings';

/** One item's bindings: each name it uses, to the full name it bound to. */
export interface ItemBindings {
  readonly bindings: Readonly<Record<string, string>>;
  /**
   * A cube model's data source as bound (research
   * `xcube-meta-revision-and-bindings.md`, "`dataSource`"): absent on a view
   * and on a dashboard or chart, `null` for a cube that `extends` another.
   */
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
