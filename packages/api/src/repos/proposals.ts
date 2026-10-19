import { randomUUID } from 'node:crypto';

import { sql, type Kysely, type Selectable } from 'kysely';

import type { Database, ProposalItemTable, ProposalTable } from '../db/schema';

/**
 * Proposals (T349, AC-284; design 05 of 2026-09-27): a workspace item offered
 * to its target folder, holding what it would land as it was when proposed —
 * the item first, then what goes with it, such as a dashboard's charts — with
 * the folder, the author, the time and an optional description. The folder
 * keeps serving what it had until an approval (AC-286, AC-288).
 */
// A Map's custom boundary set too (T979, AC-628).
export const PROPOSAL_KINDS = ['dashboard', 'chart', 'data-source', 'model', 'boundary-set'] as const;
export type ProposalKind = (typeof PROPOSAL_KINDS)[number];
export type ProposalStatus = 'open' | 'approved' | 'rejected' | 'withdrawn';

/**
 * A description's and a reason's limit, in characters: Unicode code points,
 * as Postgres's `char_length` counts them and the dialog's counter must too
 * (T358). An emoji made of several code points counts as several.
 */
export const PROPOSAL_TEXT_LIMIT = 1000;

/** The item one would replace in the folder, at its version then; none for a new one. */
export interface Replaces {
  readonly id: string;
  readonly version: number;
}

export interface ProposedItem {
  readonly kind: ProposalKind;
  readonly id: string;
  readonly title: string;
  /** The workspace item's version proposed. */
  readonly version: number;
  /** The item as it was when proposed: a data source's credentials still sealed. */
  readonly snapshot: Record<string, unknown>;
  /** The folder it lands in: the proposal's target, or a library chart's own. */
  readonly landsIn: string;
  readonly replaces: Replaces | null;
}

export interface NewProposal {
  readonly author: { readonly key: string; readonly name: string };
  readonly targetFolderId: string;
  readonly description: string | null;
  /** The item proposed first, then what goes with it. */
  readonly items: readonly ProposedItem[];
}

export interface Proposal {
  readonly id: string;
  readonly kind: ProposalKind;
  readonly itemId: string;
  readonly title: string;
  readonly targetFolderId: string;
  readonly author: { readonly key: string; readonly name: string };
  readonly description: string | null;
  readonly proposedAt: Date;
  readonly status: ProposalStatus;
  readonly replaces: Replaces | null;
  readonly items: readonly ProposedItem[];
  readonly decision: {
    readonly by: { readonly key: string; readonly name: string };
    readonly at: Date;
    readonly reason: string | null;
  } | null;
  /** When its author dismissed a rejection's band (T358, R42.1); none until then. */
  readonly dismissedAt: Date | null;
}

/** The item waits in an open proposal already. */
export class OpenProposalError extends Error {
  constructor(
    readonly kind: ProposalKind,
    readonly itemId: string,
  ) {
    super('It is waiting for review already.');
    this.name = 'OpenProposalError';
  }
}

export interface ProposalStore {
  create(proposal: NewProposal): Promise<Proposal>;
  get(id: string): Promise<Proposal | null>;
  /** The open proposal an item waits in, as its item or going with another's, if any. */
  openFor(kind: ProposalKind, itemId: string): Promise<Proposal | null>;
  /**
   * An item's latest proposal, as its item or going with another's: the open
   * one it waits in, else the one it was last in (T353; the band on the
   * author's item, design 05 state M); none if it was never proposed.
   */
  latestFor(kind: ProposalKind, itemId: string): Promise<Proposal | null>;
  /**
   * Decides an open proposal (T352, T353): its status, who, when and why.
   * A rejected or withdrawn one's items may then be proposed again; an
   * approved one's once it has landed (`settle`). None if it isn't open:
   * another's decision came first, or there is no such proposal.
   */
  decide(
    id: string,
    decision: {
      readonly status: Exclude<ProposalStatus, 'open'>;
      readonly by: { readonly key: string; readonly name: string };
      readonly reason: string | null;
    },
  ): Promise<Proposal | null>;
  /** An approval that couldn't land, undone: open again, as it was (T352). */
  reopen(id: string): Promise<void>;
  /** An approval landed: its items may be proposed again (T352's review). */
  settle(id: string): Promise<void>;
  /**
   * Its author dismisses a rejection's band (T358, R42.1): the dismissed
   * proposal, or none if it isn't a rejection of theirs.
   */
  dismiss(id: string, authorKey: string): Promise<Proposal | null>;
  /** Every open proposal, newest first: the Reviews page's to decide (T355). */
  open(): Promise<Proposal[]>;
  /** An author's, in every state, newest first: My proposals (T355). */
  byAuthor(authorKey: string): Promise<Proposal[]>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function proposalStore(db: Kysely<Database>): ProposalStore {
  /** The open proposal holding an item, as its item or going with another's. */
  const openHolding = async (kind: string, itemId: string) =>
    (
      await db
        .selectFrom('proposal_items')
        .select('proposal_id')
        .where('kind', '=', kind)
        .where('item_id', '=', itemId)
        .where('open', '=', true)
        .executeTakeFirst()
    )?.proposal_id;
  const read = async (id: string): Promise<Proposal | null> => {
    const row = await db
      .selectFrom('proposals')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    if (row === undefined) return null;
    const items = await db
      .selectFrom('proposal_items')
      .selectAll()
      .where('proposal_id', '=', id)
      .orderBy('position')
      .execute();
    return proposalOf(row, items);
  };

  /**
   * Proposals as the Reviews lists show them (T355's review), newest first:
   * two queries in all, and of each item's snapshot only whether it is a
   * dashboard's own chart and what it was copied from, never what it holds.
   */
  const listed = async (
    filter: { readonly open: true } | { readonly authorKey: string },
  ): Promise<Proposal[]> => {
    const rows = await (
      'open' in filter
        ? db.selectFrom('proposals').selectAll().where('status', '=', 'open')
        : db.selectFrom('proposals').selectAll().where('author_key', '=', filter.authorKey)
    )
      .orderBy('proposed_at', 'desc')
      .execute();
    if (rows.length === 0) return [];
    const items = await db
      .selectFrom('proposal_items')
      .select([
        'proposal_id',
        'position',
        'kind',
        'item_id',
        'title',
        'version',
        'lands_in',
        'replaces_id',
        'replaces_version',
        sql<Record<string, unknown>>`jsonb_strip_nulls(jsonb_build_object(
          'localToDashboardId', snapshot -> 'localToDashboardId',
          'origin', jsonb_build_object('id', snapshot -> 'origin' -> 'id')
        ))`.as('snapshot'),
      ])
      .where(
        'proposal_id',
        'in',
        rows.map((row) => row.id),
      )
      .orderBy('position')
      .execute();
    const byProposal = new Map<string, (typeof items)[number][]>();
    for (const item of items)
      byProposal.set(item.proposal_id, [...(byProposal.get(item.proposal_id) ?? []), item]);
    return rows.map((row) => proposalOf(row, byProposal.get(row.id) ?? []));
  };

  const proposalOf = (
    row: Selectable<ProposalTable>,
    items: readonly Omit<Selectable<ProposalItemTable>, 'open'>[],
  ): Proposal => {
    const first = items[0];
    return {
      id: row.id,
      kind: row.kind as ProposalKind,
      itemId: row.item_id,
      title: row.title,
      targetFolderId: row.target_folder_id,
      author: { key: row.author_key, name: row.author_name },
      description: row.description,
      proposedAt: row.proposed_at,
      status: row.status as ProposalStatus,
      replaces:
        first?.replaces_id == null || first.replaces_version === null
          ? null
          : { id: first.replaces_id, version: first.replaces_version },
      items: items.map((item) => ({
        kind: item.kind as ProposalKind,
        id: item.item_id,
        title: item.title,
        version: item.version,
        snapshot: item.snapshot,
        landsIn: item.lands_in,
        replaces:
          item.replaces_id === null || item.replaces_version === null
            ? null
            : { id: item.replaces_id, version: item.replaces_version },
      })),
      decision:
        row.decided_by_key === null || row.decided_at === null
          ? null
          : {
              by: { key: row.decided_by_key, name: row.decided_by_name ?? row.decided_by_key },
              at: row.decided_at,
              reason: row.reason,
            },
      dismissedAt: row.dismissed_at ?? null,
    };
  };

  return {
    async create(proposal) {
      const item = proposal.items[0];
      if (item === undefined) throw new Error('A proposal holds at least its item.');
      const id = randomUUID();
      try {
        await db.transaction().execute(async (tx) => {
          await tx
            .insertInto('proposals')
            .values({
              id,
              kind: item.kind,
              item_id: item.id,
              title: item.title,
              target_folder_id: proposal.targetFolderId,
              author_key: proposal.author.key,
              author_name: proposal.author.name,
              description: proposal.description,
              // Stamped here, to the millisecond a JavaScript date holds.
              proposed_at: new Date(),
              decided_by_key: null,
              decided_by_name: null,
              decided_at: null,
              reason: null,
            })
            .execute();
          await tx
            .insertInto('proposal_items')
            .values(
              proposal.items.map((each, position) => ({
                proposal_id: id,
                position,
                kind: each.kind,
                item_id: each.id,
                title: each.title,
                version: each.version,
                snapshot: JSON.stringify(each.snapshot),
                lands_in: each.landsIn,
                replaces_id: each.replaces?.id ?? null,
                replaces_version: each.replaces?.version ?? null,
              })),
            )
            .execute();
        });
      } catch (failure) {
        const { code, constraint } = failure as { code?: string; constraint?: string };
        if (
          code === '23505' &&
          (constraint === 'proposals_one_open_per_item' ||
            constraint === 'proposal_items_one_open_per_item')
        ) {
          // Which of its items waits already: the item itself, or one going with it.
          for (const each of proposal.items)
            if ((await openHolding(each.kind, each.id)) !== undefined)
              throw new OpenProposalError(each.kind, each.id);
          throw new OpenProposalError(item.kind, item.id);
        }
        throw failure;
      }
      return (await read(id))!;
    },

    async get(id) {
      return UUID.test(id) ? read(id) : null;
    },

    async openFor(kind, itemId) {
      const id = await openHolding(kind, itemId);
      return id === undefined ? null : read(id);
    },

    async latestFor(kind, itemId) {
      // As its item or going with another's (T353's review): the open one it
      // waits in first, else the one it was last in.
      const row = await db
        .selectFrom('proposal_items')
        .innerJoin('proposals', 'proposals.id', 'proposal_items.proposal_id')
        .select('proposals.id')
        .where('proposal_items.kind', '=', kind)
        .where('proposal_items.item_id', '=', itemId)
        .orderBy('proposal_items.open', 'desc')
        .orderBy('proposals.proposed_at', 'desc')
        .executeTakeFirst();
      return row === undefined ? null : read(row.id);
    },

    async decide(id, { status, by, reason }) {
      if (!UUID.test(id)) return null;
      const decided = await db.transaction().execute(async (tx) => {
        // Only an open one: of two decisions at once, the first stands.
        const row = await tx
          .updateTable('proposals')
          .set({
            status,
            decided_by_key: by.key,
            decided_by_name: by.name,
            // Stamped here, to the millisecond a JavaScript date holds.
            decided_at: new Date(),
            reason,
          })
          .where('id', '=', id)
          .where('status', '=', 'open')
          .returning('id')
          .executeTakeFirst();
        if (row === undefined) return false;
        // An approval holds its items until it has landed (`settle`).
        if (status !== 'approved')
          await tx
            .updateTable('proposal_items')
            .set({ open: false })
            .where('proposal_id', '=', id)
            .execute();
        return true;
      });
      return decided ? read(id) : null;
    },

    async reopen(id) {
      if (!UUID.test(id)) return;
      // Its items were held all along, so nothing took them meanwhile.
      await db
        .updateTable('proposals')
        .set({
          status: 'open',
          decided_by_key: null,
          decided_by_name: null,
          decided_at: null,
          reason: null,
        })
        .where('id', '=', id)
        .where('status', '=', 'approved')
        .execute();
    },

    open: () => listed({ open: true }),

    byAuthor: (authorKey) => listed({ authorKey }),

    async dismiss(id, authorKey) {
      if (!UUID.test(id)) return null;
      const row = await db
        .updateTable('proposals')
        .set({ dismissed_at: new Date() })
        .where('id', '=', id)
        .where('author_key', '=', authorKey)
        .where('status', '=', 'rejected')
        .returning('id')
        .executeTakeFirst();
      return row === undefined ? null : read(id);
    },

    async settle(id) {
      if (!UUID.test(id)) return;
      await db
        .updateTable('proposal_items')
        .set({ open: false })
        .where('proposal_id', '=', id)
        .execute();
    },
  };
}
