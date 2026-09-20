/**
 * The query log behind AC-016: every query wechart issues, with the Cube
 * request, how long it took and whether it was accelerated.
 *
 * Append-heavy and read by recency, so the only index is on `created_at`
 * descending (docs/research/db-access.md, "Append-heavy query/job/connection
 * -test logs"). It is a separate table from `documents` because it is a log,
 * not a versioned object: nothing here is ever updated.
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable('query_log', {
    id: { type: 'bigserial', primaryKey: true },
    request_id: { type: 'text', notNull: true },
    query: { type: 'jsonb', notNull: true },
    duration_ms: { type: 'integer', notNull: true },
    accelerated: { type: 'boolean', notNull: true },
    pre_aggregation: { type: 'text' },
    error: { type: 'text' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createIndex('query_log', [{ name: 'created_at', sort: 'DESC' }]);
};

exports.down = (pgm) => {
  pgm.dropTable('query_log');
};
