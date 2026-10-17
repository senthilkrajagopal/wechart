import {
  columnTitleOf,
  formatValue,
  granularityOf,
  rowsCsvOf,
  tableColumnsOf,
  UNDERLYING_ROW_LIMIT,
  type MemberFormats,
  type MemberGranularities,
} from '@wechart/core';
import { useQuery } from '@tanstack/react-query';
import { useId, useMemo, useRef, useState, type ReactNode } from 'react';

import { sqlOf } from '../dashboard/ViewQuery';
import { saveFile } from '../dashboard/TileViewMenu';
import { forItem, useQueryItem } from '../query/item';
import { loadTile } from '../query/loadTile';
import { missingScopeOf, ScopeUnavailable } from '../query/scopes';
import { StateLine } from '../shell/StatusIcon';
import { AccelerationPanel } from './AccelerationPanel';
import { FieldIcon } from './FieldList';

/**
 * The results drawer (AC-036): the result rows, the rows underneath them, and
 * the Cube query the chart actually ran, as 2026-09-24 design 02 draws it
 * (T690): its tabs always shown, Results with its count and Acceleration with
 * its mark; 240 px when opened, dragged by its grip from 160 px to half the
 * editor, a double-click putting it back; the rows and the time, Copy and
 * Download CSV; a data grid numbered, each column with its role chip and the
 * colour dimension's swatch; the Cube query as coloured JSON or Cube's SQL.
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
  /**
   * The result rows' own formats and titles, where they differ from the
   * model's: a quick calculation's values stand under its measure's name,
   * written and named as the chart has them (AC-048). The underlying rows
   * are the measure as it is.
   */
  readonly result?: {
    readonly formats?: MemberFormats | undefined;
    readonly titles?: Readonly<Record<string, string>> | undefined;
  };
  /**
   * The result's fields in the wells' order (AC-301; T690, EDI-19): its
   * columns follow them. Where not given, the query's order.
   */
  readonly columns?: readonly string[] | undefined;
  /** How long the chart's answer took, in ms (EDI-17): "24 rows · 42 ms". */
  readonly elapsedMs?: number | undefined;
  /** Whether a pre-aggregation served the chart: Acceleration's ✓ or ○ (EDI-16). */
  readonly accelerated?: boolean | undefined;
  /** A cell's colour as the chart draws it, for the colour dimension's swatch (EDI-18). */
  readonly swatchOf?: ((column: string, value: unknown) => string | undefined) | undefined;
  readonly onOpenChange: (open: boolean) => void;
  readonly onViewChange: (view: DrawerView) => void;
}

/** How many rows a table draws before it stops and says so. */
const VISIBLE_ROWS = UNDERLYING_ROW_LIMIT;

/** Design 02 pin 1's heights (EDI-15): opened at 240, dragged no lower than 160. */
const OPEN_HEIGHT = 240;
const MIN_HEIGHT = 160;

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

/** Rows as a table is written, for Copy and Download CSV. */
interface Written {
  readonly rows: readonly Record<string, unknown>[];
  readonly fields: readonly string[];
  readonly formats: MemberFormats;
  readonly granularities: MemberGranularities;
  readonly titles: Readonly<Record<string, string>>;
  readonly measures: readonly string[];
}

/** Tab-separated, its titles heading it, as it pastes into a spreadsheet (EDI-17). */
function tsvOf({ rows, fields, formats, granularities, titles }: Written): string {
  const columns = tableColumnsOf(rows, fields);
  const clean = (text: string) => text.replace(/[\t\n\r]+/g, ' ');
  return [
    columns.map((column) => clean(columnTitleOf(column, titles))).join('\t'),
    ...rows.map((row) =>
      columns
        .map((column) => clean(cellText(row[column], column, formats, granularities)))
        .join('\t'),
    ),
  ].join('\n');
}

/** The information icon of design 02's `.dline` (EDI-21), in the accent. */
function InfoIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" data-icon="info" aria-hidden="true">
      <circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 7v4M8 4.6v.4" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

/** A column's role chip (EDI-18): Σ for a measure, ◷ for time, Aa or # for the rest. */
function chipOf(
  column: string,
  numeric: ReadonlySet<string>,
  granularities: MemberGranularities,
): { kind: 'measure' | 'dimension' | 'timeDimension'; type: string } {
  if (numeric.has(column)) return { kind: 'measure', type: 'number' };
  if (granularityOf(column, granularities) !== undefined)
    return { kind: 'timeDimension', type: 'time' };
  return { kind: 'dimension', type: 'string' };
}

function RowTable({
  rows,
  testId,
  formats,
  granularities,
  titles,
  numeric,
  fields,
  swatchOf,
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
  /** The members in the wells' order, which the columns follow (AC-301). */
  fields: readonly string[];
  swatchOf?: ((column: string, value: unknown) => string | undefined) | undefined;
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
        // Design 02 state B's `.dline` (EDI-21): information, not a warning.
        <p className="results-drawer__dline" data-testid={`${testId}-truncated`}>
          <InfoIcon />
          {note}
        </p>
      )}
      {/* The prototype's .grid-table (T257): 12 px, tabular figures, a sticky
          28 px head, 24 px rows, the measures set right; design 02's muted
          "#" first, and each column's role chip (T690, EDI-18). */}
      <table className="grid-table grid-table--numbered" data-testid={testId}>
        <thead>
          <tr>
            <th scope="col" className="results-drawer__n">
              #
            </th>
            {columns.map((column) => (
              // By its title (AC-220), never "orders.count".
              <th scope="col" key={column} className={numeric.has(column) ? 'num' : undefined}>
                <FieldIcon member={chipOf(column, numeric, granularities)} />
                {columnTitleOf(column, titles)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.map((row, index) => (
            <tr key={index}>
              <td>{index + 1}</td>
              {columns.map((column) => {
                const swatch = swatchOf?.(column, row[column]);
                return (
                  <td key={column} className={numeric.has(column) ? 'num' : undefined}>
                    {swatch === undefined ? null : (
                      <span
                        className="results-drawer__swatch"
                        style={{ background: swatch }}
                        aria-hidden="true"
                      />
                    )}
                    {cellText(row[column], column, formats, granularities)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

/**
 * The Cube query's JSON in the model editor's code colours (EDI-20): each
 * key, string, number and literal its own span; the text is the JSON as is.
 */
function ColouredJson({ json }: { json: string }) {
  const parts: ReactNode[] = [];
  const token =
    /("(?:\\.|[^"\\])*")(\s*:)?|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|\b(true|false|null)\b/g;
  let at = 0;
  for (const match of json.matchAll(token)) {
    const start = match.index;
    if (start > at) parts.push(json.slice(at, start));
    const [whole, string, colon, number, literal] = match;
    if (string !== undefined) {
      parts.push(
        <span key={start} className={colon === undefined ? 'code-string' : 'code-key'}>
          {string}
        </span>,
      );
      if (colon !== undefined) parts.push(colon);
    } else if (number !== undefined)
      parts.push(
        <span key={start} className="code-number">
          {number}
        </span>,
      );
    else if (literal !== undefined)
      parts.push(
        <span key={start} className="code-literal">
          {literal}
        </span>,
      );
    at = start + whole.length;
  }
  if (at < json.length) parts.push(json.slice(at));
  return <>{parts}</>;
}

/** "24 rows · 42 ms": the answer's facts (EDI-17), the time where known. */
function factsOf(count: number, elapsedMs: number | undefined): string {
  const rows = `${count.toLocaleString('en-US')} ${count === 1 ? 'row' : 'rows'}`;
  return elapsedMs === undefined ? rows : `${rows} · ${String(Math.round(elapsedMs))} ms`;
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
  result,
  columns,
  elapsedMs,
  accelerated = false,
  swatchOf,
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
  /** The Cube query as JSON, or as the SQL Cube generates for it (EDI-20). */
  const [shownAs, setShownAs] = useState<'json' | 'sql'>('json');
  const sql = useQuery({
    queryKey: ['drawer-sql', query, item ?? null],
    queryFn: ({ signal }) => sqlOf(query, { ...forItem(item), signal }),
    enabled: open && view === 'query' && shownAs === 'sql',
  });

  const underlyingRows = ((underlying.data as { data?: unknown[] } | undefined)?.data ??
    []) as Record<string, unknown>[];

  const ids = useId();
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const section = useRef<HTMLElement>(null);
  const numeric = useMemo(
    () => new Set([...measuresOf(query), ...measuresOf(underlyingQuery)]),
    [query, underlyingQuery],
  );
  /** A tab chosen: its view, and the drawer open on it if it was not. */
  const choose = (id: DrawerView) => {
    onViewChange(id);
    if (!open) onOpenChange(true);
  };

  /**
   * Its height (EDI-15, direction §2): 240 px opened, dragged by the grip
   * from 160 px to half the editor's height, a double-click putting it back.
   * The pointer's alone: no new keyboard behaviour (R75).
   */
  const [height, setHeight] = useState(OPEN_HEIGHT);
  const drag = useRef<{ y: number; from: number; most: number } | null>(null);

  const json = JSON.stringify(query, null, 2);
  const statements = (sql.data?.queries ?? []).map((each) => each.sql).join('\n\n');
  const resultWritten: Written = {
    rows,
    fields: columns ?? fieldsOf(query),
    formats: result?.formats ?? formats,
    granularities,
    titles: result?.titles ?? titles,
    measures: measuresOf(query),
  };
  const copy = (text: string) => {
    // A clipboard the browser refuses leaves nothing copied, and nothing thrown
    // unhandled (T690's review).
    navigator.clipboard?.writeText(text).catch(() => undefined);
  };
  const download = (written: Written, name: string) =>
    saveFile(
      name,
      rowsCsvOf(written.rows, {
        fields: written.fields,
        measures: written.measures,
        formats: written.formats,
        granularities: written.granularities,
        titles: written.titles,
      }),
    );

  /** The tools at the strip's end, as design 02 pins 3 and states B, C and E draw them. */
  const tools = (
    <span className="results-drawer__tools">
      {!open || view === 'result' ? (
        <span className="results-drawer__facts" data-testid="drawer-facts">
          {factsOf(rows.length, elapsedMs)}
        </span>
      ) : null}
      {open && view === 'result' ? (
        <>
          <button
            type="button"
            className="btn-sm btn-ghost"
            onClick={() => copy(tsvOf(resultWritten))}
          >
            Copy
          </button>
          <button
            type="button"
            className="btn-sm btn-ghost"
            onClick={() => download(resultWritten, 'results.csv')}
          >
            Download CSV
          </button>
        </>
      ) : null}
      {open && view === 'underlying' && underlyingRows.length > 0 ? (
        <button
          type="button"
          className="btn-sm btn-ghost"
          onClick={() =>
            download(
              {
                rows: underlyingRows,
                fields: fieldsOf(underlyingQuery),
                formats,
                granularities: ungrouped(granularities),
                titles,
                measures: measuresOf(underlyingQuery),
              },
              'underlying-rows.csv',
            )
          }
        >
          Download CSV
        </button>
      ) : null}
      {open && view === 'query' ? (
        <>
          <span className="seg" role="group" aria-label="Shown as">
            {(['json', 'sql'] as const).map((each) => (
              <button
                key={each}
                type="button"
                aria-pressed={shownAs === each}
                onClick={() => setShownAs(each)}
              >
                {each.toUpperCase()}
              </button>
            ))}
          </span>
          <button
            type="button"
            className="btn-sm btn-ghost"
            disabled={shownAs === 'sql' && statements === ''}
            onClick={() => copy(shownAs === 'json' ? json : statements)}
          >
            Copy
          </button>
        </>
      ) : null}
      <button
        type="button"
        className="icon-button results-drawer__toggle"
        aria-expanded={open}
        aria-label={open ? 'Hide the results' : 'Show the results'}
        title={open ? 'Collapse' : 'Expand'}
        onClick={() => onOpenChange(!open)}
      >
        <span aria-hidden="true">{open ? '⌄' : '⌃'}</span>
      </button>
    </span>
  );

  return (
    // The prototype's .drawer (T257, editor.js 416): its tab strip always
    // shown, so the drawer is found even collapsed; open, 240 px under it.
    <section
      ref={section}
      className="results-drawer"
      data-testid="results-drawer"
      data-open={open}
      // Its strip and body together, as design 02 pin 1 measures it.
      style={open ? { height: `${String(height)}px` } : undefined}
    >
      {open ? (
        <span
          className="results-drawer__grip"
          title="Drag to resize · double-click to reset"
          aria-hidden="true"
          onPointerDown={(event) => {
            const editor = section.current?.parentElement?.getBoundingClientRect().height ?? 0;
            drag.current = {
              y: event.clientY,
              from: height,
              most: editor > 0 ? Math.max(MIN_HEIGHT, editor / 2) : Number.POSITIVE_INFINITY,
            };
            event.currentTarget.setPointerCapture?.(event.pointerId);
          }}
          onPointerMove={(event) => {
            const from = drag.current;
            if (from === null) return;
            const next = from.from + (from.y - event.clientY);
            setHeight(Math.round(Math.min(from.most, Math.max(MIN_HEIGHT, next))));
          }}
          onPointerUp={() => {
            drag.current = null;
          }}
          onDoubleClick={() => setHeight(OPEN_HEIGHT)}
        >
          <i />
        </span>
      ) : null}
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
              {/* Its count, muted (EDI-16). */}
              {id === 'result' ? (
                // Seen, not said: the tab keeps its name, and the facts beside
                // the tools say the rows in words.
                <span className="results-drawer__count" aria-hidden="true">
                  {rows.length.toLocaleString('en-US')}
                </span>
              ) : null}
              {/* What served the chart: ✓ a pre-aggregation, ○ the database (EDI-16). */}
              {id === 'acceleration' ? (
                <span
                  className="results-drawer__mark"
                  data-served={accelerated ? 'pre-aggregation' : 'database'}
                  title={
                    accelerated ? 'Served by a pre-aggregation' : 'Not served by a pre-aggregation'
                  }
                  aria-hidden="true"
                >
                  {accelerated ? '✓' : '○'}
                </span>
              ) : null}
            </button>
          ))}
        </div>
        {tools}
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
              formats={resultWritten.formats}
              granularities={granularities}
              titles={resultWritten.titles}
              numeric={numeric}
              fields={resultWritten.fields}
              swatchOf={swatchOf}
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
            <div className="results-drawer__query-view">
              {shownAs === 'json' ? (
                <pre className="results-drawer__query" data-testid="drawer-query">
                  <ColouredJson json={json} />
                </pre>
              ) : sql.isPending ? (
                <StateLine kind="run">Asking Cube for its SQL…</StateLine>
              ) : sql.isError ? (
                <StateLine kind="err">{sql.error.message}</StateLine>
              ) : (
                <pre className="results-drawer__query" data-testid="drawer-sql">
                  {statements}
                </pre>
              )}
              {/* Design 02 state C's foot: where it went, how long, how many. */}
              <p
                className="results-drawer__dline results-drawer__foot"
                data-testid="drawer-query-foot"
              >
                <span className="results-drawer__muted">Sent to</span>{' '}
                <code>POST /cubejs-api/v1/load</code>
                <span className="results-drawer__muted">
                  {' · '}
                  {factsOf(rows.length, elapsedMs).split(' · ').reverse().join(' · ')}
                </span>
              </p>
            </div>
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
