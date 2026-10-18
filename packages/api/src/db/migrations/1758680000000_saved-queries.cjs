/**
 * Saved queries (T812, AC-457, AC-483; R78): each user's own SQL runner
 * queries, never shared. One keeps its name, its description, its SQL, the
 * data source it runs on (a data source's id, or Cube Store's), and each
 * parameter's name, type and last value. A name is its owner's once: no two
 * of one owner's saved queries share it.
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable('saved_queries', {
    id: { type: 'uuid', primaryKey: true },
    owner_key: { type: 'text', notNull: true },
    name: { type: 'text', notNull: true },
    description: { type: 'text', notNull: true, default: '' },
    source_id: { type: 'text', notNull: true },
    sql: { type: 'text', notNull: true },
    parameters: { type: 'jsonb', notNull: true, default: pgm.func("'[]'::jsonb") },
    created_at: { type: 'timestamptz(3)', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz(3)', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('saved_queries', 'saved_queries_owner_name', { unique: ['owner_key', 'name'] });
};

exports.down = (pgm) => {
  pgm.dropTable('saved_queries');
};
