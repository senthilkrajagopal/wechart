import { formatValue, type RenderSpec } from '@wechart/core';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useRef } from 'react';

/**
 * The table (AC-037), and the table view every chart can switch to (AC-178).
 *
 * Two requirements pull against each other here. Real `<table>` semantics are
 * what a screen reader needs, and virtualisation is what keeps ten thousand
 * rows from being ten thousand DOM nodes — but the usual way to virtualise is
 * absolute positioning, which destroys table layout. TanStack's own guide says
 * as much and suggests `display: grid`, "breaking semantic HTML".
 *
 * `docs/research/table.md` settles it the other way: fixed row heights and
 * **spacer rows** standing in for what is not drawn, so the native layout
 * survives, plus `aria-rowcount` and `aria-rowindex` — which the APG table
 * pattern requires exactly when rows "are hidden or not present in the DOM".
 *
 * Only `@tanstack/react-virtual` is used so far. `@tanstack/react-table` is
 * the decided library for this and the pivot, and it is installed, but a flat
 * table of result rows needs none of its row model; it earns its place at the
 * pivot (T042) and sorting (T051).
 */
export interface DataTableProps {
  readonly spec: RenderSpec;
  readonly height?: number;
}

const DEFAULT_HEIGHT = 320;
/** Fixed, so the native table layout survives virtualisation. */
const ROW_HEIGHT = 28;

export function DataTable({ spec, height = DEFAULT_HEIGHT }: DataTableProps) {
  const scroller = useRef<HTMLDivElement | null>(null);
  const { rows } = spec;

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scroller.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
    initialRect: { width: 0, height },
    /**
     * The viewport height is ours, not measured.
     *
     * The tile decides how tall the table is, so there is nothing to discover
     * by observing it — and observing is what fails without a layout engine:
     * the default watcher reports a zero-height rect, the window comes out
     * empty, and nothing is drawn at all. Reporting the known height keeps the
     * same window in a test, in a server render and on the first paint before
     * the browser has measured anything.
     */
    observeElementRect: (instance, cb) => {
      cb({ width: instance.scrollElement?.clientWidth ?? 0, height });
    },
    observeElementOffset: (instance, cb) => {
      const element = instance.scrollElement;
      if (element === null || element === undefined) {
        cb(0, false);
        return undefined;
      }
      const report = () => {
        cb(element.scrollTop, false);
      };
      report();
      element.addEventListener('scroll', report, { passive: true });
      return () => {
        element.removeEventListener('scroll', report);
      };
    },
  });

  if (rows.length === 0) {
    return (
      <div className="data-table" data-testid="data-table">
        <p data-testid="table-empty">No rows.</p>
      </div>
    );
  }

  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const drawn = virtualizer.getVirtualItems();
  const first = drawn.at(0);
  const last = drawn.at(-1);
  const above = first?.start ?? 0;
  const below = virtualizer.getTotalSize() - (last === undefined ? 0 : last.end);

  return (
    <div
      ref={scroller}
      className="data-table"
      data-testid="data-table"
      style={{ height: `${String(height)}px`, overflow: 'auto' }}
    >
      {/* The header counts as a row, so the body starts at 2. */}
      <table aria-rowcount={rows.length}>
        <thead>
          <tr aria-rowindex={1}>
            {columns.map((column) => (
              <th scope="col" key={column}>
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {above > 0 ? (
            <tr data-testid="table-spacer-top" aria-hidden="true">
              <td colSpan={columns.length} style={{ height: `${String(above)}px`, padding: 0 }} />
            </tr>
          ) : null}

          {drawn.map((item) => {
            const row = rows[item.index];
            return (
              <tr
                key={item.key}
                data-testid="table-row"
                aria-rowindex={item.index + 2}
                style={{ height: `${String(ROW_HEIGHT)}px` }}
              >
                {columns.map((column) => (
                  <td key={column}>{formatValue(row?.[column], column, spec.formats ?? {})}</td>
                ))}
              </tr>
            );
          })}

          {below > 0 ? (
            <tr data-testid="table-spacer-bottom" aria-hidden="true">
              <td colSpan={columns.length} style={{ height: `${String(below)}px`, padding: 0 }} />
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
