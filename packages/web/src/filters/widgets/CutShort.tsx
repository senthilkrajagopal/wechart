import { StatusIcon } from '../../shell/StatusIcon';

const count = (value: number) => value.toLocaleString('en-US');

/**
 * Shown under a list of values that stops at the cap, so a reader who does
 * not find a value knows the list is not the whole of it. With the count Cube
 * gave, it says how many there are in all (T893, AC-529; design 21 state D3).
 */
export function CutShort({
  search,
  shown = 1000,
  total,
}: {
  search: boolean;
  shown?: number;
  total?: number | undefined;
}) {
  return (
    <p className="filter-widget__cut" data-testid="filter-options-cut">
      {/* Cut short: a warning, with its icon (T183, AC-177). */}
      <StatusIcon kind="warn" />
      {total !== undefined && total > shown
        ? `Showing ${count(shown)} of ${count(total)}${search ? ' · type to find the rest' : ''}`
        : `Showing the first 1,000 values.${search ? ' Search to find others.' : ''}`}
    </p>
  );
}

/**
 * After a search of a list of more than 1,000 values: how many of them
 * contain what was typed, in all of them, not only those listed (T893,
 * AC-529): "3 matches in all 4,212 customers".
 */
export function SearchMatches({
  matches,
  total,
  noun,
}: {
  matches: number;
  total: number;
  noun: string;
}) {
  return (
    <p className="filter-widget__matches" data-testid="filter-options-matches" aria-live="polite">
      {`${count(matches)} ${matches === 1 ? 'match' : 'matches'} in all ${count(total)} ${noun}`}
    </p>
  );
}
