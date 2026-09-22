/**
 * Every key Cube's validator accepts on a cube or a view, and on everything
 * they hold, for the model editor's form (T138, AC-132; direction.md §7b).
 *
 * Transcribed from the YAML schema inventory in
 * `docs/research/cube/data-modeling.md` (Y.3–Y.14), itself read from Cube
 * v1.7.42's Joi validator. Each object is named by its section there, and
 * `schema.test.ts` reads those tables back, so a key the research lists and
 * this lacks — or an enumeration that differs — fails the test.
 */

/** How a key's value is edited. */
export type FieldKind =
  /** A name: letters, digits and `_`. */
  | 'identifier'
  | 'text'
  /** A Cube SQL template. */
  | 'sql'
  /** A boolean, or a string Cube reads as a Python expression (J·EXPR). */
  | 'flag'
  /** A strict boolean. */
  | 'boolean'
  | 'number'
  | 'enum'
  /** A member, cube or view named without braces (J·REF). */
  | 'reference'
  | 'references'
  /**
   * Members whose order matters — an index's columns, its sort order (T152,
   * AC-146) — edited as rows that move up and down.
   */
  | 'ordered-references'
  /** A format: a named format or a d3 specifier. */
  | 'format'
  /** A list of objects the schema describes, edited as rows. */
  | 'list'
  /** An object the schema describes, edited as its own fields. */
  | 'object'
  /** Anything else — lists of strings or filters, `meta` — edited as YAML. */
  | 'yaml';

export interface Field {
  readonly key: string;
  readonly label: string;
  readonly kind: FieldKind;
  /** The validator's allowed values, for an enumeration. */
  readonly options?: readonly string[];
  /**
   * Values the validator also takes that the docs call legacy or write in
   * camelCase (`has_many`, `manyToOne`): offered apart, after the options.
   */
  readonly aliases?: readonly string[];
  /** Options the validator takes only when another key of the object has a value. */
  readonly onlyWith?: Readonly<Record<string, { readonly key: string; readonly value: unknown }>>;
  /** The object a `list` or `object` holds, by its section. */
  readonly of?: SectionId;
  /**
   * The object a `list` holds when the research writes it inside the key's
   * type (`list of {sql, dir: asc or desc}`) rather than as a section.
   */
  readonly fields?: readonly Field[];
  /** Accepted by the validator but undocumented or legacy (research: "legacy"). */
  readonly legacy?: boolean;
}

export type SectionId =
  | 'Y.2'
  | 'Y.3'
  | 'Y.4'
  | 'Y.5'
  | 'Y.6'
  | 'Y.6a'
  | 'Y.6b'
  | 'Y.6c'
  | 'Y.6d'
  | 'Y.7'
  | 'Y.7a'
  | 'Y.7b'
  | 'Y.7c'
  | 'Y.7d'
  | 'Y.8'
  | 'Y.9'
  | 'Y.10'
  | 'Y.10a'
  | 'Y.10b'
  | 'Y.10c'
  | 'Y.11'
  | 'Y.12'
  | 'Y.13'
  | 'Y.14';

export interface ObjectSchema {
  readonly title: string;
  /** A list of them, where adding "s" or "ies" would not say it ("Cubes in the view"). */
  readonly plural?: string;
  readonly fields: readonly Field[];
}

/** A key's label: its words, the first capitalised — "pre_aggregations" reads "Pre aggregations". */
function labelOf(key: string): string {
  const words = key.replace(/[._]/g, ' ').replace(/\bsql\b/g, 'SQL');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const f = (key: string, kind: FieldKind, extra: Partial<Field> = {}): Field => ({
  key,
  label: labelOf(key),
  kind,
  ...extra,
});
const legacy = (key: string, kind: FieldKind = 'yaml') => f(key, kind, { legacy: true });

/** Y.16: the filter operators, without and with `measureFilter`. */
const OPERATORS = [
  'equals',
  'notEquals',
  'contains',
  'notContains',
  'startsWith',
  'notStartsWith',
  'endsWith',
  'notEndsWith',
  'in',
  'notIn',
  'gt',
  'gte',
  'lt',
  'lte',
  'set',
  'notSet',
  'inDateRange',
  'notInDateRange',
  'onTheDate',
  'beforeDate',
  'beforeOrOnDate',
  'afterDate',
  'afterOrOnDate',
] as const;

/**
 * Y.7 Shapes: the measure types — the multi-stage `number_agg` and `rank`
 * among them, which Joi takes only with `multi_stage: true` (§Y.17).
 */
export const MEASURE_TYPES = [
  'count',
  'number',
  'string',
  'boolean',
  'time',
  'sum',
  'avg',
  'min',
  'max',
  'count_distinct',
  'count_distinct_approx',
  'number_agg',
  'rank',
] as const;

export const SCHEMA: Readonly<Record<SectionId, ObjectSchema>> = {
  'Y.2': {
    title: 'Model file',
    fields: [
      f('cubes', 'list', { of: 'Y.3' }),
      f('views', 'list', { of: 'Y.10' }),
      f('view_groups', 'list', { of: 'Y.12' }),
    ],
  },
  'Y.3': {
    title: 'Cube',
    fields: [
      f('name', 'identifier'),
      f('sql_table', 'sql'),
      f('sql', 'sql'),
      f('extends', 'reference'),
      f('data_source', 'text'),
      f('sql_alias', 'text'),
      f('title', 'text'),
      f('description', 'text'),
      f('public', 'flag'),
      legacy('shown', 'flag'),
      f('meta', 'yaml'),
      f('calendar', 'boolean'),
      f('refresh_key', 'object', { of: 'Y.4' }),
      f('joins', 'list', { of: 'Y.5' }),
      f('dimensions', 'list', { of: 'Y.6' }),
      f('measures', 'list', { of: 'Y.7' }),
      f('segments', 'list', { of: 'Y.8' }),
      f('hierarchies', 'list', { of: 'Y.9' }),
      f('pre_aggregations', 'list', { of: 'Y.13' }),
      f('access_policy', 'list', { of: 'Y.14' }),
      legacy('rewrite_queries', 'flag'),
    ],
  },
  'Y.4': {
    title: 'Refresh key',
    fields: [f('every', 'text'), f('sql', 'sql'), f('timezone', 'text'), f('immutable', 'boolean')],
  },
  'Y.5': {
    title: 'Join',
    fields: [
      f('name', 'reference'),
      // The validator also takes the legacy `belongs_to`, `has_many`,
      // `has_one` and camelCase spellings; the form offers the three the
      // docs use, and never one Cube rejects.
      f('relationship', 'enum', {
        options: ['many_to_one', 'one_to_many', 'one_to_one'],
        // Y.5: "legacy `belongs_to`, `has_many`, `has_one`; camelCase forms …".
        aliases: [
          'belongs_to',
          'has_many',
          'has_one',
          'manyToOne',
          'oneToMany',
          'oneToOne',
          'belongsTo',
          'hasMany',
          'hasOne',
        ],
      }),
      f('sql', 'sql'),
    ],
  },
  'Y.6': {
    title: 'Dimension',
    fields: [
      f('name', 'identifier'),
      f('type', 'enum', { options: ['string', 'number', 'boolean', 'time', 'geo', 'switch'] }),
      f('sql', 'sql'),
      f('title', 'text'),
      f('description', 'text'),
      f('public', 'flag'),
      f('primary_key', 'flag'),
      f('order', 'enum', { options: ['asc', 'desc'] }),
      f('format', 'format'),
      f('currency', 'text'),
      f('meta', 'yaml'),
      f('mask', 'yaml'),
      f('sub_query', 'flag'),
      f('propagate_filters_to_sub_query', 'flag'),
      f('case', 'object', { of: 'Y.6c' }),
      f('latitude', 'yaml'),
      f('longitude', 'yaml'),
      f('granularities', 'list', { of: 'Y.6a' }),
      f('time_shift', 'list', { of: 'Y.6b' }),
      f('links', 'list', { of: 'Y.6d' }),
      f('values', 'yaml'),
      f('multi_stage', 'boolean'),
      f('add_group_by', 'references'),
      f('filter', 'object', { of: 'Y.7d' }),
      f('key', 'reference'),
      f('suggest_filter_values', 'boolean'),
      legacy('shown', 'flag'),
      legacy('aliases'),
      legacy('field_type', 'text'),
      legacy('values_as_segments'),
      legacy('enable_suggestions', 'boolean'),
    ],
  },
  'Y.6a': {
    title: 'Granularity',
    fields: [
      f('name', 'identifier'),
      f('interval', 'text'),
      f('offset', 'text'),
      f('origin', 'text'),
      f('title', 'text'),
      f('sql', 'sql'),
    ],
  },
  'Y.6b': {
    title: 'Time shift',
    fields: [
      f('name', 'identifier'),
      f('type', 'enum', { options: ['prior', 'next'] }),
      f('interval', 'text'),
      f('sql', 'sql'),
    ],
  },
  'Y.6c': {
    title: 'Case',
    fields: [f('switch', 'sql'), f('when', 'yaml'), f('else', 'yaml')],
  },
  'Y.6d': {
    title: 'Link',
    fields: [
      f('name', 'identifier'),
      f('label', 'text'),
      f('url', 'sql'),
      f('dashboard', 'text'),
      f('icon', 'text'),
      f('target', 'enum', { options: ['blank', 'self'] }),
      f('primary', 'boolean'),
      f('params', 'yaml'),
    ],
  },
  'Y.7': {
    title: 'Measure',
    fields: [
      f('name', 'identifier'),
      f('type', 'enum', {
        options: MEASURE_TYPES,
        // §Y.17: Joi takes these two only with `multi_stage: true`.
        onlyWith: {
          number_agg: { key: 'multi_stage', value: true },
          rank: { key: 'multi_stage', value: true },
        },
      }),
      f('sql', 'sql'),
      f('title', 'text'),
      f('description', 'text'),
      f('public', 'flag'),
      f('format', 'format'),
      f('currency', 'text'),
      f('meta', 'yaml'),
      f('mask', 'yaml'),
      f('filters', 'yaml'),
      f('drill_members', 'references'),
      f('rolling_window', 'object', { of: 'Y.7a' }),
      f('multi_stage', 'boolean'),
      f('time_shift', 'list', { of: 'Y.7b' }),
      f('grain', 'object', { of: 'Y.7c' }),
      f('group_by', 'references'),
      f('reduce_by', 'references'),
      f('add_group_by', 'references'),
      f('filter', 'object', { of: 'Y.7d' }),
      f('case', 'object', { of: 'Y.6c' }),
      // "list of `{sql (required), dir: asc or desc}`".
      f('order_by', 'list', {
        fields: [f('sql', 'sql'), f('dir', 'enum', { options: ['asc', 'desc'] })],
      }),
      legacy('cumulative', 'boolean'),
      legacy('drill_filters'),
      legacy('aliases'),
      legacy('visible', 'flag'),
      legacy('shown', 'flag'),
    ],
  },
  'Y.7a': {
    title: 'Rolling window',
    fields: [
      f('type', 'enum', {
        options: ['fixed', 'to_date', 'year_to_date', 'quarter_to_date', 'month_to_date'],
      }),
      f('trailing', 'text'),
      f('leading', 'text'),
      f('offset', 'enum', { options: ['start', 'end'] }),
      f('granularity', 'text'),
    ],
  },
  'Y.7b': {
    title: 'Time shift',
    fields: [
      f('interval', 'text'),
      f('type', 'enum', { options: ['prior', 'next'] }),
      f('time_dimension', 'reference'),
      f('name', 'identifier'),
    ],
  },
  'Y.7c': {
    title: 'Grain',
    fields: [f('exclude', 'references'), f('keep_only', 'references'), f('include', 'references')],
  },
  'Y.7d': {
    title: 'Multi-stage filter',
    fields: [
      f('mode', 'enum', { options: ['relative', 'fixed'] }),
      f('exclude', 'references'),
      f('keep_only', 'references'),
      f('include', 'yaml'),
    ],
  },
  'Y.8': {
    title: 'Segment',
    fields: [
      f('name', 'identifier'),
      f('sql', 'sql'),
      f('description', 'text'),
      f('public', 'flag'),
      f('title', 'text'),
      f('meta', 'yaml'),
      legacy('shown', 'flag'),
      legacy('aliases'),
    ],
  },
  'Y.9': {
    title: 'Hierarchy',
    fields: [
      f('name', 'identifier'),
      f('levels', 'references'),
      f('title', 'text'),
      f('public', 'flag'),
    ],
  },
  'Y.10': {
    title: 'View',
    fields: [
      f('name', 'identifier'),
      f('cubes', 'list', { of: 'Y.10a' }),
      f('extends', 'reference'),
      f('title', 'text'),
      f('description', 'text'),
      f('public', 'flag'),
      f('meta', 'yaml'),
      f('measures', 'list', { of: 'Y.7' }),
      f('dimensions', 'list', { of: 'Y.6' }),
      f('folders', 'list', { of: 'Y.11' }),
      f('default_filters', 'list', { of: 'Y.10c' }),
      f('access_policy', 'list', { of: 'Y.14' }),
      f('view_group', 'reference'),
      f('view_groups', 'references'),
      // Accepted through the shared base schema, undocumented for views; the
      // lists and the object hold what a cube's do.
      f('joins', 'list', { of: 'Y.5', legacy: true }),
      f('segments', 'list', { of: 'Y.8', legacy: true }),
      f('hierarchies', 'list', { of: 'Y.9', legacy: true }),
      f('pre_aggregations', 'list', { of: 'Y.13', legacy: true }),
      f('refresh_key', 'object', { of: 'Y.4', legacy: true }),
      legacy('data_source', 'text'),
      legacy('sql_alias', 'text'),
      legacy('rewrite_queries', 'flag'),
      legacy('shown', 'flag'),
    ],
  },
  'Y.10a': {
    title: 'Cube in the view',
    plural: 'Cubes in the view',
    fields: [
      f('join_path', 'text'),
      f('includes', 'yaml'),
      f('excludes', 'references'),
      f('prefix', 'flag'),
      f('alias', 'text'),
      f('split', 'boolean'),
    ],
  },
  'Y.10b': {
    title: 'Included member',
    fields: [
      f('name', 'identifier'),
      f('alias', 'identifier'),
      f('title', 'text'),
      f('description', 'text'),
      f('format', 'format'),
      f('meta', 'yaml'),
    ],
  },
  'Y.10c': {
    title: 'Default filter',
    fields: [
      f('member', 'reference'),
      f('operator', 'enum', { options: OPERATORS }),
      f('values', 'yaml'),
      f('unless', 'references'),
    ],
  },
  'Y.11': {
    title: 'Folder',
    fields: [f('name', 'text'), f('includes', 'yaml')],
  },
  'Y.12': {
    title: 'View group',
    fields: [
      f('name', 'text'),
      f('title', 'text'),
      f('description', 'text'),
      f('includes', 'yaml'),
      legacy('views', 'references'),
    ],
  },
  'Y.13': {
    title: 'Pre-aggregation',
    fields: [
      f('name', 'identifier'),
      f('type', 'enum', {
        options: ['rollup', 'original_sql', 'rollup_join', 'rollup_lambda', 'auto_rollup'],
      }),
      f('measures', 'references'),
      f('dimensions', 'references'),
      f('segments', 'references'),
      f('time_dimension', 'reference'),
      f('granularity', 'text'),
      // "list of `{dimension (reference), granularity}`".
      f('time_dimensions', 'list', {
        fields: [f('dimension', 'reference'), f('granularity', 'text')],
      }),
      f('rollups', 'references'),
      f('partition_granularity', 'enum', {
        options: ['hour', 'day', 'week', 'month', 'quarter', 'year'],
      }),
      f('refresh_key', 'yaml'),
      f('scheduled_refresh', 'flag'),
      f('build_range_start', 'yaml'),
      f('build_range_end', 'yaml'),
      f('refresh_range_start', 'yaml'),
      f('refresh_range_end', 'yaml'),
      // "named list of `{columns (references), type: regular or aggregate}`".
      f('indexes', 'list', {
        fields: [
          f('name', 'identifier'),
          f('columns', 'ordered-references'),
          f('type', 'enum', { options: ['regular', 'aggregate'] }),
          // "… or `{sql}`": an index on an expression, instead of columns.
          f('sql', 'sql'),
        ],
      }),
      f('allow_non_strict_date_range_match', 'boolean'),
      f('use_original_sql_pre_aggregations', 'flag'),
      f('external', 'flag'),
      f('read_only', 'flag'),
      f('union_with_source_data', 'flag'),
      f('unique_key_columns', 'yaml'),
      f('stream_offset', 'enum', { options: ['earliest', 'latest'] }),
      // "list of `{member (reference), type (string)}`".
      f('output_column_types', 'list', {
        fields: [f('member', 'reference'), f('type', 'text')],
      }),
      f('sql_alias', 'text'),
      f('max_pre_aggregations', 'number'),
      legacy('time_dimension_reference', 'reference'),
      legacy('measure_references', 'references'),
      legacy('dimension_references', 'references'),
      legacy('segment_references', 'references'),
      legacy('rollup_references', 'references'),
    ],
  },
  'Y.14': {
    title: 'Access policy',
    fields: [
      f('group', 'text'),
      f('groups', 'yaml'),
      // "list of `{if: expression}`".
      f('conditions', 'list', { fields: [f('if', 'text')] }),
      f('member_level.includes', 'yaml'),
      f('member_level.excludes', 'yaml'),
      f('member_masking.includes', 'yaml'),
      f('member_masking.excludes', 'yaml'),
      // The filter rows under the table: member, operator (Y.16 with
      // `measureFilter`), values, and nested `or` / `and`.
      f('row_level.filters', 'list', {
        fields: [
          f('member', 'reference'),
          f('operator', 'enum', { options: [...OPERATORS, 'measureFilter'] }),
          f('values', 'yaml'),
          f('or', 'yaml'),
          f('and', 'yaml'),
        ],
      }),
      // "Only `true` is valid".
      f('row_level.allow_all', 'boolean', { options: ['true'] }),
    ],
  },
};
