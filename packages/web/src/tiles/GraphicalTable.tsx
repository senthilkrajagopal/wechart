import { DEFAULT_PALETTE, labelOf, markedCellOf, rowMarksOf, type RowMark } from '@wechart/charts';
import {
  bulletBandOf,
  columnsOf,
  formatValue,
  graphicalTableMeasures,
  graphicalTablePage,
  kpiTrendPeriods,
  kpiTrendValues,
  memberOn,
  NO_COLUMNS,
  pageQueries,
  type GraphicalTableColumn,
  type IconRule,
  type RenderSpec,
  type TimeGranularity,
} from '@wechart/core';
import { useQueries } from '@tanstack/react-query';
import { useContext, useMemo, useState, type CSSProperties } from 'react';

import type { ClickedItem } from '../dashboard/crossfilter/clicked';
import { useQueryItem } from '../query/item';
import { loadTile } from '../query/loadTile';
import { SecurityPreview } from '../query/securityPreview';
import type { Change } from './text/elementQueries';
import { ElementSkeleton, ElementUnavailable } from './text/ElementState';
import { BulletGraphSvg } from './text/elements/BulletGraph';
import { ChangeText, type Direction } from './text/elements/ChangeElement';
import { IconText } from './text/elements/IconElement';
import { SparklineSvg } from './text/elements/Sparkline';

/** One trend as answered: its time at its grain, over its periods, and its rows. */
export interface LoadedTrend {
  readonly time: { readonly member: string; readonly granularity: TimeGranularity };
  readonly periods: number;
  readonly rows: readonly Readonly<Record<string, unknown>>[];
  /** Still on its way: its cells show loading, never "No data" (rule 134). */
  readonly pending?: boolean | undefined;
  /** Why it failed, where it did: its cells say "Unavailable", with Details. */
  readonly error?: unknown;
}

type Row = Readonly<Record<string, unknown>>;

/** R80's sparkline is 64 px wide (design 21 pin 9): its skeleton holds the same place. */
const SPARKLINE_WIDTH = 64;

const numberOf = (raw: unknown): number | undefined => {
  if (raw === null || raw === undefined || raw === '') return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
};

const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value !== '' ? value : undefined;

/** "Categories", from "Category": the rows' title as a caption counts them. */
function pluralOf(title: string): string {
  if (/[^aeiou]y$/i.test(title)) return `${title.slice(0, -1)}ies`;
  if (/(s|x|z|ch|sh)$/i.test(title)) return `${title}es`;
  return `${title}s`;
}

/** The trend a column reads: its time at its grain. */
function trendFor(
  column: GraphicalTableColumn,
  trends: readonly LoadedTrend[],
  chartTime: string | undefined,
): LoadedTrend | undefined {
  const member = text(column.settings['time']) ?? chartTime;
  const granularity =
    column.kind === 'sparkline'
      ? (text(column.settings['granularity']) ?? 'month')
      : (text(column.settings['period']) ?? 'month');
  return trends.find(
    (trend) => trend.time.member === member && trend.time.granularity === granularity,
  );
}

/** A member's values along a trend, oldest first, a period with none a gap. */
function valuesAlong(
  trend: LoadedTrend,
  measure: string,
  matches: (row: Row) => boolean,
  now: Date,
): (number | null)[] {
  return kpiTrendValues(trend.rows.filter(matches), measure, trend.time, now, trend.periods);
}

/** A column's heading (decision T944-1). */
function headingOf(column: GraphicalTableColumn, spec: RenderSpec): string {
  const title = labelOf(spec, column.settings.measure);
  switch (column.kind) {
    case 'sparkline': {
      const last = column.settings['last'];
      const n = typeof last === 'number' && last >= 1 ? last : 12;
      const grain = text(column.settings['granularity']) ?? 'month';
      return `Trend, ${String(n)} ${grain}${n === 1 ? '' : 's'}`;
    }
    case 'bullet':
      return `${title} vs target`;
    case 'icon':
      return `${title} status`;
    case 'change':
      return `${title} vs last ${text(column.settings['period']) ?? 'month'}`;
    default:
      return title;
  }
}

const isRule = (rule: unknown): rule is IconRule =>
  typeof rule === 'object' && rule !== null && 'op' in rule && 'state' in rule && 'label' in rule;

const rulesOf = (column: GraphicalTableColumn): IconRule[] =>
  Array.isArray(column.settings['rules'])
    ? (column.settings['rules'] as unknown[]).filter(isRule)
    : [];

/** An Icon's value: its measure, or its measure as a share of another (R80, AC-522). */
function iconValueOf(column: GraphicalTableColumn, row: Row): number | undefined {
  const value = numberOf(row[column.settings.measure]);
  const ofMember = text(column.settings['of']);
  if (ofMember === undefined) return value;
  const of = numberOf(row[ofMember]);
  return value === undefined || of === undefined || of === 0 ? undefined : value / of;
}

/** A Bullet's target: a fixed value, or a measure on the row (R80, AC-521). */
function targetOf(column: GraphicalTableColumn, row: Row): number | undefined {
  const target = column.settings['target'] as {
    kind?: unknown;
    value?: unknown;
    measure?: unknown;
  };
  if (target?.kind === 'fixed') return numberOf(target.value);
  if (target?.kind === 'measure' && typeof target.measure === 'string')
    return numberOf(row[target.measure]);
  return undefined;
}

/** One cell, as R80's element of the column's kind draws it (AC-571). */
function Cell({
  column,
  spec,
  row,
  trends,
  chartTime,
  matches,
  now,
  mark,
}: {
  readonly column: GraphicalTableColumn;
  readonly spec: RenderSpec;
  readonly row: Row;
  readonly trends: readonly LoadedTrend[];
  readonly chartTime: string | undefined;
  readonly matches: (one: Row) => boolean;
  readonly now: Date;
  /** The row under the marking the tile shows, where it shows one (T946). */
  readonly mark?: RowMark | undefined;
}) {
  const measure = column.settings.measure;
  const formats = spec.formats ?? {};
  switch (column.kind) {
    case 'value': {
      // Another tile's marked part of it (T946, AC-573): an additive
      // measure's said in the cell, any other's in its tooltip only.
      const total = numberOf(row[measure]);
      const part =
        mark?.state !== 'partly' || total === undefined
          ? undefined
          : markedCellOf({
              marked: mark.marked[measure],
              total,
              aggType: spec.marking?.aggTypes?.[measure],
            });
      const written = part === undefined ? undefined : formatValue(part.marked, measure, formats);
      return (
        <td
          className="gt__figure"
          {...(part?.where === 'tooltip' ? { title: `Marked: ${written ?? ''}` } : {})}
        >
          {formatValue(row[measure], measure, formats)}
          {part?.where === 'cell' ? (
            <span className="gt__marked">{` · ${written ?? ''} marked`}</span>
          ) : null}
        </td>
      );
    }
    case 'sparkline': {
      const trend = trendFor(column, trends, chartTime);
      // On its way, or failed: said as such, never as no data (rule 134).
      if (trend?.pending === true)
        return (
          <td>
            <ElementSkeleton pixels={SPARKLINE_WIDTH} />
          </td>
        );
      if (trend?.error !== undefined)
        return (
          <td>
            <ElementUnavailable measure={labelOf(spec, measure)} error={trend.error} />
          </td>
        );
      const values = trend === undefined ? [] : valuesAlong(trend, measure, matches, now);
      if (values.every((value) => value === null))
        return (
          <td>
            {/* No data for this row (rule 134): "—", never an empty line. */}
            <span role="img" aria-label="No data for these filters">
              —
            </span>
          </td>
        );
      return (
        <td>
          <SparklineSvg
            values={values}
            title={labelOf(spec, measure)}
            member={measure}
            formats={formats}
            granularity={trend?.time.granularity ?? 'month'}
            last={trend?.periods ?? values.length}
            lastPoint={column.settings['lastPoint'] === true}
            colour={spec.colours?.[measure] ?? spec.palette?.[0] ?? DEFAULT_PALETTE[0]}
          />
        </td>
      );
    }
    case 'bullet': {
      const value = numberOf(row[measure]);
      if (value === undefined) return <td>—</td>;
      const target = targetOf(column, row);
      const ranges = Array.isArray(column.settings['ranges'])
        ? (column.settings['ranges'] as unknown[]).flatMap((one) => numberOf(one) ?? [])
        : [];
      const written = (at: number) => formatValue(at, measure, formats);
      const band =
        target === undefined || target === 0 || ranges.length === 0
          ? undefined
          : bulletBandOf(
              value,
              target,
              ranges.map((edge) => Math.round((edge / target) * 1000) / 10),
            )?.band;
      const label =
        target === undefined
          ? written(value)
          : `${written(value)} of ${written(target)}${band === undefined ? '' : `, in the ${band} band`}`;
      return (
        <td>
          <span className="gt__bullet">
            <BulletGraphSvg
              value={value}
              target={target}
              ranges={ranges}
              min={numberOf(column.settings['min']) ?? 0}
              max={numberOf(column.settings['max'])}
              title={labelOf(spec, measure)}
              member={measure}
              formats={formats}
              label={label}
            />
            <span>{written(value)}</span>
          </span>
        </td>
      );
    }
    case 'icon':
      return (
        // A state, not a mark: it keeps its colour on an unmarked row (AC-573).
        <td className="gt__icon">
          <IconText value={iconValueOf(column, row)} rules={rulesOf(column)} />
        </td>
      );
    case 'change': {
      const trend = trendFor(column, trends, chartTime);
      if (trend?.pending === true)
        return (
          <td className="gt__change">
            <ElementSkeleton />
          </td>
        );
      if (trend?.error !== undefined)
        return (
          <td className="gt__change">
            <ElementUnavailable measure={labelOf(spec, measure)} error={trend.error} />
          </td>
        );
      /**
       * The periods its heading names (checkpoint 3's review): this one and
       * the one before, never the latest two that happen to have data. A
       * missing one gives no change, "—", saying which period has none, as
       * the KPI does (T939).
       */
      const along = trend === undefined ? [] : valuesAlong(trend, measure, matches, now);
      const [previous, current] = along.slice(-2);
      if (trend !== undefined && (previous === null || current === null)) {
        const starts = kpiTrendPeriods(trend.time, now, trend.periods);
        const missing = starts[current === null ? starts.length - 1 : starts.length - 2] ?? '';
        const said = `No data for ${formatValue(missing, trend.time.member, formats, {
          [trend.time.member]: trend.time.granularity,
        })}`;
        return (
          <td className="gt__change">
            <span
              className="text-change"
              data-tone="neutral"
              role="img"
              aria-label={said}
              title={said}
            >
              —
            </span>
          </td>
        );
      }
      const change: Change | undefined =
        previous === undefined || current === undefined || previous === null || current === null
          ? undefined
          : {
              current,
              previous,
              delta: current - previous,
              ratio: previous === 0 ? undefined : (current - previous) / previous,
            };
      const direction = (['higher', 'lower', 'neutral'] as const).find(
        (one) => one === column.settings['direction'],
      );
      return (
        <td className="gt__change">
          <ChangeText
            change={change}
            member={measure}
            formats={formats}
            show={column.settings['show'] === 'amount' ? 'amount' : 'percent'}
            direction={(direction ?? 'higher') as Direction}
          />
        </td>
      );
    }
  }
}

/** "‹Rows›s at a glance: 6 rows; 2 on track, 2 at risk, 2 off track." (AC-571). */
function captionOf(
  rowsTitle: string,
  rows: readonly Row[],
  columns: readonly GraphicalTableColumn[],
): string {
  const counted = `${pluralOf(rowsTitle)} at a glance: ${String(rows.length)} row${rows.length === 1 ? '' : 's'}`;
  const icon = columns.find((column) => column.kind === 'icon');
  if (icon === undefined) return `${counted}.`;
  const rules = rulesOf(icon);
  const counts = new Map<string, number>();
  for (const row of rows) {
    const value = iconValueOf(icon, row);
    const rule =
      value === undefined
        ? undefined
        : rules.find((one) => {
            if (one.op === 'otherwise') return true;
            const against = one.value ?? Number.NaN;
            return one.op === '>='
              ? value >= against
              : one.op === '>'
                ? value > against
                : one.op === '<='
                  ? value <= against
                  : one.op === '<'
                    ? value < against
                    : value === against;
          });
    const label = rule?.label ?? 'No rule matched';
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  const said = [...rules.map((rule) => rule.label), 'No rule matched']
    .filter((label, at, all) => all.indexOf(label) === at && (counts.get(label) ?? 0) > 0)
    .map((label) => `${String(counts.get(label))} ${label.toLowerCase()}`);
  return said.length === 0 ? `${counted}.` : `${counted}; ${said.join(', ')}.`;
}

/**
 * The graphical table as drawn (T944, AC-571, AC-570; design 23 sheet 2): a
 * real `<table>`, a row per member of Rows, each cell R80's element of its
 * column's kind; a section headed by each member of Group rows by; and with
 * no column, what to add with + Column.
 */
export function GraphicalTableView({
  spec,
  trends,
  now = new Date(),
  onAddColumn,
  page: shownPage,
  onPage,
  onItemClick,
  onShapeMark,
}: {
  readonly spec: RenderSpec;
  readonly trends: readonly LoadedTrend[];
  readonly now?: Date;
  /** + Column: the chart's columns, where the tile can open them. */
  readonly onAddColumn?: (() => void) | undefined;
  /** The page shown, from 0, where the tile asks each page's trends (T945); else the table's own. */
  readonly page?: number | undefined;
  readonly onPage?: ((page: number) => void) | undefined;
  /** A row's click, its member (T946, AC-573): it marks, or cross-filters, by the dashboard's mode. */
  readonly onItemClick?: ((item: ClickedItem, toggle: boolean) => void) | undefined;
  /** A Shift-click's range of rows, marked as a shape's items are (T946). */
  readonly onShapeMark?: ((items: readonly ClickedItem[], toggle: boolean) => void) | undefined;
}) {
  const [ownPage, setOwnPage] = useState(0);
  /**
   * Where a Shift-range starts, on the page it was set: the last row clicked
   * without Shift, as a table tile holds it — and, as there, not moved by the
   * range, so a second Shift-click grows or shrinks the same one.
   */
  const [anchor, setAnchor] = useState<{ page: number; at: number } | null>(null);
  const columns = columnsOf(spec.options);
  // Each row under the marking the tile shows, read once per answer (as a table's).
  const marksOf = useMemo(
    () => rowMarksOf(spec, graphicalTableMeasures(columnsOf(spec.options))),
    [spec],
  );
  if (columns.length === 0)
    return (
      <div className="tile-no-rows" data-testid="gt-no-columns" role="status">
        <p className="tile-no-rows__headline">{NO_COLUMNS}</p>
        {onAddColumn === undefined ? null : (
          <p>
            <button type="button" className="btn btn-sm" onClick={onAddColumn}>
              + Column
            </button>
          </p>
        )}
      </div>
    );
  const rowsMember = memberOn(spec.encoding, 'x') ?? '';
  const groupBy = memberOn(spec.encoding, 'facet');
  const chartTime = Object.keys(spec.granularities ?? {})[0];
  const rowsTitle = labelOf(spec, rowsMember);
  // 50 rows a page (T945, AC-572), sectioned within the page.
  const paged = graphicalTablePage(spec.rows, shownPage ?? ownPage);
  const turn = (to: number) => {
    if (onPage === undefined) setOwnPage(to);
    else onPage(to);
  };
  const groups =
    groupBy === undefined
      ? [{ name: undefined, rows: paged.rows }]
      : [...new Set(paged.rows.map((row) => String(row[groupBy] ?? '')))].map((name) => ({
          name,
          rows: paged.rows.filter((row) => String(row[groupBy] ?? '') === name),
        }));
  // The rows in the order drawn, the order a Shift-range runs in.
  const drawnRows = groups.flatMap((group) => group.rows);
  /** A row as the item it marks or filters by: its member of Rows (AC-573). */
  const itemOf = (row: Row): ClickedItem => {
    const raw = row[rowsMember];
    const member = String(raw ?? '');
    return {
      name: member,
      marks: [{ member: rowsMember, value: typeof raw === 'number' ? raw : member }],
    };
  };
  const clickRow = (at: number, event: React.MouseEvent) => {
    const row = drawnRows[at];
    if (row === undefined || onItemClick === undefined) return;
    const from = anchor?.page === paged.page ? anchor.at : undefined;
    if (event.shiftKey && from !== undefined && onShapeMark !== undefined) {
      const [first, last] = from <= at ? [from, at] : [at, from];
      onShapeMark(drawnRows.slice(first, last + 1).map(itemOf), false);
      return;
    }
    const toggle = event.ctrlKey || event.metaKey;
    // A plain click starts the range; a Ctrl/⌘ toggle leaves it where it began.
    if (!toggle) setAnchor({ page: paged.page, at });
    onItemClick(itemOf(row), toggle);
  };
  let drawnAt = 0;
  const pager =
    paged.pages === 1 ? null : (
      <p className="gt-pager">
        <button
          type="button"
          className="btn btn-sm"
          aria-label="Previous rows"
          disabled={paged.page === 0}
          onClick={() => {
            turn(paged.page - 1);
          }}
        >
          ‹
        </button>
        <span data-testid="gt-page">
          {`Rows ${String(paged.first + 1)}–${String(paged.first + paged.rows.length)} of ${String(paged.total)}`}
        </span>
        <button
          type="button"
          className="btn btn-sm"
          aria-label="Next rows"
          disabled={paged.page === paged.pages - 1}
          onClick={() => {
            turn(paged.page + 1);
          }}
        >
          ›
        </button>
      </p>
    );
  return (
    <div className="gt-paged">
      {/* A table wider than its tile scrolls inside it, in a named region the keyboard reaches (T944-1). */}
      <div
        className="gt-scroll"
        data-testid="graphical-table"
        role="region"
        aria-label={`${pluralOf(rowsTitle)} at a glance`}
        // Busy while any trend is on its way (rule 134).
        {...(trends.some((trend) => trend.pending === true) ? { 'aria-busy': true } : {})}
        // A scrolling region the keyboard must reach (WCAG 2.1.1), as a table's is.
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
        tabIndex={0}
      >
        <table
          className="gt"
          // The marked rows' rule, in the marking's colour (AC-573).
          {...(spec.marking === undefined
            ? {}
            : { style: { '--gt-mark': spec.marking.colour } as CSSProperties })}
        >
          <caption>{captionOf(rowsTitle, spec.rows, columns)}</caption>
          <thead>
            <tr>
              <th scope="col">{rowsTitle}</th>
              {columns.map((column, at) => (
                <th key={at} scope="col">
                  {headingOf(column, spec)}
                </th>
              ))}
            </tr>
          </thead>
          {groups.map((group) => (
            <tbody key={group.name ?? ''}>
              {group.name === undefined ? null : (
                <tr>
                  <th scope="rowgroup" colSpan={columns.length + 1}>
                    {group.name}
                  </th>
                </tr>
              )}
              {group.rows.map((row, at) => {
                const member = String(row[rowsMember] ?? '');
                // This row's trend rows: its member, and its section's.
                const matches = (one: Row) =>
                  String(one[rowsMember] ?? '') === member &&
                  (groupBy === undefined || String(one[groupBy] ?? '') === group.name);
                const mark = marksOf(row);
                const place = drawnAt;
                drawnAt += 1;
                return (
                  <tr
                    key={`${member}-${String(at)}`}
                    {...(mark === undefined ? {} : { 'data-marked': mark.state })}
                    {...(onItemClick === undefined
                      ? {}
                      : {
                          className: 'gt__markable',
                          onClick: (event: React.MouseEvent) => {
                            clickRow(place, event);
                          },
                        })}
                  >
                    <th scope="row">{member}</th>
                    {columns.map((column, place) => (
                      <Cell
                        key={place}
                        column={column}
                        spec={spec}
                        row={row}
                        trends={trends}
                        chartTime={chartTime}
                        matches={matches}
                        now={now}
                        mark={mark}
                      />
                    ))}
                  </tr>
                );
              })}
            </tbody>
          ))}
        </table>
      </div>
      {pager}
    </div>
  );
}

/**
 * The graphical table with its trends asked of Cube (T944): one query per
 * time and grain its columns draw, as the tile's own query is asked — its
 * filters and limits kept, its dashboard and previewed context — by Rows,
 * for the shown page's members only (T945, AC-572).
 */
export function GraphicalTable({
  spec,
  query,
  onAddColumn,
  onItemClick,
  onShapeMark,
}: {
  readonly spec: RenderSpec;
  readonly query?: Readonly<Record<string, unknown>> | undefined;
  readonly onAddColumn?: (() => void) | undefined;
  readonly onItemClick?: ((item: ClickedItem, toggle: boolean) => void) | undefined;
  readonly onShapeMark?: ((items: readonly ClickedItem[], toggle: boolean) => void) | undefined;
}) {
  const item = useQueryItem();
  const context = useContext(SecurityPreview);
  const now = new Date();
  const [page, setPage] = useState(0);
  const asked =
    query === undefined
      ? []
      : pageQueries(query, spec.rows, page, {
          rows: memberOn(spec.encoding, 'x'),
          columns: columnsOf(spec.options),
          chartTime: Object.keys(spec.granularities ?? {})[0],
          now,
        }).trends;
  const answers = useQueries({
    queries: asked.map((trend) => ({
      queryKey: ['graphical-table-trend', trend.query, context ?? null, item ?? null],
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        loadTile({
          query: { ...trend.query },
          signal,
          ...(context === undefined ? {} : { context }),
          item,
        }),
    })),
  });
  const trends: LoadedTrend[] = asked.map((trend, at) => ({
    time: trend.time,
    periods: trend.periods,
    rows:
      (answers[at]?.data as { data?: readonly Record<string, unknown>[] } | undefined)?.data ?? [],
    // Its own states, loading or failed, never read as no data (checkpoint 3).
    pending: answers[at]?.isPending === true,
    ...(answers[at]?.isError === true ? { error: answers[at]?.error } : {}),
  }));
  return (
    <GraphicalTableView
      spec={spec}
      trends={trends}
      now={now}
      page={page}
      onPage={setPage}
      {...(onAddColumn === undefined ? {} : { onAddColumn })}
      {...(onItemClick === undefined ? {} : { onItemClick })}
      {...(onShapeMark === undefined ? {} : { onShapeMark })}
    />
  );
}
