/**
 * The cross-tab behind the pivot table (AC-037).
 *
 * TanStack Table has row grouping and aggregation but **no cross-tab**
 * (`docs/research/table.md`), so the shape is computed here and the grid only
 * draws it. Keeping it in core also means it is tested on values rather than
 * on rendered cells.
 *
 * Channels: `row` names the dimensions down the side, `column` those across
 * the top, and `y` the measures. Those two channels exist for exactly this.
 */

import { membersOn, type RenderSpec } from './render-spec';
import { sortSettingsOf } from './sort';
import { OTHER_LABEL } from './topN';

export interface PivotResult {
  /** One entry per row, holding that row's value for each row dimension. */
  readonly rowHeaders: readonly (readonly string[])[];
  /** One entry per column, holding that column's value for each column dimension. */
  readonly columnHeaders: readonly (readonly string[])[];
  readonly measures: readonly string[];
  /** `cells[row][column][measure]`, `null` where the result had no such row. */
  readonly cells: readonly (readonly (readonly (number | null)[])[])[];
  readonly rowTotals: readonly (readonly (number | null)[])[];
  readonly columnTotals: readonly (readonly (number | null)[])[];
  readonly grandTotals: readonly (number | null)[];
}

const EMPTY: PivotResult = {
  rowHeaders: [],
  columnHeaders: [],
  measures: [],
  cells: [],
  rowTotals: [],
  columnTotals: [],
  grandTotals: [],
};

/** The key a row sorts under for a set of dimensions. */
const keyOf = (row: Record<string, unknown>, members: readonly string[]) =>
  members.map((member) => String(row[member] ?? '')).join('\u0000');

function numberAt(row: Record<string, unknown>, member: string): number | null {
  const raw = row[member];
  if (raw === null || raw === undefined || raw === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

/**
 * Add, treating gaps as absent rather than as zero.
 *
 * A total of nothing is `null`, not `0`: reporting zero would claim a
 * measurement the result never contained. Once one real number is present the
 * gaps beside it are simply skipped.
 *
 * **Sum only.** A subtotal of an average is not an average, and nothing here
 * knows a measure's aggregation — `RenderSpec` carries member names, not the
 * model's metadata. Non-additive measures need their totals from Cube, which
 * is the same conclusion AC-048 reaches for quick calculations.
 */
function total(values: readonly (number | null)[]): number | null {
  let sum: number | null = null;
  for (const value of values) {
    if (value === null) continue;
    sum = (sum ?? 0) + value;
  }
  return sum;
}

export function pivot(spec: RenderSpec): PivotResult {
  const rowMembers = membersOn(spec.encoding, 'row');
  const columnMembers = membersOn(spec.encoding, 'column');
  const measures = membersOn(spec.encoding, 'y');

  if (rowMembers.length === 0 || columnMembers.length === 0 || measures.length === 0) {
    return EMPTY;
  }

  // First-appearance order, not sorted: Cube was asked for an ordering and
  // returned one, and re-sorting here would quietly override it (AC-044).
  const rowHeaders: string[][] = [];
  const columnHeaders: string[][] = [];
  const rowIndex = new Map<string, number>();
  const columnIndex = new Map<string, number>();

  for (const row of spec.rows) {
    const rowKey = keyOf(row, rowMembers);
    if (!rowIndex.has(rowKey)) {
      rowIndex.set(rowKey, rowHeaders.length);
      rowHeaders.push(rowMembers.map((member) => String(row[member] ?? '')));
    }

    const columnKey = keyOf(row, columnMembers);
    if (!columnIndex.has(columnKey)) {
      columnIndex.set(columnKey, columnHeaders.length);
      columnHeaders.push(columnMembers.map((member) => String(row[member] ?? '')));
    }
  }

  const cells: (number | null)[][][] = rowHeaders.map(() =>
    columnHeaders.map(() => measures.map(() => null)),
  );

  for (const row of spec.rows) {
    const r = rowIndex.get(keyOf(row, rowMembers));
    const c = columnIndex.get(keyOf(row, columnMembers));
    if (r === undefined || c === undefined) continue;
    measures.forEach((measure, m) => {
      // Last write wins. Cube has already grouped by these dimensions, so two
      // rows for one pair would mean the query and the pivot disagree about
      // the grain rather than something to silently add up.
      (cells[r] as (number | null)[][])[c]![m] = numberAt(row, measure);
    });
  }

  // A quick calculation is Cube's, cell by cell (AC-048): a sum of it is no total of it.
  const totalled = measures.map((measure) => !Object.hasOwn(spec.calculated ?? {}, measure));
  const sumOf = (m: number, values: readonly (number | null)[]) =>
    totalled[m] === true ? total(values) : null;

  const rowTotals = cells.map((columns) =>
    measures.map((_, m) => sumOf(m, columns.map((cell) => cell[m] ?? null))),
  );

  const columnTotals = columnHeaders.map((_, c) =>
    measures.map((__, m) => sumOf(m, cells.map((columns) => columns[c]?.[m] ?? null))),
  );

  const grandTotals = measures.map((_, m) => sumOf(m, rowTotals.map((row) => row[m] ?? null)));

  const order = rowOrder(spec, rowHeaders, rowTotals);
  return {
    rowHeaders: order.map((r) => rowHeaders[r]!),
    columnHeaders,
    measures,
    cells: order.map((r) => cells[r]!),
    rowTotals: order.map((r) => rowTotals[r]!),
    columnTotals,
    grandTotals,
  };
}

/**
 * The order its row groups are drawn in (T303, AC-044): the chart's sort, as
 * `applySort` orders any other chart's categories — by the first measure's
 * row total, or by the row's label — else as they arrived.
 *
 * The same rules as `applySort`, for the same reasons: a group with no
 * measurement goes last in either direction, since zero is a measurement it
 * does not have; "Other" is pinned last; ties keep their arrival order, so
 * the order after a refresh of unchanged data is the order before it. Only
 * the rows move: the columns keep Cube's order, and every total is the same
 * sum in any order.
 */
function rowOrder(
  spec: RenderSpec,
  rowHeaders: readonly (readonly string[])[],
  rowTotals: readonly (readonly (number | null)[])[],
): number[] {
  const arrived = rowHeaders.map((_, index) => index);
  const settings = sortSettingsOf(spec);
  if (settings === null) return arrived;

  const labelOf = (r: number) => (rowHeaders[r] ?? []).join(' ');
  const isOther = (r: number) => (rowHeaders[r]?.[0] ?? '').startsWith(`${OTHER_LABEL} (`);
  const sign = settings.direction === 'asc' ? 1 : -1;

  return arrived.sort((a, b) => {
    if (isOther(a) !== isOther(b)) return isOther(a) ? 1 : -1;
    if (settings.by === 'label') return sign * labelOf(a).localeCompare(labelOf(b)) || a - b;

    const left = rowTotals[a]?.[0] ?? null;
    const right = rowTotals[b]?.[0] ?? null;
    if (left === null || right === null) {
      if (left === right) return a - b;
      return left === null ? 1 : -1;
    }
    return sign * (left - right) || a - b;
  });
}
