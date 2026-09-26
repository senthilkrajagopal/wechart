import {
  columnTitleOf,
  formatValue,
  markRowClick,
  matchesPredicate,
  membersOn,
  rowsMarkable,
  tableColumnsOf,
  type MarkingPredicate,
  type RenderSpec,
} from '@wechart/core';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useRef, useState } from 'react';

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
  /** The chart's title, naming the table's scrolling region (T182). */
  readonly label?: string | undefined;
  /**
   * Row marking (AC-092). Absent, or present without a primary key, and rows
   * are not markable at all: `references-markings.md` quotes Spotfire — "A
   * primary key is required to know which rows to mark" — and it is AC-086's
   * reasoning again, since without a key no combination of members names one
   * row rather than every row that looks like it.
   */
  readonly marking?: {
    readonly predicate: MarkingPredicate;
    readonly primaryKey?: string | undefined;
    readonly onMark: (predicate: MarkingPredicate) => void;
  };
}

const DEFAULT_HEIGHT = 320;
/**
 * Fixed, so the native table layout survives virtualisation: the prototype's
 * `.grid-table.comfy` row, as its tiles draw tables (T304).
 */
const ROW_HEIGHT = 34;

export function DataTable({ spec, height = DEFAULT_HEIGHT, marking, label }: DataTableProps) {
  const scroller = useRef<HTMLDivElement | null>(null);
  const { rows } = spec;

  /**
   * Where a Shift-range starts. Held here rather than in the marking, because
   * it is not part of what is marked — reopening a dashboard restores the
   * marking, not the last row someone happened to click.
   */
  const [anchor, setAnchor] = useState<number | null>(null);
  const markable = rowsMarkable(marking?.primaryKey);

  const clickRow = (index: number, shift: boolean) => {
    if (marking === undefined || !markable) return;

    const next = markRowClick(rows, index, {
      shift,
      anchor,
      primaryKey: marking.primaryKey,
    });
    setAnchor(next.anchor);
    marking.onMark(next.predicate);
  };

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

  // The columns its CSV heads too (T177): one definition for both, in the
  // wells' order (T393, AC-301).
  const columns = tableColumnsOf(rows, spec.fields);
  // A measure's figures are set right, as the prototype's `td.num` (T304).
  const measures = new Set(spec.measures ?? membersOn(spec.encoding, 'y'));
  const align = (column: string) => (measures.has(column) ? 'num' : undefined);
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
      // Scrolled from the keyboard too (T182, AC-176): WebKit does not make a
      // scrolling box focusable of itself. Named, as a focusable region must be.
      // A scrolling region is the one non-control that must take focus: the
      // keyboard has no other way to scroll it (WCAG 2.1.1).
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
      tabIndex={0}
      role="region"
      aria-label={label === undefined ? 'Table' : `${label}, table`}
    >
      {/* The header counts as a row, so the body starts at 2. */}
      {/* The prototype's table in a tile, charts.js tableHtml (T304). */}
      <table className="grid-table comfy" aria-rowcount={rows.length}>
        <thead>
          <tr aria-rowindex={1}>
            {columns.map((column) => (
              // By its title (AC-220), never "orders.count".
              <th scope="col" key={column} className={align(column)}>
                {columnTitleOf(column, spec.titles)}
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
                /**
                 * `aria-selected` only where rows can actually be marked: on a
                 * table without a primary key it would announce a state the
                 * user has no way to reach.
                 */
                {...(markable
                  ? {
                      'aria-selected':
                        row !== undefined &&
                        marking !== undefined &&
                        matchesPredicate(marking.predicate, row),
                    }
                  : {})}
                onClick={(event) => {
                  clickRow(item.index, event.shiftKey);
                }}
                style={{
                  height: `${String(ROW_HEIGHT)}px`,
                  ...(markable ? { cursor: 'pointer' } : {}),
                }}
              >
                {columns.map((column) => (
                  <td key={column} className={align(column)}>
                    {formatValue(row?.[column], column, spec.formats ?? {}, spec.granularities)}
                  </td>
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
