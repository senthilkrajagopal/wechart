import { markedState } from '@wechart/charts';
import {
  columnTitleOf,
  formatValue,
  membersOn,
  pivot,
  rewritesValues,
  type RenderSpec,
} from '@wechart/core';

/**
 * The pivot table (AC-037).
 *
 * The cross-tab itself is computed in `@wechart/core` — TanStack Table has row
 * grouping but no cross-tab (`docs/research/table.md`) — so this only draws
 * it. Native `<table>` markup for the same reason the data table uses it: a
 * screen reader gets real semantics rather than a vendor's ARIA layer.
 *
 * Nested column headers are one `<tr>` per column dimension, with `colSpan`
 * over the columns each value covers, which is what makes "Q1" sit above both
 * "paid" and "refunded" rather than being repeated.
 */
export interface PivotTableProps {
  readonly spec: RenderSpec;
  readonly height?: number;
}

const DEFAULT_HEIGHT = 320;

const numberOf = (raw: unknown): number | undefined => {
  if (raw === null || raw === undefined || raw === '') return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
};

/**
 * Each cell's marked share, where the marking's was answered apart (T453,
 * AC-097): drawn as a table's row is in the user's answer of 2026-09-28
 * (R43) — its marked value in it, the left rule where it is marked in part.
 * Extending that answer to a pivot's cells, with its totals unmarked, is a
 * decision of T453's, not the user's, and is open to change. The share's rows are the
 * pivot's own question asked with the marking (T388), keyed as its cells are
 * by their row and column values, the last one a key's as a cell's is. Its
 * totals are left unmarked.
 */
function cellShares(spec: RenderSpec) {
  const marking = spec.marking;
  const rowMembers = membersOn(spec.encoding, 'row');
  const columnMembers = membersOn(spec.encoding, 'column');
  const keyOf = (rowValues: readonly string[], columnValues: readonly string[]) =>
    `${rowValues.join('\u0000')}\u0001${columnValues.join('\u0000')}`;
  const shared = new Map<string, Record<string, unknown>>();
  if (marking?.share !== undefined && marking.whole !== true) {
    for (const row of marking.share) {
      const values = (members: readonly string[]) =>
        members.map((member) => String(row[member] ?? ''));
      shared.set(keyOf(values(rowMembers), values(columnMembers)), row);
    }
  }
  return (
    rowHeader: readonly string[],
    columnHeader: readonly string[],
    measure: string,
    total: number | null,
  ): { readonly marked: number; readonly partly: boolean } | undefined => {
    const row = shared.get(keyOf(rowHeader, columnHeader));
    if (row === undefined || total === null) return undefined;
    // A share's row with no value for the measure is no measurement, never
    // 0 (T453's review).
    const marked = numberOf(row[measure]);
    if (marked === undefined) return undefined;
    const state = markedState({ marked, total, aggType: marking?.aggTypes?.[measure] });
    return state === 'none' ? undefined : { marked, partly: state === 'partly' };
  };
}

/**
 * Where a header row sticks: under the ones above it. Every column head of a
 * `.grid-table` sticks at the top (T304), and a pivot with nested column
 * dimensions or several measures has more than one row of them, each the
 * prototype's 28 px.
 */
const HEAD_ROW_PX = 28;
const stuckAt = (row: number) =>
  row === 0 ? undefined : { top: `${String(row * HEAD_ROW_PX)}px` };

/** Runs of equal values in one header level, so each gets a single cell. */
function spans(headers: readonly (readonly string[])[], level: number) {
  const out: { value: string; span: number }[] = [];
  for (const header of headers) {
    const value = header[level] ?? '';
    const last = out.at(-1);
    // Only merge with the run immediately before, and only when everything
    // above matches too — otherwise "paid" under Q1 and "paid" under Q2 would
    // collapse into one cell spanning both quarters.
    const sameAbove =
      out.length > 0 &&
      headers[out.reduce((n, run) => n + run.span, 0) - 1]?.slice(0, level).join('\u0000') ===
        header.slice(0, level).join('\u0000');

    if (last !== undefined && last.value === value && sameAbove) last.span += 1;
    else out.push({ value, span: 1 });
  }
  return out;
}

export function PivotTable({ spec, height = DEFAULT_HEIGHT }: PivotTableProps) {
  const { rowHeaders, columnHeaders, measures, cells, rowTotals, columnTotals, grandTotals } =
    pivot(spec);

  if (rowHeaders.length === 0 || columnHeaders.length === 0) {
    return (
      <div className="pivot-table" data-testid="pivot-table">
        <p data-testid="pivot-empty">
          A pivot needs a dimension on rows, a dimension on columns and a measure.
        </p>
      </div>
    );
  }

  const rowDepth = rowHeaders[0]?.length ?? 0;
  const columnDepth = columnHeaders[0]?.length ?? 0;
  // Each cell written the way its own measure declares (AC-046), so a pivot
  // of amounts reads as money and one of counts does not.
  const show = (value: number | null, measureIndex: number) =>
    formatValue(value, measures[measureIndex] ?? '', spec.formats ?? {});
  /**
   * A header the model says how to write: a time by its granularity (AC-188),
   * or a dimension with a format of its own (AC-046, T201). Any other is shown
   * as it came, since Cube's plain number would group an id into "1,234".
   */
  const headerText = (member: string | undefined, value: string) =>
    member !== undefined &&
    (spec.granularities?.[member] !== undefined || rewritesValues(spec.formats?.[member]))
      ? formatValue(value, member, spec.formats ?? {}, spec.granularities)
      : value;
  const rowMembers = membersOn(spec.encoding, 'row');
  const columnMembers = membersOn(spec.encoding, 'column');
  const shareAt = cellShares(spec);

  return (
    <div
      className="pivot-table"
      data-testid="pivot-table"
      style={{ height: `${String(height)}px`, overflow: 'auto' }}
    >
      {/* The prototype's pivot in a tile, charts.js pivotHtml (T304): its
          figures set right, its row names and totals in 600. */}
      <table className="grid-table comfy">
        <thead>
          {Array.from({ length: columnDepth }, (_, level) => (
            <tr key={level}>
              {/* The corner, spanning the row-header columns. */}
              {level === 0 ? <td rowSpan={columnDepth} colSpan={rowDepth} /> : null}
              {spans(columnHeaders, level).map((run, index) => (
                <th
                  key={`${run.value}-${String(index)}`}
                  scope="col"
                  colSpan={run.span * measures.length}
                  className="num"
                  style={stuckAt(level)}
                  data-testid="pivot-column-header"
                >
                  {headerText(columnMembers[level], run.value)}
                </th>
              ))}
              {level === 0 ? (
                <th scope="col" rowSpan={columnDepth} colSpan={measures.length} className="num">
                  Total
                </th>
              ) : null}
            </tr>
          ))}

          {measures.length > 1 ? (
            <tr>
              {Array.from({ length: rowDepth }, (_, index) => (
                <td key={index} style={stuckAt(columnDepth)} />
              ))}
              {[...columnHeaders, null].flatMap((_, columnIndex) =>
                measures.map((measure) => (
                  <th
                    scope="col"
                    key={`${String(columnIndex)}-${measure}`}
                    className="num"
                    style={stuckAt(columnDepth)}
                  >
                    {/* By its title (AC-220), never "orders.count". */}
                    {columnTitleOf(measure, spec.titles)}
                  </th>
                )),
              )}
            </tr>
          ) : null}
        </thead>

        <tbody>
          {rowHeaders.map((header, r) => (
            <tr key={header.join('\u0000')} data-testid="pivot-row">
              {header.map((value, level) => (
                <th scope="row" key={level} data-testid="pivot-row-header">
                  {headerText(rowMembers[level], value)}
                </th>
              ))}
              {columnHeaders.map((column, c) =>
                measures.map((measure, m) => {
                  const value = cells[r]?.[c]?.[m] ?? null;
                  const share = shareAt(header, column, measure, value);
                  return (
                    <td
                      key={`${String(c)}-${measure}`}
                      className="num"
                      {...(share?.partly === true ? { 'data-marked': 'partly' } : {})}
                    >
                      {show(value, m)}
                      {share === undefined ? null : (
                        <span className="data-table__marked">{` · Marked: ${show(share.marked, m)}`}</span>
                      )}
                    </td>
                  );
                }),
              )}
              {measures.map((measure, m) => (
                <td
                  key={`total-${measure}`}
                  className="num grid-table__total"
                  data-testid="pivot-row-total"
                >
                  {show(rowTotals[r]?.[m] ?? null, m)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>

        <tfoot>
          <tr data-testid="pivot-totals">
            <th scope="row" colSpan={rowDepth}>
              Total
            </th>
            {columnHeaders.map((_, c) =>
              measures.map((measure, m) => (
                <td
                  key={`${String(c)}-${measure}`}
                  className="num grid-table__total"
                  data-testid="pivot-column-total"
                >
                  {show(columnTotals[c]?.[m] ?? null, m)}
                </td>
              )),
            )}
            {measures.map((measure, m) => (
              <td
                key={`grand-${measure}`}
                className="num grid-table__total"
                data-testid="pivot-grand-total"
              >
                {show(grandTotals[m] ?? null, m)}
              </td>
            ))}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
