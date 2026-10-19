import { markedCount, type MarkedItem, type MarkingPredicate } from '@wechart/core';

/**
 * A marking's items as tab-separated text (T271, AC-241): a header row of the
 * members' titles, then a line per marked item, each member's value in its
 * column — for Copy › Marked values, to paste into a spreadsheet.
 *
 * - A column for each member any item names, in the order first named; an
 *   item that does not name one leaves it empty, as items of several members
 *   do.
 * - A whole tile marked (Mark all, AC-115) is the items that tile draws
 *   marked (`itemsOfTile`), each item once.
 * - A blank is written as nothing, and a tab or line break inside a value as
 *   a space: TSV carries neither inside a field (IANA TSV, research/
 *   clipboard-and-image-export.md, Gotchas; decided so by T271).
 * - A range is written as its bounds in its member's column.
 */
export function markedValuesTsv(
  predicate: MarkingPredicate,
  titleOf: (member: string) => string | undefined,
  itemsOfTile?: (tileId: string) => readonly MarkedItem[] | undefined,
): string {
  // Each item once: one marked by a click can be in a whole tile's too (a
  // Mark all keeps what was clicked; T271's review).
  const seen = new Set<string>();
  const items: MarkedItem[] = [
    ...predicate.items,
    ...(predicate.wholes ?? []).flatMap((whole) => itemsOfTile?.(whole.tileId) ?? []),
  ].filter((item) => {
    const key = JSON.stringify(
      [...item]
        .map((part) => [part.member, part.value])
        .sort(([a], [b]) => String(a).localeCompare(String(b))),
    );
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const rows: Map<string, string>[] = [
    ...items.map((item) => new Map(item.map((part) => [part.member, field(part.value)] as const))),
    ...predicate.ranges.map(
      (range) => new Map([[range.member, `${field(range.from)} – ${field(range.to)}`] as const]),
    ),
  ];
  const members = [...new Set(rows.flatMap((row) => [...row.keys()]))];
  if (members.length === 0) return '';
  return [
    members.map((member) => field(titleOf(member) ?? member)).join('\t'),
    ...rows.map((row) => members.map((member) => row.get(member) ?? '').join('\t')),
  ].join('\n');
}

/**
 * R81's types that show another tile's marked share in their own items — a
 * graphical table's cells, a waterfall's steps, a histogram's bins — rather
 * than marking items whole (AC-098; design 23 screen 2 pin 12). While their
 * items are all only partly marked, their badge says whose share they show
 * in place of a count. A stack drawn at 100 % joins them (T958, T935-1): its
 * segments draw the marked share as a fraction of themselves.
 */
const SHARE_SHOWN_TYPES: ReadonlySet<string> = new Set([
  'graphicalTable',
  'waterfall',
  'histogram',
]);

/**
 * Whether a tile's badge says "‹marking›'s share shown" (T935, AC-098): one
 * of R81's share-showing types, its items all only partly marked — it groups
 * by none of what the marking names, so its marked share is asked of Cube
 * (`needsMarkedShare`).
 */
export function showsShareOnly(
  chartType: string,
  partlyMarked: boolean,
  /** Drawn as a stack at 100 % (`isPercentStack`). */
  percentStack = false,
): boolean {
  return partlyMarked && (percentStack || SHARE_SHOWN_TYPES.has(chartType));
}

/**
 * Whose share a tile shows, for its badge (T935, AC-098): the marked values,
 * two by name and the rest counted ("EMEA, APAC +2"), a range by its bounds;
 * items of several members, or a whole tile marked (Mark all, AC-115),
 * counted as the badge counts them (`markedCount`).
 */
export function shareShownOf(predicate: MarkingPredicate): string {
  const wholes = predicate.wholes ?? [];
  const single = wholes.length === 0 && predicate.items.every((item) => item.length === 1);
  const named = single
    ? [
        ...predicate.items.map((item) => field(item[0]?.value)),
        ...predicate.ranges.map((range) => `${field(range.from)} – ${field(range.to)}`),
      ]
    : [];
  if (!single || named.length === 0) {
    const n = markedCount(predicate);
    return n === 1 ? '1 item' : `${n.toLocaleString('en-GB')} items`;
  }
  if (named.length === 1) return named[0] ?? '';
  if (named.length === 2) return `${named[0] ?? ''} and ${named[1] ?? ''}`;
  return `${named.slice(0, 2).join(', ')} +${String(named.length - 2)}`;
}

function field(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[\t\r\n]+/g, ' ');
}
