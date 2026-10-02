/**
 * The SQL runner's switch (T531, AC-374; R50): on for a data source, or for
 * Cube Store, once a Super-Admin confirms its credential is read-only, with
 * who confirmed it and when. A row is the switch on; none, off — as every
 * target starts. Kept by target, apart from the data source's own row, so a
 * copy landing over it neither carries nor drops it.
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable('sql_runner_switches', {
    // A data source's id, or `cubestore`.
    target: { type: 'text', primaryKey: true },
    confirmed_by_key: { type: 'text', notNull: true },
    confirmed_by_name: { type: 'text', notNull: true },
    confirmed_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
};

exports.down = (pgm) => {
  pgm.dropTable('sql_runner_switches');
};
