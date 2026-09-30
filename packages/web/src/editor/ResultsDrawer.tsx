import {
  columnTitleOf,
  formatValue,
  granularityOf,
  tableColumnsOf,
  UNDERLYING_ROW_LIMIT,
  type MemberFormats,
  type MemberGranularities,
} from '@wechart/core';
import { useQuery } from '@tanstack/react-query';
import { useId, useMemo, useRef } from 'react';

import { useQueryItem } from '../query/item';
import { loadTile } from '../query/loadTile';
import { missingScopeOf, ScopeUnavailable } from '../query/scopes';
import { StateLine } from '../shell/StatusIcon';
import { AccelerationPanel } from './AccelerationPanel';

/**
 * The results drawer (AC-036): the result rows, the rows underneath them, and
 * the Cube query the chart actually ran.
 *
 * The result rows shown here are **the same data the chart rendered**, passed
 * in rather than re-fetched. Re-fetching would let the drawer and the chart
 * disagree, which is precisely the failure the criterion names.
 *
 * Open/view state is owned by the editor, not by this component: the drawer is
 * unmounted whenever the chart has no fields, and state kept here would be
 * lost every time the user emptied a well or switched cube, reopening the
 * drawer closed under someone who had opened it.
 */
export type DrawerView = 'result' | 'underlying' | 'query' | 'acceleration';

export interface ResultsDrawerProps {
  readonly rows: readonly Record<string, unknown>[];
  readonly query: Record<string, unknown>;
  /** The ungrouped query for the rows beneath the aggregate. */
  readonly underlyingQuery: Record<string, unknown>;
  readonly open: boolean;
  readonly view: DrawerView;
  /**
   * Each member's number format from the Cube model (AC-046, T195): the
   * criterion names tables among the places a value wears it.
   */
  readonly formats?: MemberFormats;
  /** Each time member's granularity in the chart's query (AC-188). */
  readonly granularities?: MemberGranularities;
  /** Each member's title from the model, for the tables' headers (AC-220). */
  readonly titles?: Readonly<Record<string, string>>;
  readonly onOpenChange: (open: boolean) => void;
  readonly onViewChange: (view: DrawerView) => void;
}

/** How many rows a table draws before it stops and says so. */
const VISIBLE_ROWS = UNDERLYING_ROW_LIMIT;

/**
 * A cell as text: in its member's format where the model declares one, and
 * as it came otherwise — a member with no format may be an id, which is not a
 * quantity, and grouping it ("1,234") would misstate it.
 */
function cellText(
  value: unknown,
  member: string,
  formats: MemberFormats,
  granularities: MemberGranularities,
): string {
  // A time value by its granularity, never as Cube's timestamp (AC-188) —
  // under the member or under the `member.<granularity>` column beside it.
  if (granularityOf(member, granularities) !== undefined)
    return formatValue(value, member, formats, granularities);
  return formats[member] === undefined ? String(value ?? '') : formatValue(value, member, formats);
}

/**
 * The underlying rows are ungrouped: each carries its own time, not a
 * bucket's start, so every time member is written with its time of day.
 */
function ungrouped(granularities: MemberGranularities): MemberGranularities {
  return Object.fromEntries(Object.keys(granularities).map((member) => [member, 'second']));
}

/**
 * A query's members in the wells' order it keeps (T393's review, AC-301):
 * its time dimensions, its dimensions, then its measures, which a table heads
 * its columns by, as the chart's own table does.
 */
function fieldsOf(query: Record<string, unknown>): string[] {
  const names = (key: string) => {
    const value = query[key];
    return Array.isArray(value)
      ? value.flatMap((entry: unknown) =>
          typeof entry === 'string'
            ? [entry]
            : typeof entry === 'object' && entry !== null && 'dimension' in entry
              ? [String((entry as { dimension: unknown }).dimension)]
              : [],
        )
      : [];
  };
  return [...names('timeDimensions'), ...names('dimensions'), ...names('measures')];
}

/** The measures a query names: the columns that are numbers, set right (T257). */
function measuresOf(query: Record<string, unknown>): string[] {
  const measures = query['measures'];
  return Array.isArray(measures)
    ? measures.filter((member): member is string => typeof member === 'string')
    : [];
}

function RowTable({
  rows,
  testId,
  formats,
  granularities,
  titles,
  numeric,
  fields,
  capped = false,
}: {
  rows: readonly Record<string, unknown>[];
  testId: string;
  formats: MemberFormats;
  granularities: MemberGranularities;
  /** Each member's title from the model, for the headers (AC-220). */
  titles: Readonly<Record<string, string>>;
  /** The measure columns, aligned right as figures are (the prototype's td.num). */
  numeric: ReadonlySet<string>;
  /** The query's members in the wells' order, which the columns follow (AC-301). */
  fields: readonly string[];
  /**
   * True when the rows came back from a capped query, so a full page is
   * evidence of more rows rather than of the total.
   * research/cube/data-apis.md: "treat `rows === limit` as truncated".
   */
  capped?: boolean;
}) {
  if (rows.length === 0) return <p data-testid={`${testId}-empty`}>No rows.</p>;

  const columns = tableColumnsOf(rows, fields);
  const shown = rows.slice(0, VISIBLE_ROWS);

  // Silence is the one thing a data drawer must not do here: a table that
  // quietly stops at 100 rows while the chart says 240 reads as disagreement
  // between the two, which is what AC-036 exists to prevent.
  const note =
    rows.length > VISIBLE_ROWS
      ? `Showing the first ${String(VISIBLE_ROWS)} of ${String(rows.length)} rows.`
      : capped && rows.length === VISIBLE_ROWS
        ? `Showing the first ${String(VISIBLE_ROWS)} rows. There may be more.`
        : null;

  return (
    <>
      {note === null ? null : (
        <StateLine kind="warn" testId={`${testId}-truncated`}>
          {note}
        </StateLine>
      )}
      {/* The prototype's .grid-table (T257): 12 px, tabular figures, a sticky
          28 px head, 24 px rows, the measures set right. */}
      <table className="grid-table" data-testid={testId}>
        <thead>
          <tr>
            {columns.map((column) => (
              // By its title (AC-220), never "orders.count".
              <th scope="col" key={column} className={numeric.has(column) ? 'num' : undefined}>
                {columnTitleOf(column, titles)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.map((row, index) => (
            <tr key={index}>
              {columns.map((column) => (
                <td key={column} className={numeric.has(column) ? 'num' : undefined}>
                  {cellText(row[column], column, formats, granularities)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

export function ResultsDrawer({
  rows,
  query,
  underlyingQuery,
  open,
  view,
  formats = {},
  granularities = {},
  titles = {},
  onOpenChange,
  onViewChange,
}: ResultsDrawerProps) {
  // For the chart edited, or the dashboard it is edited on (T340, AC-268).
  const item = useQueryItem();
  const underlying = useQuery({
    queryKey: ['underlying', underlyingQuery, item ?? null],
    queryFn: ({ signal }) => loadTile({ query: underlyingQuery, signal, item }),
    // Only asked for when the drawer is actually showing it: the rows beneath
    // an aggregate can be a large query, and nobody asked for it yet.
    enabled: open && view === 'underlying',
  });

  const underlyingRows = ((underlying.data as { data?: unknown[] } | undefined)?.data ??
    []) as Record<string, unknown>[];

  const ids = useId();
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const numeric = useMemo(
    () => new Set([...measuresOf(query), ...measuresOf(underlyingQuery)]),
    [query, underlyingQuery],
  );
  /** A tab chosen: its view, and the drawer open on it if it was not. */
  const choose = (id: DrawerView) => {
    onViewChange(id);
    if (!open) onOpenChange(true);
  };

  return (
    // The prototype's .drawer (T257, editor.js 416): its tab strip always
    // shown, so the drawer is found even collapsed; open, 220 px under it.
    <section className="results-drawer" data-testid="results-drawer" data-open={open}>
      <div className="results-drawer__bar">
        <div role="tablist" aria-label="Results" className="results-drawer__tabs">
          {DRAWER_TABS.map(([id, label], index) => (
            <button
              key={id}
              ref={(node) => {
                tabRefs.current[index] = node;
              }}
              type="button"
              role="tab"
              id={`${ids}-${id}`}
              aria-selected={open && view === id}
              aria-controls={open && view === id ? `${ids}-panel` : undefined}
              tabIndex={view === id ? 0 : -1}
              data-testid={`drawer-tab-${id}`}
              onClick={() => choose(id)}
              onKeyDown={(event) => {
                // The APG tabs pattern: the arrows move along the strip.
                const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
                if (step === 0) return;
                event.preventDefault();
                const next = (index + step + DRAWER_TABS.length) % DRAWER_TABS.length;
                const tab = DRAWER_TABS[next];
                if (tab === undefined) return;
                choose(tab[0]);
                tabRefs.current[next]?.focus();
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="icon-button results-drawer__toggle"
          aria-expanded={open}
          aria-label={open ? 'Hide the results' : 'Show the results'}
          title={open ? 'Hide the results' : 'Show the results'}
          onClick={() => onOpenChange(!open)}
        >
          <span aria-hidden="true">{open ? '▾' : '▴'}</span>
        </button>
      </div>

      {open ? (
        <div
          className="results-drawer__body"
          role="tabpanel"
          id={`${ids}-panel`}
          aria-labelledby={`${ids}-${view}`}
          // Reachable by Tab even when it holds no control (APG tabs).
          tabIndex={0}
        >
          {view === 'result' ? (
            <RowTable
              rows={rows}
              testId="drawer-result-rows"
              formats={formats}
              granularities={granularities}
              titles={titles}
              numeric={numeric}
              fields={fieldsOf(query)}
            />
          ) : null}

          {view === 'underlying' ? (
            <>
              {underlying.isPending ? (
                <StateLine kind="run">Loading…</StateLine>
              ) : underlying.isError ? (
                // A scope the context lacks, said as that (T176, AC-170).
                missingScopeOf(underlying.error) === undefined ? (
                  <StateLine kind="err">{(underlying.error as Error).message}</StateLine>
                ) : (
                  <ScopeUnavailable
                    scope={missingScopeOf(underlying.error) ?? 'data'}
                    what="The underlying rows"
                  />
                )
              ) : (
                <RowTable
                  rows={underlyingRows}
                  testId="drawer-underlying-rows"
                  formats={formats}
                  granularities={ungrouped(granularities)}
                  titles={titles}
                  numeric={numeric}
                  fields={fieldsOf(underlyingQuery)}
                  capped
                />
              )}
            </>
          ) : null}

          {view === 'query' ? (
            <pre className="results-drawer__query" data-testid="drawer-query">
              {JSON.stringify(query, null, 2)}
            </pre>
          ) : null}

          {/* Asked only while shown, as the underlying rows are. */}
          {view === 'acceleration' ? <AccelerationPanel query={query} /> : null}
        </div>
      ) : null}
    </section>
  );
}

/** The drawer's views, named as the prototype's tabs are (editor.js 416). */
const DRAWER_TABS: readonly (readonly [DrawerView, string])[] = [
  ['result', 'Results'],
  ['underlying', 'Underlying rows'],
  ['query', 'Cube query'],
  // Whether a pre-aggregation serves the chart (T150, AC-144).
  ['acceleration', 'Acceleration'],
];
