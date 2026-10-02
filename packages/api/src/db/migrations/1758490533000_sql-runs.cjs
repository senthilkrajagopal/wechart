/**
 * A user's SQL runs (T533, AC-379; R50-9): each run a row from its start,
 * and at most one going per user, whichever API instance runs it. The index
 * takes one row unfinished per user, so a second start for the same user
 * is refused by the database itself, two at once included.
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable('sql_runs', {
    // The run's id, as xcube knows it: its cancel's key.
    id: { type: 'text', primaryKey: true },
    user_key: { type: 'text', notNull: true },
    // The data source it ran on; none for Cube Store (T536).
    data_source_id: { type: 'text' },
    started_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    finished_at: { type: 'timestamptz' },
    outcome: { type: 'text' },
  });
  pgm.createIndex('sql_runs', 'user_key', {
    name: 'sql_runs_one_going',
    unique: true,
    where: 'finished_at IS NULL',
  });
};

exports.down = (pgm) => {
  pgm.dropTable('sql_runs');
};
