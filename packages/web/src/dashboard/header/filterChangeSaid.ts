import { markFilterLabel, type MarkFilter } from '../markings/filterToMarked';

/**
 * A change to what narrows the dashboard, made while the header sheet may be
 * closed (AC-493; design 19 states B2, B4 and B5): a filter added or removed,
 * a bookmark applied, a cross-filter set or cleared.
 */
export type FilterChange =
  | {
      readonly kind: 'added' | 'removed';
      /** The filter, in words ("Product is Côte de Blaye or Raclette Courdavault"). */
      readonly what: string;
      /** How many filters are set after it, as the Filters toggle counts them. */
      readonly set: number;
    }
  | {
      readonly kind: 'bookmark';
      readonly name: string;
      /** The page it opened, where the dashboard has more than one. */
      readonly page?: string | undefined;
      /** How many filters are set after it; none said where the dashboard has no filters. */
      readonly set?: number | undefined;
      /**
       * How many items are marked after it, every marking's together; none
       * said on a dashboard that cross-filters (AC-120).
       */
      readonly marked?: number | undefined;
    }
  | {
      readonly kind: 'cross-filter';
      readonly what: string;
      /** The tile it came from. */
      readonly from?: string | undefined;
    }
  | {
      readonly kind: 'cross-filter cleared';
      /** The one cleared; none for all of them at once. */
      readonly what?: string | undefined;
    };

const counted = (n: number) => n.toLocaleString('en-GB');

/** "4 filters set.", "1 filter set.", "No filters set." */
function setSaid(set: number): string {
  if (set <= 0) return 'No filters set.';
  return set === 1 ? '1 filter set.' : `${counted(set)} filters set.`;
}

/**
 * What the dashboard's polite live region says for one change (AC-493): the
 * change named, and for a filter the new number set, as one message, so the
 * change is said exactly once whatever else it brings with it — the marking
 * a "Filter to marked" clears, the page and marks a bookmark restores.
 */
export function filterChangeSaid(change: FilterChange): string {
  switch (change.kind) {
    case 'added':
      return `Filter added: ${change.what}. ${setSaid(change.set)}`;
    case 'removed':
      return `Filter removed: ${change.what}. ${setSaid(change.set)}`;
    case 'bookmark': {
      const marked =
        change.marked === undefined
          ? undefined
          : change.marked <= 0
            ? 'Nothing marked.'
            : change.marked === 1
              ? '1 item marked.'
              : `${counted(change.marked)} items marked.`;
      return [
        `Bookmark applied: ${change.name}.`,
        change.page === undefined ? undefined : `Page ${change.page}.`,
        change.set === undefined ? undefined : setSaid(change.set),
        marked,
      ]
        .filter((part) => part !== undefined)
        .join(' ');
    }
    case 'cross-filter':
      return `Cross-filter: ${change.what}${change.from === undefined ? '' : `, from ${change.from}`}.`;
    case 'cross-filter cleared':
      return change.what === undefined
        ? 'Cross-filters cleared.'
        : `Cross-filter cleared: ${change.what}.`;
  }
}

/** How many values a filter made from a marking names before counting the rest. */
const NAMED = 3;

/**
 * A filter made from a marking (AC-113), in words for its announcement
 * (design 19 B2): "Product is Côte de Blaye or Raclette Courdavault", or "is
 * not" for Filter out marked, where it holds values of one field; three
 * named, then "or n more". Anything else — a tuple across fields, a range, a
 * tile marked whole — is said by the bar's own label for it, which counts
 * rather than misstates (`summariseMarking`).
 */
export function markFilterSaid(
  filter: MarkFilter,
  titleOf: (member: string) => string | undefined,
): string {
  const { items, ranges, wholes } = filter.predicate;
  const members = new Set(items.flatMap((item) => item.map((part) => part.member)));
  const plain =
    items.length > 0 &&
    ranges.length === 0 &&
    (wholes ?? []).length === 0 &&
    members.size === 1 &&
    items.every((item) => item.length === 1);
  if (!plain) return markFilterLabel(filter);
  const member = [...members][0] ?? '';
  const values = items.map((item) => String(item[0]?.value ?? ''));
  const listed =
    values.length > NAMED
      ? `${values.slice(0, NAMED).join(', ')} or ${counted(values.length - NAMED)} more`
      : values.length === 1
        ? (values[0] ?? '')
        : `${values.slice(0, -1).join(', ')} or ${values[values.length - 1] ?? ''}`;
  return `${titleOf(member) ?? member} ${filter.negate ? 'is not' : 'is'} ${listed}`;
}
