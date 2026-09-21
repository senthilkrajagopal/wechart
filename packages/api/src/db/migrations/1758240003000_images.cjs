/**
 * Image tiles' images (AC-063): "stored with the dashboard" (direction.md §2),
 * so each row names the dashboard it was added to. Kept here rather than
 * inside the dashboard document: at up to 2 MB each, inlined they would travel
 * with every read and every saved version of the dashboard.
 *
 * Written once and never updated; a tile given another image points at a new
 * row.
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable('images', {
    id: { type: 'text', primaryKey: true },
    dashboard_id: { type: 'text', notNull: true },
    content_type: { type: 'text', notNull: true },
    bytes: { type: 'bytea', notNull: true },
    size: { type: 'integer', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createIndex('images', 'dashboard_id');
};

exports.down = (pgm) => {
  pgm.dropTable('images');
};
