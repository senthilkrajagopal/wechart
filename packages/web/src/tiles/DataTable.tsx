import { rowMarksOf } from '@wechart/charts';
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
import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from 'react';

import { addedColumnsOf, tableViewOf } from './tableView';

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
 * Fixed, so the native table layout survives virtualisation: §4's dense
 * 24 px row, as the editor's results grid draws it (T683; R76 dashboard-Q4;
 * the prototype's `.comfy` 34 before it, T304).
 */
const ROW_HEIGHT = 24;

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
  const keysId = useId();
  /** A row the keys went to before it was drawn: focused as soon as it is. */
  const focusOnceDrawn = useRef<number | null>(null);
  useEffect(() => {
    const index = focusOnceDrawn.current;
    if (index === null) return;
    const row = scroller.current?.querySelector<HTMLElement>(
      `[data-row-index="${String(index)}"]`,
    );
    if (row === null || row === undefined) return;
    focusOnceDrawn.current = null;
    row.focus();
  });

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

  /**
   * How the marking the tile shows draws each row, read once per answer, not
   * once per scroll:
   * - marked, bold with a left rule in the marking's colour, and the others
   *   dimmed (AC-096, T507; direction.md §7a: "Tables: marked rows are bold
   *   with a left rule; the others are dimmed");
   * - marked in part, where the marking's share was answered apart (T453,
   *   AC-097; the user's answer of 2026-09-28, R43): its measures' marked
   *   values beside theirs, and the prototype's left rule in the secondary
   *   colour.
   */
  const marksOf = useMemo(() => {
    const measured = new Set(spec.measures ?? membersOn(spec.encoding, 'y'));
    return rowMarksOf(
      spec,
      tableColumnsOf(spec.rows, spec.fields).filter((column) => measured.has(column)),
    );
  }, [spec]);

  /**
   * What a chart's table view adds after its columns: a 100 % stack's shares
   * (T958, AC-585). Once per answer, not once per scroll.
   */
  const added = useMemo(() => addedColumnsOf(spec), [spec]);
  /**
   * A type's own table view, where it has one (T956; AC-178, rule 166): the
   * numbers behind its marks — a bullet's target, share and band — in place
   * of its rows as queried.
   */
  const view = useMemo(() => tableViewOf(spec), [spec]);

  if (rows.length === 0) {
    return (
      <div className="data-table" data-testid="data-table">
        <p data-testid="table-empty">No rows.</p>
      </div>
    );
  }

  if (view !== undefined) {
    const figures = new Set(view.figures ?? []);
    return (
      <div
        className="data-table"
        data-testid="data-table"
        style={{ height: `${String(height)}px`, overflow: 'auto' }}
        // A scrolling region, focusable and named, as the rows' table is (T182).
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
        tabIndex={0}
        role="region"
        aria-label={label === undefined ? 'Table' : `${label}, table`}
      >
        <table className="grid-table comfy">
          <thead>
            <tr>
              {view.columns.map((column, at) => (
                <th scope="col" key={column} className={figures.has(at) ? 'num' : undefined}>
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {view.rows.map((row, index) => (
              <tr
                // Its first cell names it; its place keeps two alike apart.
                key={`${String(index)} ${row[0] ?? ''}`}
                data-testid="table-row"
                style={{ height: `${String(ROW_HEIGHT)}px` }}
              >
                {row.map((cell, at) => (
                  <td key={view.columns[at] ?? at} className={figures.has(at) ? 'num' : undefined}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  // The columns its CSV heads too (T177): one definition for both, in the
  // wells' order (T393, AC-301).
  const columns = tableColumnsOf(rows, spec.fields);
  const width = columns.length + added.length;

  /**
   * Rows marked from the keyboard (T405, AC-176; AC-092), where they can be
   * marked at all: from the table's region the arrows take focus to a row
   * and move it, Home and End to the first and last, marking nothing; Space
   * marks the focused row as a click does, Shift and Space the range from
   * the anchor as a Shift-click does. A row out of the drawn window is
   * scrolled to, then focused.
   */
  const rowAt = (index: number) =>
    scroller.current?.querySelector<HTMLElement>(`[data-row-index="${String(index)}"]`) ?? null;
  const goTo = (index: number) => {
    const drawnRow = rowAt(index);
    if (drawnRow !== null) {
      drawnRow.focus();
      return;
    }
    // Out of the drawn window: scrolled to, and focused once it is drawn
    // (below), whenever the virtualizer gets there (T405's review).
    focusOnceDrawn.current = index;
    virtualizer.scrollToIndex(index);
  };
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (marking === undefined || !markable) return;
    const on =
      event.target instanceof HTMLElement ? event.target.closest('[data-row-index]') : null;
    const at = on === null ? null : Number(on.getAttribute('data-row-index'));
    const last = rows.length - 1;
    let next: number;
    switch (event.key) {
      case 'ArrowDown':
        next = at === null ? 0 : Math.min(at + 1, last);
        break;
      case 'ArrowUp':
        next = at === null ? 0 : Math.max(at - 1, 0);
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = last;
        break;
      case ' ':
        if (at === null) return;
        event.preventDefault();
        clickRow(at, event.shiftKey);
        return;
      default:
        return;
    }
    event.preventDefault();
    goTo(next);
  };
  // A measure's figures are set right, as the prototype's `td.num` (T304).
  const measures = new Set(spec.measures ?? membersOn(spec.encoding, 'y'));
  const align = (column: string) => (measures.has(column) ? 'num' : undefined);
  const markOf = (row: Record<string, unknown> | undefined) =>
    row === undefined ? undefined : marksOf(row);
  const drawn = virtualizer.getVirtualItems();
  const first = drawn.at(0);
  const last = drawn.at(-1);
  const above = first?.start ?? 0;
  const below = virtualizer.getTotalSize() - (last === undefined ? 0 : last.end);

  return (
    // The keys are the table's rows' (T405): heard on the focusable region
    // that holds them, as the APG table pattern has no role of its own for it.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <div
      ref={scroller}
      className="data-table"
      data-testid="data-table"
      style={
        {
          height: `${String(height)}px`,
          overflow: 'auto',
          // The marked rows' rule, in the marking's colour (AC-096).
          ...(spec.marking === undefined ? {} : { '--wc-mark-colour': spec.marking.colour }),
        } as CSSProperties
      }
      // Scrolled from the keyboard too (T182, AC-176): WebKit does not make a
      // scrolling box focusable of itself. Named, as a focusable region must be.
      // A scrolling region is the one non-control that must take focus: the
      // keyboard has no other way to scroll it (WCAG 2.1.1).
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
      tabIndex={0}
      role="region"
      aria-label={label === undefined ? 'Table' : `${label}, table`}
      // Its keys said, where its rows can be marked (T405's review).
      {...(markable && marking !== undefined ? { 'aria-describedby': keysId } : {})}
      onKeyDown={onKeyDown}
    >
      {markable && marking !== undefined ? (
        <span id={keysId} hidden>
          Arrow keys move between its rows. Space marks. Shift and Space mark the range.
        </span>
      ) : null}
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
            {added.map((column) => (
              <th scope="col" key={`added:${column.title}`} className="num">
                {column.title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {above > 0 ? (
            <tr data-testid="table-spacer-top" aria-hidden="true">
              <td colSpan={width} style={{ height: `${String(above)}px`, padding: 0 }} />
            </tr>
          ) : null}

          {drawn.map((item) => {
            const row = rows[item.index];
            const mark = markOf(row);
            return (
              <tr
                key={item.key}
                data-testid="table-row"
                aria-rowindex={item.index + 2}
                // Reached by the arrows, where rows can be marked (T405).
                {...(markable ? { tabIndex: -1, 'data-row-index': item.index } : {})}
                {...(mark === undefined ? {} : { 'data-marked': mark.state })}
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
                {columns.map((column) => {
                  const marked = mark?.marked[column];
                  return (
                    <td key={column} className={align(column)}>
                      {formatValue(row?.[column], column, spec.formats ?? {}, spec.granularities)}
                      {marked === undefined ? null : (
                        <span className="data-table__marked">
                          {` · Marked: ${formatValue(marked, column, spec.formats ?? {})}`}
                        </span>
                      )}
                    </td>
                  );
                })}
                {added.map((column) => (
                  <td key={`added:${column.title}`} className="num">
                    {column.cells[item.index] ?? ''}
                  </td>
                ))}
              </tr>
            );
          })}

          {below > 0 ? (
            <tr data-testid="table-spacer-bottom" aria-hidden="true">
              <td colSpan={width} style={{ height: `${String(below)}px`, padding: 0 }} />
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
