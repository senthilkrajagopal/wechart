import type { StateKind } from '../../shell/StatusIcon';
import type { ReviewRow } from '../reviews/reviews';

/**
 * A workspace item's status from the latest of its author's proposals that
 * holds it (T358; design 04): its own, or the one it went into with another
 * item (T358's review). Waiting, rejected, or in its folder as the version
 * it landed as; none is Draft, and so is one withdrawn. `mine` is newest first.
 */
type ProposedItem = {
  readonly kind: string;
  readonly id: string;
  /** A model row by its path, with its file's id, which its proposal names it by (T350). */
  readonly fileId?: string | undefined;
};

/** The latest of `mine` (newest first) holding the item, its own or another's. */
function latestHolding(
  mine: readonly ReviewRow[] | undefined,
  item: ProposedItem,
): { latest: ReviewRow; id: string } | undefined {
  const id = item.kind === 'model' ? item.fileId : item.id;
  if (id === undefined) return undefined;
  const holds = (row: ReviewRow) =>
    (row.itemId === id && row.kind === item.kind) ||
    (row.items ?? []).some((each) => each.id === id && each.kind === item.kind);
  const latest = mine?.find(holds);
  return latest === undefined ? undefined : { latest, id };
}

/**
 * The proposal a workspace item waits in, by its id (T694; design 04, pin
 * 7): the latest holding it, while it is open. Its row's "View proposal".
 */
export function waitingProposalOf(
  mine: readonly ReviewRow[] | undefined,
  item: ProposedItem,
): string | undefined {
  const held = latestHolding(mine, item);
  return held?.latest.status === 'open' ? held.latest.id : undefined;
}

export function statusOfItem(
  mine: readonly ReviewRow[] | undefined,
  item: ProposedItem,
): { kind: StateKind; text: string } | undefined {
  const held = latestHolding(mine, item);
  if (held === undefined) return undefined;
  const { latest, id } = held;
  switch (latest.status) {
    case 'open':
      return { kind: 'run', text: 'Waiting for review' };
    case 'rejected':
      return { kind: 'err', text: 'Rejected' };
    case 'approved':
      // The version landed is the proposal's own item's, not another's.
      return {
        kind: 'ok',
        text:
          latest.landedVersion === null || latest.itemId !== id
            ? 'In folder'
            : `In folder as version ${String(latest.landedVersion)}`,
      };
    case 'withdrawn':
      return undefined;
  }
}
