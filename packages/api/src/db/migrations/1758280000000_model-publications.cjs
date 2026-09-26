/**
 * What xcube last acknowledged of each model (T419, AC-333): wechart pushes
 * its whole published file set to xcube, and records the generation of
 * xcube's store, the revision it made, and the content's hash
 * (`docs/research/xcube-slice-2.md`). One row a model id.
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable('model_publications', {
    model_id: { type: 'text', primaryKey: true },
    xcube_generation: { type: 'text', notNull: true },
    xcube_revision: { type: 'integer', notNull: true },
    content_hash: { type: 'text', notNull: true },
    synced_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
};

exports.down = (pgm) => {
  pgm.dropTable('model_publications');
};
