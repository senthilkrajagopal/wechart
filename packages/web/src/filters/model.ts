import type { Member } from '../editor/fields';

/**
 * Dashboard filters (F9): the widgets on a dashboard's filter bar, and the
 * values they hold.
 *
 * AC-076: "THE SYSTEM SHALL offer filter widgets for a date range with
 * presets, a list with search, a numeric range, and a checkbox list" — the
 * four kinds below, Spotfire's filter types by way of direction.md.
 *
 * A filter's definition is part of the dashboard and saved with it; the value
 * it holds is the reader's, and belongs to the view (and, at AC-081, to the
 * URL) rather than to the saved document.
 */
export type FilterWidget = 'dateRange' | 'list' | 'range' | 'checkbox';

export const FILTER_WIDGETS: readonly {
  readonly widget: FilterWidget;
  readonly label: string;
  readonly hint: string;
}[] = [
  { widget: 'dateRange', label: 'Date range', hint: 'Presets such as last 30 days, or two dates' },
  { widget: 'list', label: 'List with search', hint: 'Pick values from a searchable list' },
  { widget: 'range', label: 'Numeric range', hint: 'A lowest and a highest value' },
  { widget: 'checkbox', label: 'Checkbox list', hint: 'Tick the values to keep' },
];

/**
 * Which tiles a filter reaches (AC-077): the whole dashboard, one page tab, or
 * tiles named one by one.
 */
export type FilterScope =
  | { readonly kind: 'dashboard' }
  | { readonly kind: 'page'; readonly pageId: string }
  | { readonly kind: 'tiles'; readonly tileIds: readonly string[] };

export interface DashboardFilter {
  readonly id: string;
  readonly widget: FilterWidget;
  /** The Cube member it filters on; chosen after the filter is added. */
  readonly member?: string;
  /** Absent is the whole dashboard, which a filter reaches until told otherwise. */
  readonly scope?: FilterScope;
}

/**
 * The relative ranges a date filter offers, in the words Cube resolves
 * (observed against Cube v1.7.42: `docs/research/cube/data-apis.md`). Sent to
 * Cube as they are, so "last 30 days" stays the last thirty days whenever the
 * dashboard is opened (AC-083).
 */
export const DATE_PRESETS = [
  'today',
  'yesterday',
  'last 7 days',
  'last 30 days',
  'this week',
  'this month',
  'last month',
  'this quarter',
  'last quarter',
  'this year',
  'last year',
  'last 12 months',
] as const;

export type DatePreset = (typeof DATE_PRESETS)[number];

/** What a filter holds, by widget. Absent is "no filter": everything shows. */
export type FilterValue =
  | { readonly kind: 'preset'; readonly preset: DatePreset }
  | { readonly kind: 'dates'; readonly from: string; readonly to: string }
  | { readonly kind: 'values'; readonly values: readonly string[] }
  | {
      readonly kind: 'range';
      readonly min?: number | undefined;
      readonly max?: number | undefined;
    };

/** The values held, by `valueKeyOf` each filter. */
export type FilterValues = Readonly<Record<string, FilterValue>>;

/**
 * Where a filter's value is held: the filter *and* the field it is on. A
 * value chosen on one field means nothing on another, and Undo can put a
 * filter back on its old field — keyed by the filter alone, it came back
 * holding the new field's values (T082's review). Keyed by both, it comes back
 * with the value it had there.
 */
export function valueKeyOf(filter: DashboardFilter): string {
  return `${filter.id} ${filter.member ?? ''}`;
}

/**
 * The members a widget can filter on. A date range needs a time dimension; a
 * numeric range a number dimension; a list or a checkbox list any other
 * dimension. Measures are left out: filtering on one filters groups after
 * they are totalled, which none of these widgets says.
 */
export function membersFor(widget: FilterWidget, members: readonly Member[]): Member[] {
  const dimensions = members.filter(
    (member) => member.kind !== 'measure' && member.kind !== 'segment',
  );
  switch (widget) {
    case 'dateRange':
      return dimensions.filter((member) => member.kind === 'timeDimension');
    case 'range':
      return dimensions.filter((member) => member.kind === 'dimension' && member.type === 'number');
    case 'list':
    case 'checkbox':
      return dimensions.filter((member) => member.kind === 'dimension');
  }
}

/** A new filter of this kind, with no member yet. */
export function newFilter(widget: FilterWidget, id: string): DashboardFilter {
  return { id, widget };
}
