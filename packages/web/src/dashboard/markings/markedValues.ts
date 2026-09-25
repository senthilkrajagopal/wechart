import type { MarkedItem, MarkingPredicate } from '@wechart/core';

/**
 * A marking's items as tab-separated text (T271, AC-241): a header row of the
 * members' titles, then a line per marked item, each member's value in its
 * column — for Copy › Marked values, to paste into a spreadsheet.
 *
 * - A column for each member any item names, in the order first named; an
 *   item that does not name one leaves it empty, as items of several members
 *   do.
 * - A whole tile marked (Mark all, AC-115) is its items, where its tile can
 *   still name them.
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
  const items: MarkedItem[] = [
    ...predicate.items,
    ...(predicate.wholes ?? []).flatMap((whole) => itemsOfTile?.(whole.tileId) ?? []),
  ];
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

function field(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[\t\r\n]+/g, ' ');
}
