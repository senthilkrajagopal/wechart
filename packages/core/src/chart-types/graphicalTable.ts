/**
 * The graphical table (T943, AC-570, AC-037; design 23 sheet 2; direction.md
 * rule 149): one row per member of Rows, sectioned by an optional Group rows
 * by, across an ordered list of Columns, each a Value, Change, Sparkline,
 * Bullet or Icon.
 *
 * Rows and Group rows by are the chart's first and second dimensions, as
 * parallel coordinates read Line by and Colour. The columns are the type's own
 * setting, stored sparse as `options.graphicalTable`.
 *
 * **A column is R80's element of its kind** (design 23: "Each column's
 * settings are R80's element settings (design 21, state C) for that kind").
 * It is stored as that element's attributes beside its kind, and read back
 * only where the Text tile's own schema (`textDocumentProblems`) accepts it as
 * that element, so a column can never hold a setting R80's element couldn't.
 * A Bullet column is R80's Bullet graph, `bulletGraph` as stored.
 */
import type { TimeGranularity } from '../format';
import { textDocumentProblems, TEXT_DOCUMENT_VERSION } from '../text-document';
import type { ChartTypeModule } from './index';
import { kpiTrendQuery } from './kpi';

/** A column's kind, by design 23's names. */
export type ColumnKind = 'value' | 'change' | 'sparkline' | 'bullet' | 'icon';

/** The five kinds, in design 23 sheet 2's order (AC-570), with R80's element each one is. */
export const COLUMN_KINDS: readonly {
  readonly kind: ColumnKind;
  readonly label: string;
  /** R80's element of this kind, as the Text tile stores it. */
  readonly element: 'value' | 'change' | 'sparkline' | 'bulletGraph' | 'icon';
}[] = [
  { kind: 'value', label: 'Value', element: 'value' },
  { kind: 'change', label: 'Change', element: 'change' },
  { kind: 'sparkline', label: 'Sparkline', element: 'sparkline' },
  { kind: 'bullet', label: 'Bullet', element: 'bulletGraph' },
  { kind: 'icon', label: 'Icon', element: 'icon' },
];

/**
 * One column: its kind and its R80 element's settings, the measure among them
 * (`measure` is the one every kind requires).
 */
export interface GraphicalTableColumn {
  readonly kind: ColumnKind;
  readonly settings: Readonly<Record<string, unknown>> & { readonly measure: string };
}

export interface GraphicalTableSettings {
  readonly columns: readonly GraphicalTableColumn[];
}

/** The chart read as a graphical table. */
export interface GraphicalTable {
  /** One row per member of this dimension. */
  readonly rows?: string;
  /** A section headed by each member of this dimension. */
  readonly groupBy?: string;
  readonly columns: readonly GraphicalTableColumn[];
}

/** Where the table keeps its columns in a chart's options. */
export const GRAPHICAL_TABLE_OPTION = 'graphicalTable';

const record = (value: unknown): Readonly<Record<string, unknown>> | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : undefined;

/** Would R80's Text tile accept these attributes as its element of this kind? */
function isElement(element: string, attrs: Readonly<Record<string, unknown>>): boolean {
  return (
    textDocumentProblems({
      version: TEXT_DOCUMENT_VERSION,
      doc: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: element, attrs }] }],
      },
    }).length === 0
  );
}

/**
 * R80's settings a column inside a chart doesn't take: the table marks its
 * rows as table tiles do, and every column shares the chart's filters
 * (decision T943-1). Read and dropped, never kept.
 */
const NOT_IN_A_CHART = new Set(['marking', 'whenUnmarked', 'filters']);

function columnOf(stored: unknown): GraphicalTableColumn | undefined {
  const one = record(stored);
  if (one === undefined) return undefined;
  const { kind: element, ...attrs } = one;
  const kind = COLUMN_KINDS.find((each) => each.element === element)?.kind;
  if (kind === undefined || !isElement(element as string, attrs)) return undefined;
  const settings = Object.fromEntries(
    Object.entries(attrs).filter(([key]) => !NOT_IN_A_CHART.has(key)),
  );
  return { kind, settings: settings as GraphicalTableColumn['settings'] };
}

/**
 * The columns as stored, in order. A column R80's element would refuse is
 * left out, not the whole table, as the KPI leaves out a setting it can't read
 * (T936-1).
 */
function parse(stored: unknown): GraphicalTableSettings {
  const columns = record(stored)?.['columns'];
  return {
    columns: Array.isArray(columns)
      ? columns.map(columnOf).filter((one): one is GraphicalTableColumn => one !== undefined)
      : [],
  };
}

const elementOf = (kind: ColumnKind): string =>
  COLUMN_KINDS.find((each) => each.kind === kind)?.element ?? kind;

/** Sparse: a table with no columns stores nothing. */
function save(settings: GraphicalTableSettings): Record<string, unknown> | undefined {
  if (settings.columns.length === 0) return undefined;
  return {
    columns: settings.columns.map((column) => ({
      kind: elementOf(column.kind),
      ...column.settings,
    })),
  };
}

export const graphicalTableModule: ChartTypeModule<GraphicalTableSettings> = {
  type: 'graphicalTable',
  parse,
  save,
};

/** The columns of a chart's options, in order. */
export function columnsOf(
  options: Readonly<Record<string, unknown>> | undefined,
): readonly GraphicalTableColumn[] {
  return parse(options?.[GRAPHICAL_TABLE_OPTION]).columns;
}

/** Options with these columns, the key gone when there are none. */
export function withColumns(
  options: Readonly<Record<string, unknown>>,
  columns: readonly GraphicalTableColumn[],
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...options };
  const saved = save({ columns });
  if (saved === undefined) delete next[GRAPHICAL_TABLE_OPTION];
  else next[GRAPHICAL_TABLE_OPTION] = saved;
  return next;
}

/** A new column of a kind on a measure: R80's element as inserted, its source and nothing else. */
export function newColumn(kind: ColumnKind, measure: string): GraphicalTableColumn {
  return { kind, settings: { measure } };
}

/** A chart read as a graphical table. */
export function graphicalTableOf(chart: {
  readonly wells: { readonly measures: readonly string[]; readonly dimensions: readonly string[] };
  readonly options?: Readonly<Record<string, unknown>> | undefined;
}): GraphicalTable {
  const [rows, groupBy] = chart.wells.dimensions;
  return {
    ...(rows === undefined ? {} : { rows }),
    ...(groupBy === undefined ? {} : { groupBy }),
    columns: columnsOf(chart.options),
  };
}

const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value !== '' ? value : undefined;

/**
 * Every measure the table's columns read (T944, AC-571): each column's own, a
 * Bullet's Target measure and an Icon's "as % of" one. Asked of Cube with the
 * chart's Metrics (`targetMeasuresOf`).
 */
export function graphicalTableMeasures(columns: readonly GraphicalTableColumn[]): string[] {
  const measures = columns.flatMap((column) => {
    const target = record(column.settings['target']);
    return [
      column.settings.measure,
      ...(column.kind === 'bullet' && target?.['kind'] === 'measure' && text(target['measure'])
        ? [target['measure'] as string]
        : []),
      ...(column.kind === 'icon' && text(column.settings['of']) !== undefined
        ? [column.settings['of'] as string]
        : []),
    ];
  });
  return [...new Set(measures)].sort();
}

/** R80's Change compares months unless it says otherwise (decision T884-1). */
const CHANGE_PERIOD = 'month';
/** R80's Sparkline shows the last 12 periods unless it says otherwise. */
const TREND_PERIODS = 12;

/** One trend the table asks of Cube: its time at a grain, over its last periods. */
export interface GraphicalTableTrend {
  readonly time: { readonly member: string; readonly granularity: TimeGranularity };
  readonly periods: number;
  readonly measures: readonly string[];
  readonly query: Record<string, unknown>;
}

/**
 * The trends the table's columns draw (T944, AC-571; design 23 sheet 2's
 * "two queries per page: the values, and the values by month"): each
 * Sparkline's measure by its time at its grain over its last periods, each
 * Change's by its time at its period, so the latest two can be compared.
 * Asked once per time and grain, as the values query is asked — Rows, Group
 * rows by and every filter kept — the current period last. A column with no
 * time of its own takes the chart's Time; with neither, it asks nothing.
 */
export function graphicalTableTrends(
  values: Readonly<Record<string, unknown>>,
  columns: readonly GraphicalTableColumn[],
  chartTime: string | undefined,
  now: Date,
): GraphicalTableTrend[] {
  const needs = new Map<
    string,
    { member: string; granularity: TimeGranularity; periods: number; measures: Set<string> }
  >();
  for (const column of columns) {
    if (column.kind !== 'sparkline' && column.kind !== 'change') continue;
    const member = text(column.settings['time']) ?? chartTime;
    if (member === undefined) continue;
    const granularity = (
      column.kind === 'sparkline'
        ? (text(column.settings['granularity']) ?? 'month')
        : (text(column.settings['period']) ?? CHANGE_PERIOD)
    ) as TimeGranularity;
    const last = column.settings['last'];
    const periods =
      column.kind === 'sparkline' && typeof last === 'number' && last >= 1 ? last : TREND_PERIODS;
    const key = `${member}|${granularity}`;
    const need = needs.get(key) ?? { member, granularity, periods, measures: new Set<string>() };
    need.periods = Math.max(need.periods, periods);
    need.measures.add(column.settings.measure);
    needs.set(key, need);
  }
  return [...needs.values()].map(({ member, granularity, periods, measures }) => {
    const sorted = [...measures].sort();
    const time = { member, granularity };
    return {
      time,
      periods,
      measures: sorted,
      query: kpiTrendQuery(values, sorted, time, now, periods),
    };
  });
}

/** What a table with no columns says, beside + Column (AC-570). */
export const NO_COLUMNS = 'Add a column: Value, Change, Sparkline, Bullet or Icon.';
