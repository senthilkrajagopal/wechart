/**
 * What a data source is for, in its own words (T499; 2026-09-27 design 03,
 * state B): General's Description. It is wechart's alone, no part of the
 * connection, so it changes without a test; none is null.
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.addColumn('data_sources', { description: { type: 'text' } });
};

exports.down = (pgm) => {
  pgm.dropColumn('data_sources', 'description');
};
