/**
 * The versioned document store behind AC-014 and AC-015.
 *
 * `version` starts at 1 and every accepted save increments it; a save carrying
 * a stale version matches no row and is refused (AC-015). `body` is jsonb, so
 * what comes back after a restart is what went in (AC-014).
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable(
    'documents',
    {
      kind: { type: 'text', notNull: true },
      id: { type: 'text', notNull: true },
      body: { type: 'jsonb', notNull: true },
      version: { type: 'integer', notNull: true, default: 1 },
      created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
      updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    },
    { ifNotExists: true },
  );

  // Composite key: an id is unique within its kind, so a dashboard and a chart
  // may share one without colliding.
  pgm.addConstraint('documents', 'documents_pkey', { primaryKey: ['kind', 'id'] });
  pgm.addConstraint('documents', 'documents_version_positive', {
    check: 'version >= 1',
  });
};

exports.down = (pgm) => {
  pgm.dropTable('documents');
};
