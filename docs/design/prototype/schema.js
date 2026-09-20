/* wechart prototype: declarative form schema for Cube model YAML (v1.7.42).
   Source of truth: docs/research/cube/data-modeling.md §Y (validator: CubeValidator.ts @ v1.7.42).
   Field kinds: text, sql, enum, bool, num, refs (member multi-picker), ref (single member), json, list (items), obj (nested). */
(function () {
  const INTERVAL_HINT =
    'N unit, e.g. "1 hour"; units: second, minute, hour, day, week (refresh) or up to year (windows)';
  const OPS = [
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
  ];
  const GRAN = ['year', 'quarter', 'month', 'week', 'day', 'hour', 'minute', 'second'];
  const NUM_FORMATS = [
    '',
    'number',
    'percent',
    'currency',
    'abbr',
    'accounting',
    'decimal',
    'id',
    'number_0',
    'number_2',
    'percent_0',
    'percent_1',
    'percent_2',
    'currency_0',
    'currency_2',
    'abbr_1',
    'accounting_2',
  ];
  const DIM_FORMATS = {
    string: ['', 'imageUrl', 'link', 'id'],
    boolean: ['', 'id'],
    geo: [''],
    time: ['', '%Y-%m-%d', '%d %b %Y', '%b %Y', '%Y'],
    number: NUM_FORMATS,
    switch: [''],
  };

  const shapeOf = (d) =>
    d.type === 'switch' ? 'switch' : d.type === 'geo' ? 'geo' : d.case ? 'case' : 'sql';

  const refreshKey = {
    k: 'refresh_key',
    t: 'obj',
    label: 'Refresh key',
    fields: [
      {
        k: 'every',
        t: 'text',
        label: 'Every',
        ph: '1 hour or cron "0 * * * *"',
        hint: INTERVAL_HINT,
      },
      { k: 'sql', t: 'sql', label: 'SQL (refresh when result changes)' },
      { k: 'timezone', t: 'text', label: 'Timezone (for cron)', ph: 'America/Los_Angeles' },
    ],
  };

  const filterList = (label) => ({
    k: 'filters',
    t: 'list',
    label,
    item: 'filter',
    fields: [
      { k: 'member', t: 'ref', label: 'Member', scope: 'local' },
      { k: 'operator', t: 'enum', label: 'Operator', opts: OPS },
      {
        k: 'values',
        t: 'text',
        label: 'Values (comma-separated)',
        list: true,
        ph: '{ securityContext.region }',
      },
    ],
  });

  const SCHEMA = {
    cube: {
      groups: [
        {
          g: 'Basics',
          fields: [
            {
              k: 'name',
              t: 'text',
              label: 'Name',
              req: true,
              mono: true,
              hint: 'Unique across cubes and views',
            },
            {
              k: 'sql_table',
              t: 'text',
              label: 'SQL table',
              mono: true,
              ph: 'schema.table',
              hint: 'Set exactly one of SQL table or SQL',
            },
            { k: 'sql', t: 'sql', label: 'SQL (instead of SQL table)' },
            {
              k: 'data_source',
              t: 'text',
              label: 'Data source',
              ph: 'default',
              hint: 'Passed to driverFactory()',
            },
            { k: 'title', t: 'text', label: 'Title' },
            { k: 'description', t: 'text', label: 'Description', area: true },
            { k: 'public', t: 'bool', label: 'Public (queryable through the API)', def: true },
          ],
        },
        {
          g: 'Advanced',
          fields: [
            { k: 'extends', t: 'text', label: 'Extends', mono: true, ph: 'base cube name' },
            {
              k: 'sql_alias',
              t: 'text',
              label: 'SQL alias',
              mono: true,
              hint: 'Shortens generated aliases and pre-aggregation table names',
            },
            { k: 'calendar', t: 'bool', label: 'Calendar cube (custom calendar)' },
            refreshKey,
          ],
        },
        {
          g: 'Meta and AI context',
          fields: [
            {
              k: 'meta',
              t: 'json',
              label: 'meta (YAML map)',
              hint: 'Free-form; ai_context is read by AI tools',
            },
          ],
        },
      ],
    },

    dimension: {
      title: (d) => d.name,
      sub: (d) => d.type,
      groups: [
        {
          g: 'Basics',
          fields: [
            { k: 'name', t: 'text', label: 'Name', req: true, mono: true },
            {
              k: 'type',
              t: 'enum',
              label: 'Type',
              req: true,
              opts: ['string', 'number', 'boolean', 'time', 'geo', 'switch'],
            },
            {
              k: '__shape',
              t: 'shape',
              label: 'Defined by',
              opts: [
                ['sql', 'SQL expression'],
                ['case', 'CASE / WHEN'],
                ['geo', 'Latitude + longitude'],
                ['switch', 'Switch values'],
              ],
            },
            {
              k: 'sql',
              t: 'sql',
              label: 'SQL',
              show: (d) => shapeOf(d) === 'sql',
              hint: 'Time dimensions should evaluate to TIMESTAMP',
            },
            {
              k: 'values',
              t: 'text',
              list: true,
              label: 'Switch values (comma-separated)',
              show: (d) => d.type === 'switch',
            },
            { k: 'latitude.sql', t: 'sql', label: 'Latitude SQL', show: (d) => d.type === 'geo' },
            { k: 'longitude.sql', t: 'sql', label: 'Longitude SQL', show: (d) => d.type === 'geo' },
            { k: 'title', t: 'text', label: 'Title', show: (d) => d.type !== 'switch' },
            {
              k: 'description',
              t: 'text',
              label: 'Description',
              area: true,
              show: (d) => d.type !== 'switch',
            },
            {
              k: 'primary_key',
              t: 'bool',
              label: 'Primary key',
              hint: 'Required on cubes used in joins; hides the member by default',
            },
            {
              k: 'public',
              t: 'bool',
              label: 'Public',
              def: true,
              show: (d) => d.type !== 'switch',
            },
            { k: 'order', t: 'enum', label: 'Default sort', opts: ['', 'asc', 'desc'] },
          ],
        },
        {
          g: 'CASE / WHEN',
          show: (d) => shapeOf(d) === 'case',
          fields: [
            {
              k: 'case.when',
              t: 'list',
              label: 'When',
              item: 'branch',
              fields: [
                { k: 'sql', t: 'sql', label: 'Condition (SQL)' },
                { k: 'label', t: 'text', label: 'Label' },
              ],
            },
            { k: 'case.else.label', t: 'text', label: 'Else label' },
          ],
        },
        {
          g: 'Formatting',
          show: (d) => d.type !== 'switch',
          fields: [
            {
              k: 'format',
              t: 'enum',
              label: 'Format',
              optsBy: (d) => DIM_FORMATS[d.type] || [''],
              free: true,
              hint: 'Numbers also accept d3-format specifiers; time accepts strftime strings',
            },
            {
              k: 'currency',
              t: 'text',
              label: 'Currency (ISO 4217)',
              ph: 'USD',
              show: (d) => d.type === 'number',
            },
          ],
        },
        {
          g: 'Time',
          show: (d) => d.type === 'time',
          fields: [
            {
              k: 'granularities',
              t: 'list',
              label: 'Custom granularities',
              item: 'granularity',
              fields: [
                { k: 'name', t: 'text', label: 'Name', mono: true },
                { k: 'title', t: 'text', label: 'Title' },
                {
                  k: 'interval',
                  t: 'text',
                  label: 'Interval',
                  ph: '2 week',
                  hint: 'Without origin, must divide its parent unit evenly',
                },
                {
                  k: 'offset',
                  t: 'text',
                  label: 'Offset',
                  ph: '-1 day',
                  hint: 'Cannot be combined with origin',
                },
                { k: 'origin', t: 'text', label: 'Origin', ph: '2024-01-01' },
                {
                  k: 'sql',
                  t: 'sql',
                  label: 'SQL override (name must be a predefined granularity)',
                },
              ],
            },
            {
              k: 'time_shift',
              t: 'list',
              label: 'Time shifts (calendar cubes)',
              item: 'shift',
              fields: [
                { k: 'name', t: 'text', label: 'Name', mono: true },
                { k: 'type', t: 'enum', label: 'Type', opts: ['', 'prior', 'next'] },
                { k: 'interval', t: 'text', label: 'Interval', ph: '1 year' },
                { k: 'sql', t: 'sql', label: 'SQL mapping' },
              ],
            },
          ],
        },
        {
          g: 'Sub-query',
          show: (d) => shapeOf(d) === 'sql',
          fields: [
            { k: 'sub_query', t: 'bool', label: 'Sub-query (SQL references a measure)' },
            {
              k: 'propagate_filters_to_sub_query',
              t: 'bool',
              label: 'Propagate filters to sub-query',
              show: (d) => !!d.sub_query,
            },
          ],
        },
        {
          g: 'Links',
          fields: [
            {
              k: 'links',
              t: 'list',
              label: 'Links (Cube 1.6.53+)',
              item: 'link',
              fields: [
                { k: 'name', t: 'text', label: 'Name', mono: true },
                { k: 'label', t: 'text', label: 'Label' },
                { k: 'url', t: 'sql', label: 'URL (SQL)' },
                { k: 'dashboard', t: 'text', label: 'Dashboard slug (instead of URL)' },
                { k: 'icon', t: 'text', label: 'Icon (Tabler, kebab-case)' },
                { k: 'target', t: 'enum', label: 'Target', opts: ['', 'blank', 'self'] },
                { k: 'primary', t: 'bool', label: 'Primary (at most one)' },
              ],
            },
          ],
        },
        {
          g: 'Security',
          fields: [
            {
              k: 'mask',
              t: 'text',
              label: 'Mask value',
              hint: 'Used by member_masking policies; default NULL. Use {sql: …} in code for SQL masks',
            },
          ],
        },
        {
          g: 'Multi-stage (Tesseract)',
          collapsed: true,
          fields: [
            { k: 'multi_stage', t: 'bool', label: 'Multi-stage dimension' },
            {
              k: 'add_group_by',
              t: 'refs',
              label: 'Add group by',
              scope: 'dims',
              show: (d) => !!d.multi_stage,
            },
          ],
        },
        {
          g: 'Meta',
          collapsed: true,
          fields: [{ k: 'meta', t: 'json', label: 'meta (YAML map)' }],
        },
      ],
    },

    measure: {
      title: (m) => m.name,
      sub: (m) => m.type,
      groups: [
        {
          g: 'Basics',
          fields: [
            { k: 'name', t: 'text', label: 'Name', req: true, mono: true },
            {
              k: 'type',
              t: 'enum',
              label: 'Type',
              req: true,
              optsBy: (m) => [
                'count',
                'count_distinct',
                'count_distinct_approx',
                'sum',
                'avg',
                'min',
                'max',
                'number',
                'string',
                'time',
                'boolean',
                ...(m.multi_stage ? ['number_agg', 'rank'] : []),
              ],
            },
            {
              k: 'sql',
              t: 'sql',
              label: 'SQL',
              hintBy: (m) =>
                m.type === 'count'
                  ? 'Optional for count'
                  : ['number', 'string', 'time', 'boolean'].includes(m.type)
                    ? 'An aggregate expression, e.g. {revenue} / NULLIF({count}, 0)'
                    : 'A non-aggregated column or expression',
            },
            { k: 'title', t: 'text', label: 'Title' },
            { k: 'description', t: 'text', label: 'Description', area: true },
            { k: 'public', t: 'bool', label: 'Public', def: true },
          ],
        },
        {
          g: 'Filtered aggregate',
          fields: [
            {
              k: 'filters',
              t: 'list',
              label: 'Filters (all must match)',
              item: 'filter',
              fields: [{ k: 'sql', t: 'sql', label: 'Condition (SQL)' }],
            },
          ],
        },
        {
          g: 'Formatting',
          fields: [
            {
              k: 'format',
              t: 'enum',
              label: 'Format',
              opts: NUM_FORMATS,
              free: true,
              hint: 'Or a d3-format specifier such as $,.2f',
            },
            {
              k: 'currency',
              t: 'text',
              label: 'Currency (ISO 4217)',
              ph: 'USD',
              show: (m) => !['string', 'boolean', 'time'].includes(m.type),
            },
          ],
        },
        {
          g: 'Drill-down',
          fields: [{ k: 'drill_members', t: 'refs', label: 'Drill members', scope: 'any' }],
        },
        {
          g: 'Rolling window',
          fields: [
            {
              k: 'rolling_window.type',
              t: 'enum',
              label: 'Window type',
              opts: ['', 'fixed', 'to_date', 'year_to_date', 'quarter_to_date', 'month_to_date'],
            },
            {
              k: 'rolling_window.trailing',
              t: 'text',
              label: 'Trailing',
              ph: '3 month or unbounded',
              show: (m) =>
                (m.rolling_window || {}).type === 'fixed' ||
                (m.rolling_window && !m.rolling_window.type),
            },
            {
              k: 'rolling_window.leading',
              t: 'text',
              label: 'Leading',
              ph: '0',
              show: (m) => (m.rolling_window || {}).type === 'fixed',
            },
            {
              k: 'rolling_window.offset',
              t: 'enum',
              label: 'Offset',
              opts: ['', 'start', 'end'],
              show: (m) => (m.rolling_window || {}).type === 'fixed',
            },
            {
              k: 'rolling_window.granularity',
              t: 'enum',
              label: 'To-date granularity',
              opts: ['', ...GRAN],
              show: (m) => (m.rolling_window || {}).type === 'to_date',
            },
          ],
        },
        {
          g: 'Multi-stage (Tesseract)',
          collapsed: true,
          fields: [
            {
              k: 'multi_stage',
              t: 'bool',
              label: 'Multi-stage measure',
              hint: 'Unlocks time shift, grain, filter, case and rank',
            },
            {
              k: 'time_shift',
              t: 'list',
              label: 'Time shift',
              item: 'shift',
              show: (m) => !!m.multi_stage,
              fields: [
                { k: 'interval', t: 'text', label: 'Interval', ph: '1 year' },
                { k: 'type', t: 'enum', label: 'Type', opts: ['', 'prior', 'next'] },
                { k: 'time_dimension', t: 'ref', label: 'Time dimension', scope: 'time' },
                { k: 'name', t: 'text', label: 'Calendar shift name' },
              ],
            },
            {
              k: 'grain.keep_only',
              t: 'refs',
              label: 'Grain: keep only',
              scope: 'dims',
              show: (m) => !!m.multi_stage,
            },
            {
              k: 'grain.exclude',
              t: 'refs',
              label: 'Grain: exclude (not with keep only)',
              scope: 'dims',
              show: (m) => !!m.multi_stage,
            },
            {
              k: 'grain.include',
              t: 'refs',
              label: 'Grain: include',
              scope: 'dims',
              show: (m) => !!m.multi_stage,
            },
            {
              k: 'filter.mode',
              t: 'enum',
              label: 'Filter mode',
              opts: ['', 'relative', 'fixed'],
              show: (m) => !!m.multi_stage,
            },
            {
              k: 'order_by',
              t: 'list',
              label: 'Order by (for rank)',
              item: 'order',
              show: (m) => m.type === 'rank',
              fields: [
                { k: 'sql', t: 'sql', label: 'SQL' },
                { k: 'dir', t: 'enum', label: 'Direction', opts: ['asc', 'desc'] },
              ],
            },
          ],
        },
        {
          g: 'Security and meta',
          collapsed: true,
          fields: [
            { k: 'mask', t: 'text', label: 'Mask value', hint: 'Not applied in ungrouped queries' },
            { k: 'meta', t: 'json', label: 'meta (YAML map)' },
          ],
        },
      ],
    },

    join: {
      title: (j) => j.name,
      sub: (j) => j.relationship,
      groups: [
        {
          g: 'Join',
          fields: [
            { k: 'name', t: 'ref', label: 'Target cube', scope: 'cubes', req: true },
            {
              k: 'relationship',
              t: 'enum',
              label: 'Relationship',
              req: true,
              opts: [
                'many_to_one',
                'one_to_many',
                'one_to_one',
                'belongs_to',
                'has_many',
                'has_one',
              ],
            },
            {
              k: 'sql',
              t: 'sql',
              label: 'ON condition',
              req: true,
              hint: 'Always LEFT JOIN from this cube; directed (a → b ≠ b → a)',
            },
          ],
        },
      ],
    },

    segment: {
      title: (s) => s.name,
      groups: [
        {
          g: 'Segment',
          fields: [
            { k: 'name', t: 'text', label: 'Name', req: true, mono: true },
            { k: 'sql', t: 'sql', label: 'WHERE predicate', req: true },
            { k: 'title', t: 'text', label: 'Title' },
            { k: 'description', t: 'text', label: 'Description' },
            { k: 'public', t: 'bool', label: 'Public', def: true },
          ],
        },
      ],
    },

    hierarchy: {
      title: (h) => h.name,
      groups: [
        {
          g: 'Hierarchy',
          fields: [
            { k: 'name', t: 'text', label: 'Name', req: true, mono: true },
            { k: 'title', t: 'text', label: 'Title' },
            {
              k: 'levels',
              t: 'refs',
              label: 'Levels (coarse → fine, click in order)',
              scope: 'dims',
              ordered: true,
            },
            { k: 'public', t: 'bool', label: 'Public', def: true },
          ],
        },
      ],
    },

    pre_aggregation: {
      title: (p) => p.name,
      sub: (p) => p.type || 'rollup',
      groups: [
        {
          g: 'Definition',
          fields: [
            { k: 'name', t: 'text', label: 'Name', req: true, mono: true },
            {
              k: 'type',
              t: 'enum',
              label: 'Type',
              opts: ['rollup', 'original_sql', 'rollup_join', 'rollup_lambda'],
              def: 'rollup',
            },
            {
              k: 'measures',
              t: 'refs',
              label: 'Measures',
              scope: 'measures',
              show: (p) => p.type !== 'original_sql',
            },
            {
              k: 'dimensions',
              t: 'refs',
              label: 'Dimensions',
              scope: 'dims',
              show: (p) => p.type !== 'original_sql',
            },
            {
              k: 'segments',
              t: 'refs',
              label: 'Segments',
              scope: 'segments',
              show: (p) => p.type !== 'original_sql',
            },
            {
              k: 'time_dimension',
              t: 'ref',
              label: 'Time dimension',
              scope: 'time',
              show: (p) => p.type !== 'rollup_lambda',
            },
            {
              k: 'granularity',
              t: 'enum',
              label: 'Granularity',
              opts: ['', ...GRAN],
              show: (p) => !!p.time_dimension && p.type !== 'original_sql',
              hint: 'Required with time dimension',
            },
            {
              k: 'rollups',
              t: 'refs',
              label: 'Rollups',
              scope: 'preaggs',
              show: (p) => ['rollup_join', 'rollup_lambda'].includes(p.type),
            },
            {
              k: 'union_with_source_data',
              t: 'bool',
              label: 'Union with source data',
              show: (p) => p.type === 'rollup_lambda',
            },
          ],
        },
        {
          g: 'Partitions and refresh',
          show: (p) => p.type !== 'rollup_lambda',
          fields: [
            {
              k: 'partition_granularity',
              t: 'enum',
              label: 'Partition granularity',
              opts: ['', 'hour', 'day', 'week', 'month', 'quarter', 'year'],
            },
            {
              k: 'refresh_key.every',
              t: 'text',
              label: 'Refresh every',
              ph: '1 hour',
              hint: INTERVAL_HINT,
            },
            { k: 'refresh_key.sql', t: 'sql', label: 'Refresh key SQL' },
            {
              k: 'refresh_key.incremental',
              t: 'bool',
              label: 'Incremental (refresh only recent partitions)',
            },
            {
              k: 'refresh_key.update_window',
              t: 'text',
              label: 'Update window',
              ph: '7 day',
              show: (p) => !!(p.refresh_key || {}).incremental,
            },
            {
              k: 'scheduled_refresh',
              t: 'bool',
              label: 'Scheduled refresh (refresh worker)',
              def: true,
              hint: 'Must be off for rollup_join',
            },
            { k: 'build_range_start.sql', t: 'sql', label: 'Build range start (SQL)' },
            { k: 'build_range_end.sql', t: 'sql', label: 'Build range end (SQL)' },
          ],
        },
        {
          g: 'Indexes and matching',
          show: (p) => p.type !== 'rollup_lambda',
          fields: [
            {
              k: 'indexes',
              t: 'list',
              label: 'Indexes',
              item: 'index',
              fields: [
                { k: 'name', t: 'text', label: 'Name', mono: true },
                { k: 'columns', t: 'refs', label: 'Columns', scope: 'dims' },
                { k: 'type', t: 'enum', label: 'Type', opts: ['', 'regular', 'aggregate'] },
              ],
            },
            {
              k: 'allow_non_strict_date_range_match',
              t: 'bool',
              label: 'Allow non-strict date range match',
              def: true,
            },
            {
              k: 'use_original_sql_pre_aggregations',
              t: 'bool',
              label: 'Use original_sql pre-aggregations',
            },
          ],
        },
      ],
    },

    access_policy: {
      title: (p, i) => `Policy ${i + 1}: ${p.group || (p.groups || []).join(', ') || '(no group)'}`,
      groups: [
        {
          g: 'Who',
          fields: [
            {
              k: 'group',
              t: 'text',
              label: 'Group',
              mono: true,
              ph: '* = any group',
              hint: 'Exactly one of group or groups. Phase 1 is single-user: groups come from the security context.',
            },
            { k: 'groups', t: 'text', list: true, label: 'Groups (comma-separated)' },
            {
              k: 'conditions',
              t: 'list',
              label: 'Conditions (all must be true)',
              item: 'condition',
              fields: [
                {
                  k: 'if',
                  t: 'text',
                  label: 'If',
                  mono: true,
                  ph: '{ securityContext.is_manager }',
                  hint: 'YAML supports and, or, not, ., .includes(…)',
                },
              ],
            },
          ],
        },
        {
          g: 'Member level',
          fields: [
            {
              k: 'member_level.includes',
              t: 'refs',
              label: 'Includes (none selected = "*")',
              scope: 'local',
              star: true,
            },
            { k: 'member_level.excludes', t: 'refs', label: 'Excludes', scope: 'local' },
            {
              k: 'member_masking.includes',
              t: 'refs',
              label: 'Masked members (requires member level)',
              scope: 'local',
            },
          ],
        },
        {
          g: 'Row level',
          fields: [
            { k: 'row_level.allow_all', t: 'bool', label: 'Allow all rows (not with filters)' },
            {
              ...filterList('Row filters (REST filter format)'),
              k: 'row_level.filters',
              show: (p) => !(p.row_level || {}).allow_all,
            },
          ],
        },
      ],
    },

    view: {
      groups: [
        {
          g: 'Basics',
          fields: [
            { k: 'name', t: 'text', label: 'Name', req: true, mono: true },
            { k: 'title', t: 'text', label: 'Title' },
            { k: 'description', t: 'text', label: 'Description', area: true },
            { k: 'public', t: 'bool', label: 'Public', def: true },
            { k: 'extends', t: 'text', label: 'Extends', mono: true },
          ],
        },
        {
          g: 'Default filters (enforced on every query)',
          fields: [
            {
              k: 'default_filters',
              t: 'list',
              label: 'Default filters',
              item: 'filter',
              fields: [
                { k: 'member', t: 'text', label: 'Member', mono: true },
                { k: 'operator', t: 'enum', label: 'Operator', opts: OPS },
                { k: 'values', t: 'text', list: true, label: 'Values' },
                { k: 'unless', t: 'text', label: 'Unless', mono: true },
              ],
            },
          ],
        },
        {
          g: 'Meta',
          collapsed: true,
          fields: [{ k: 'meta', t: 'json', label: 'meta (YAML map)' }],
        },
      ],
    },

    view_cube: {
      title: (c) => c.join_path,
      sub: (c) => (c.includes === '*' ? 'all members' : `${(c.includes || []).length} members`),
      groups: [
        {
          g: 'Join path',
          fields: [
            {
              k: 'join_path',
              t: 'text',
              label: 'Join path',
              mono: true,
              req: true,
              ph: 'base_orders.line_items.products',
            },
            {
              k: 'includes',
              t: 'refs',
              label: 'Includes (none selected = "*")',
              scope: 'pathcube',
              star: true,
            },
            { k: 'excludes', t: 'refs', label: 'Excludes', scope: 'pathcube' },
            { k: 'prefix', t: 'bool', label: 'Prefix members with cube name' },
            { k: 'alias', t: 'text', label: 'Alias (custom prefix)', mono: true },
          ],
        },
      ],
    },

    folder: {
      title: (f) => f.name,
      sub: (f) => `${(f.includes || []).length} items`,
      groups: [
        {
          g: 'Folder',
          fields: [
            { k: 'name', t: 'text', label: 'Name', req: true },
            {
              k: 'includes',
              t: 'text',
              list: true,
              label: 'Includes (view member names)',
              mono: true,
            },
          ],
        },
      ],
    },
  };

  /** Tabs per root kind: [key in YAML, label, item schema]. */
  const TABS = {
    cube: [
      ['__root', 'General', 'cube'],
      ['dimensions', 'Dimensions', 'dimension'],
      ['measures', 'Measures', 'measure'],
      ['joins', 'Joins', 'join'],
      ['segments', 'Segments', 'segment'],
      ['hierarchies', 'Hierarchies', 'hierarchy'],
      ['pre_aggregations', 'Pre-aggs', 'pre_aggregation'],
      ['access_policy', 'Access', 'access_policy'],
    ],
    view: [
      ['__root', 'General', 'view'],
      ['cubes', 'Cubes', 'view_cube'],
      ['folders', 'Folders', 'folder'],
      ['access_policy', 'Access', 'access_policy'],
    ],
  };
  const TEMPLATES = {
    dimension: (n) => ({ name: `new_dimension_${n}`, sql: 'column_name', type: 'string' }),
    measure: (n) => ({ name: `new_measure_${n}`, type: 'count' }),
    join: () => ({
      name: 'customers',
      relationship: 'many_to_one',
      sql: '{CUBE}.customer_id = {customers}.customer_id',
    }),
    segment: (n) => ({ name: `segment_${n}`, sql: "{CUBE}.status = 'active'" }),
    hierarchy: (n) => ({ name: `hierarchy_${n}`, levels: [] }),
    pre_aggregation: (n) => ({ name: `rollup_${n}`, type: 'rollup', measures: [], dimensions: [] }),
    access_policy: () => ({ group: 'new_group', member_level: { includes: '*' } }),
    view_cube: () => ({ join_path: 'orders', includes: '*' }),
    folder: () => ({ name: 'New folder', includes: [] }),
  };

  window.SCHEMA = { SCHEMA, TABS, TEMPLATES, shapeOf, OPS, GRAN };
})();
