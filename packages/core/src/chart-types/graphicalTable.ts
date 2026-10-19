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
import { textDocumentProblems, TEXT_DOCUMENT_VERSION } from '../text-document';
import type { ChartTypeModule } from './index';

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

function columnOf(stored: unknown): GraphicalTableColumn | undefined {
  const one = record(stored);
  if (one === undefined) return undefined;
  const { kind: element, ...attrs } = one;
  const kind = COLUMN_KINDS.find((each) => each.element === element)?.kind;
  if (kind === undefined || !isElement(element as string, attrs)) return undefined;
  return { kind, settings: attrs as GraphicalTableColumn['settings'] };
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

/** What a table with no columns says, beside + Column (AC-570). */
export const NO_COLUMNS = 'Add a column: Value, Change, Sparkline, Bullet or Icon.';
