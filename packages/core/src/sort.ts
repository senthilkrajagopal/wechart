/**
 * Ordering the categories of a chart (AC-044).
 *
 * The criterion's second half — "keep that order after a data refresh" — is
 * what shapes this. The order has to be a property of the *chart*, not of the
 * rows that happened to arrive, so the same setting over the same data gives
 * the same answer every time, ties included.
 */

import { memberOn, membersOn, type RenderSpec } from './render-spec';
import { OTHER_LABEL } from './topN';

export type SortBy = 'value' | 'label';
export type SortDirection = 'asc' | 'desc';

export interface SortSettings {
  readonly by: SortBy;
  readonly direction: SortDirection;
}

function numberAt(row: Record<string, unknown>, member: string): number | null {
  const raw = row[member];
  if (raw === null || raw === undefined || raw === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function settingsOf(spec: RenderSpec): SortSettings | null {
  const sort = spec.options?.['sort'];
  if (typeof sort !== 'object' || sort === null) return null;

  const { by, direction } = sort as Partial<SortSettings>;
  if (by !== 'value' && by !== 'label') return null;
  return { by, direction: direction === 'asc' ? 'asc' : 'desc' };
}

/**
 * Order the rows, or return the spec untouched.
 *
 * Untouched matters: Cube was asked for an ordering and returned one, so with
 * no setting here the chart keeps it rather than having another imposed.
 */
export function applySort(spec: RenderSpec): RenderSpec {
  const settings = settingsOf(spec);
  const category = memberOn(spec.encoding, 'x');
  const measure = membersOn(spec.encoding, 'y')[0];

  if (settings === null || category === undefined) return spec;

  const labelOf = (row: Record<string, unknown>) => String(row[category] ?? '');
  const isOther = (row: Record<string, unknown>) => labelOf(row).startsWith(`${OTHER_LABEL} (`);

  // Decorate with the arrival index so the comparison can fall back to it.
  // Array.prototype.sort is specified as stable, but saying so here makes the
  // intent explicit rather than relying on a reader knowing that.
  const decorated = spec.rows.map((row, index) => ({ row, index }));

  const compare = (a: (typeof decorated)[0], b: (typeof decorated)[0]) => {
    // "Other" is not a member. Sorting it into the middle by its total would
    // imply it were one, so it is pinned last whatever the setting.
    if (isOther(a.row) !== isOther(b.row)) return isOther(a.row) ? 1 : -1;

    if (settings.by === 'label') {
      const byLabel = labelOf(a.row).localeCompare(labelOf(b.row));
      if (byLabel !== 0) return settings.direction === 'asc' ? byLabel : -byLabel;
      return a.index - b.index;
    }

    const left = measure === undefined ? null : numberAt(a.row, measure);
    const right = measure === undefined ? null : numberAt(b.row, measure);

    // A category with no measurement goes last in either direction. Treated
    // as zero it would sort in front of every real value when ascending and
    // claim to be the smallest measurement, which it is not.
    if (left === null || right === null) {
      if (left === right) return a.index - b.index;
      return left === null ? 1 : -1;
    }

    if (left === right) return a.index - b.index;
    return settings.direction === 'asc' ? left - right : right - left;
  };

  return { ...spec, rows: [...decorated].sort(compare).map((entry) => entry.row) };
}
