/**
 * Each connection test of a stored data source, as xcube ran it (T362,
 * AC-163): when, by whom, the non-secret fields it connected with, whether
 * those were the stored settings or changes not yet saved, and each check
 * with its result and, where one failed, its error as xcube redacted it. No
 * secret is held: xcube takes each out of its errors, and a test's fields are
 * the data source's non-secret ones. Every test is kept (AC-163).
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable('connection_tests', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    /** The order tests were recorded in: two in one instant keep it. */
    seq: { type: 'bigserial', notNull: true },
    data_source_id: {
      type: 'text',
      notNull: true,
      references: 'data_sources',
      onDelete: 'CASCADE',
    },
    ran_at: { type: 'timestamptz', notNull: true, default: pgm.func('clock_timestamp()') },
    ok: { type: 'boolean', notNull: true },
    /** Of the settings as stored, or of the form's changes not yet saved. */
    as_stored: { type: 'boolean', notNull: true },
    /** `[{ id, status, durationMs, error? }]`, in the order xcube ran them. */
    checks: { type: 'jsonb', notNull: true },
    fields: { type: 'jsonb', notNull: true },
    /** Who ran it, `{ key, name }`, as wechart knew them then; none from a Job. */
    ran_by: { type: 'jsonb' },
  });
  pgm.createIndex('connection_tests', ['data_source_id', { name: 'seq', sort: 'DESC' }]);
};

exports.down = (pgm) => {
  pgm.dropTable('connection_tests');
};
