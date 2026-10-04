/**
 * A Cube Store run stopped but run on (T548, AC-378, AC-379; R62): Cube Store
 * can't stop a query, so a run stopped at its cap, or cancelled, runs on in it
 * until its own timeout at the latest (xcube 2099b13f2d, research
 * xcube-2099b13f2d.md). `ends_by` keeps when, so its user's next run waits
 * until xcube says it has ended. Null for every other run, whose stop is real.
 */

exports.shorthands = undefined;

// IF NOT EXISTS, IF EXISTS: one database the work of several branches is
// tested on may hold the column without this migration's record.
exports.up = (pgm) => {
  pgm.addColumns('sql_runs', { ends_by: { type: 'timestamptz' } }, { ifNotExists: true });
};

exports.down = (pgm) => {
  pgm.dropColumns('sql_runs', ['ends_by'], { ifExists: true });
};
