/**
 * Calculation requests (T383, AC-050; F6): a calculation the quick
 * calculations menu can't express, asked of the read-write members of the
 * folder whose model defines the chart's cube. Each carries the chart it came
 * from, the fields the chart had in use, and the requester's description, and
 * names that folder and the model file defining the cube, by its path there.
 * Listed by folder, newest first.
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable('calc_requests', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    chart_id: { type: 'text', notNull: true },
    // The chart's cube or view, by its full published name.
    cube: { type: 'text', notNull: true },
    folder_id: { type: 'text', notNull: true },
    model_path: { type: 'text', notNull: true },
    // `{ measures, dimensions, timeDimensions, filters }`, as the chart had them.
    fields: { type: 'jsonb', notNull: true },
    description: { type: 'text', notNull: true },
    requested_by_key: { type: 'text', notNull: true },
    requested_by_name: { type: 'text', notNull: true },
    requested_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    status: { type: 'text', notNull: true, default: 'open' },
  });
  pgm.addConstraint('calc_requests', 'calc_requests_status', {
    check: "status IN ('open', 'resolved')",
  });
  pgm.createIndex('calc_requests', ['folder_id', 'requested_at'], {
    name: 'calc_requests_by_folder',
  });
};

exports.down = (pgm) => {
  pgm.dropTable('calc_requests');
};
