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

  return (
    <div
      className="pivot-table"
      data-testid="pivot-table"
      style={{ height: `${String(height)}px`, overflow: 'auto' }}
    >
      <table>
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
                  data-testid="pivot-column-header"
                >
                  {headerText(columnMembers[level], run.value)}
                </th>
              ))}
              {level === 0 ? (
                <th scope="col" rowSpan={columnDepth} colSpan={measures.length}>
                  Total
                </th>
              ) : null}
            </tr>
          ))}

          {measures.length > 1 ? (
            <tr>
              {Array.from({ length: rowDepth }, (_, index) => (
                <td key={index} />
              ))}
              {[...columnHeaders, null].flatMap((_, columnIndex) =>
                measures.map((measure) => (
                  <th scope="col" key={`${String(columnIndex)}-${measure}`}>
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
              {columnHeaders.map((_, c) =>
                measures.map((measure, m) => (
                  <td key={`${String(c)}-${measure}`}>{show(cells[r]?.[c]?.[m] ?? null, m)}</td>
                )),
              )}
              {measures.map((measure, m) => (
                <td key={`total-${measure}`} data-testid="pivot-row-total">
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
                <td key={`${String(c)}-${measure}`} data-testid="pivot-column-total">
                  {show(columnTotals[c]?.[m] ?? null, m)}
                </td>
              )),
            )}
            {measures.map((measure, m) => (
              <td key={`grand-${measure}`} data-testid="pivot-grand-total">
                {show(grandTotals[m] ?? null, m)}
              </td>
            ))}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
