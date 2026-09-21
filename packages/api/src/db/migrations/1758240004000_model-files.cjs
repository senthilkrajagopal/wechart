/**
 * The Cube model's files (T137, AC-131), kept in wechart's metadata database:
 * the store the user chose for the model, which Cube will read through
 * `repositoryFactory` once publishing lands (T143;
 * docs/research/cube/spike-model-store-and-quick-calcs.md).
 *
 * One row a file, by its path relative to the model directory, as Cube's own
 * `FileRepository` names it (`cubes/orders.yml`).
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable('model_files', {
    path: { type: 'text', primaryKey: true },
    content: { type: 'text', notNull: true },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
};

exports.down = (pgm) => {
  pgm.dropTable('model_files');
};
