import type { StateKind } from '../../shell/StatusIcon';
import type { ReviewRow } from '../reviews/reviews';

/**
 * A workspace item's status from the latest of its author's proposals that
 * holds it (T358; design 04): its own, or the one it went into with another
 * item (T358's review). Waiting, rejected, or in its folder as the version
 * it landed as; none is Draft, and so is one withdrawn. `mine` is newest first.
 */
export function statusOfItem(
  mine: readonly ReviewRow[] | undefined,
  /** A model row by its path, with its file's id, which its proposal names it by (T350). */
  item: { readonly kind: string; readonly id: string; readonly fileId?: string | undefined },
): { kind: StateKind; text: string } | undefined {
  const id = item.kind === 'model' ? item.fileId : item.id;
  if (id === undefined) return undefined;
  const holds = (row: ReviewRow) =>
    (row.itemId === id && row.kind === item.kind) ||
    (row.items ?? []).some((each) => each.id === id && each.kind === item.kind);
  const latest = mine?.find(holds);
  if (latest === undefined) return undefined;
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
