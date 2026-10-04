/**
 * Who took a calculation request up (T384, AC-051): each read-write member
 * who opened it into their workspace, once. Approving their proposal of the
 * measure resolves it (T385, AC-052). Gone with its request.
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable('calc_request_takers', {
    request_id: {
      type: 'uuid',
      notNull: true,
      references: 'calc_requests',
      onDelete: 'CASCADE',
    },
    user_key: { type: 'text', notNull: true },
    user_name: { type: 'text', notNull: true },
    taken_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('calc_request_takers', 'calc_request_takers_pkey', {
    primaryKey: ['request_id', 'user_key'],
  });
};

exports.down = (pgm) => {
  pgm.dropTable('calc_request_takers');
};
