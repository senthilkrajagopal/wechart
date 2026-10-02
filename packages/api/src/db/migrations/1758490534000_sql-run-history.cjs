/**
 * A user's SQL runs kept as their history (T534, AC-381; R50-12): the SQL as
 * they wrote it, which only they see, the data source's name at the time,
 * and how the run ended. Kept as long as audit records are (AC-296), and
 * listed newest first per user. The audit trail's record keeps the SQL with
 * its literals replaced, not this (AC-382).
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.addColumns('sql_runs', {
    sql: { type: 'text', notNull: true, default: '' },
    data_source_name: { type: 'text' },
    row_count: { type: 'integer' },
    duration_ms: { type: 'integer' },
    truncated: { type: 'text' },
    statement: { type: 'text' },
  });
  // Newest first is this index read backwards.
  pgm.createIndex('sql_runs', ['user_key', 'started_at', 'id'], { name: 'sql_runs_by_user' });
};

exports.down = (pgm) => {
  pgm.dropIndex('sql_runs', [], { name: 'sql_runs_by_user' });
  pgm.dropColumns('sql_runs', [
    'sql',
    'data_source_name',
    'row_count',
    'duration_ms',
    'truncated',
    'statement',
  ]);
};
