import { COMBO_SERIES_LIMIT, type MembersShown } from '@wechart/core';
import { useId } from 'react';

/**
 * A split combo's count against its 8 series, and its "‹dimension› shown"
 * (T860; AC-504, AC-505; design 20 screen 2 pins 6 and 7, state G1):
 * "2 measures × 4 regions = 8 of 8 series", or folded, "2 measures × 4
 * (3 countries + Other) = 8 of 8 series"; and a choice of Auto (fold as far
 * as 8 needs), All, or the top *k* by the first measure plus Other.
 */
export interface SplitCountProps {
  /** The measures drawn on their scale, whether or not past 8 series. */
  readonly measures: number;
  /** The split's members, hidden and empty ones counted. */
  readonly members: number;
  /** Folded to the top *k* + Other: *k*. */
  readonly top?: number | undefined;
  /** The dimension it's split by, by its title. */
  readonly dimension: string;
  /** The series drawn. */
  readonly series: number;
  /** The author's choice; absent, Auto. */
  readonly shown?: MembersShown | undefined;
  readonly onShown?: ((shown: MembersShown | undefined) => void) | undefined;
}

/** "region", "regions", "countries", "statuses": a title as a count's noun. */
export function nounFor(title: string, count: number): string {
  const word = title.toLowerCase();
  if (count === 1) return word;
  if (/[^aeiou]y$/.test(word)) return `${word.slice(0, -1)}ies`;
  if (/(s|x|z|ch|sh)$/.test(word)) return `${word}es`;
  return `${word}s`;
}

/** The count's words (AC-504, AC-505). */
export function splitCountText({
  measures,
  members,
  top,
  dimension,
  series,
}: Pick<SplitCountProps, 'measures' | 'members' | 'top' | 'dimension' | 'series'>): string {
  const lead = `${String(measures)} ${measures === 1 ? 'measure' : 'measures'}`;
  const each =
    top === undefined
      ? `${String(members)} ${nounFor(dimension, members)}`
      : `${String(top + 1)} (${String(top)} ${nounFor(dimension, top)} + Other)`;
  return `${lead} × ${each} = ${String(series)} of ${String(COMBO_SERIES_LIMIT)} series`;
}

export function SplitCount(props: SplitCountProps) {
  const { members, dimension, shown, onShown } = props;
  const id = useId();
  /** "Regions shown" (AC-505). */
  const shownName = `${nounFor(dimension, 2).replace(/^./, (first) => first.toUpperCase())} shown`;
  // A top k short of every member, and at most the 7 that leave Other an eighth.
  const tops = Array.from(
    { length: Math.max(0, Math.min(members - 1, COMBO_SERIES_LIMIT - 1)) },
    (_, at) => at + 1,
  );
  return (
    <div className="combo-split">
      <p className="combo-split__count" data-testid="split-count">
        {splitCountText(props)}
      </p>
      {onShown === undefined ? null : (
        <div className="combo-series__row">
          <label htmlFor={`${id}-shown`} className="combo-series__name">
            {shownName}
          </label>
          <select
            id={`${id}-shown`}
            className="select-sm"
            value={shown === undefined ? 'auto' : String(shown)}
            onChange={(event) => {
              const value = event.target.value;
              onShown(value === 'auto' ? undefined : value === 'all' ? 'all' : Number(value));
            }}
          >
            <option value="auto">Auto</option>
            <option value="all">All {members}</option>
            {tops.map((k) => (
              <option key={k} value={k}>
                Top {k} + Other
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
