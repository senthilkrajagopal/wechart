import { DEFAULT_PALETTE, labelOf } from '@wechart/charts';
import {
  bulletBandOf,
  columnsOf,
  formatValue,
  graphicalTableTrends,
  kpiTrendValues,
  memberOn,
  NO_COLUMNS,
  type GraphicalTableColumn,
  type IconRule,
  type RenderSpec,
  type TimeGranularity,
} from '@wechart/core';
import { useQueries } from '@tanstack/react-query';
import { useContext } from 'react';

import { useQueryItem } from '../query/item';
import { loadTile } from '../query/loadTile';
import { SecurityPreview } from '../query/securityPreview';
import type { Change } from './text/elementQueries';
import { BulletGraphSvg } from './text/elements/BulletGraph';
import { ChangeText, type Direction } from './text/elements/ChangeElement';
import { IconText } from './text/elements/IconElement';
import { SparklineSvg } from './text/elements/Sparkline';

/** One trend as answered: its time at its grain, over its periods, and its rows. */
export interface LoadedTrend {
  readonly time: { readonly member: string; readonly granularity: TimeGranularity };
  readonly periods: number;
  readonly rows: readonly Readonly<Record<string, unknown>>[];
}

type Row = Readonly<Record<string, unknown>>;

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
}: {
  readonly column: GraphicalTableColumn;
  readonly spec: RenderSpec;
  readonly row: Row;
  readonly trends: readonly LoadedTrend[];
  readonly chartTime: string | undefined;
  readonly matches: (one: Row) => boolean;
  readonly now: Date;
}) {
  const measure = column.settings.measure;
  const formats = spec.formats ?? {};
  switch (column.kind) {
    case 'value':
      return <td className="gt__figure">{formatValue(row[measure], measure, formats)}</td>;
    case 'sparkline': {
      const trend = trendFor(column, trends, chartTime);
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
        <td>
          <IconText value={iconValueOf(column, row)} rules={rulesOf(column)} />
        </td>
      );
    case 'change': {
      const trend = trendFor(column, trends, chartTime);
      const seen = (trend === undefined ? [] : valuesAlong(trend, measure, matches, now)).filter(
        (value): value is number => value !== null,
      );
      const [previous, current] = seen.slice(-2);
      const change: Change | undefined =
        previous === undefined || current === undefined
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
        <td>
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
}: {
  readonly spec: RenderSpec;
  readonly trends: readonly LoadedTrend[];
  readonly now?: Date;
  /** + Column: the chart's columns, where the tile can open them. */
  readonly onAddColumn?: (() => void) | undefined;
}) {
  const columns = columnsOf(spec.options);
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
  const groups =
    groupBy === undefined
      ? [{ name: undefined, rows: spec.rows }]
      : [...new Set(spec.rows.map((row) => String(row[groupBy] ?? '')))].map((name) => ({
          name,
          rows: spec.rows.filter((row) => String(row[groupBy] ?? '') === name),
        }));
  return (
    <div className="gt-scroll" data-testid="graphical-table">
      <table className="gt">
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
              return (
                <tr key={`${member}-${String(at)}`}>
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
                    />
                  ))}
                </tr>
              );
            })}
          </tbody>
        ))}
      </table>
    </div>
  );
}

/**
 * The graphical table with its trends asked of Cube (T944): one query per
 * time and grain its columns draw, as the tile's own query is asked — its
 * filters and limits kept, its dashboard and previewed context — by Rows.
 */
export function GraphicalTable({
  spec,
  query,
  onAddColumn,
}: {
  readonly spec: RenderSpec;
  readonly query?: Readonly<Record<string, unknown>> | undefined;
  readonly onAddColumn?: (() => void) | undefined;
}) {
  const item = useQueryItem();
  const context = useContext(SecurityPreview);
  const now = new Date();
  const asked =
    query === undefined
      ? []
      : graphicalTableTrends(
          query,
          columnsOf(spec.options),
          Object.keys(spec.granularities ?? {})[0],
          now,
        );
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
  }));
  return (
    <GraphicalTableView
      spec={spec}
      trends={trends}
      now={now}
      {...(onAddColumn === undefined ? {} : { onAddColumn })}
    />
  );
}
