/**
 * Which stored settings a connection test tested (T364's review, AC-157): the
 * data source's settings print — its sign-in method, its fields and each
 * secret's revision — when the test was of the settings as stored, and none
 * for a trial of changes not saved. A save that changes them leaves the test
 * in the history but no longer the source's health. Tests recorded before
 * this have none, and so are no source's health.
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.addColumn('connection_tests', { settings: { type: 'text' } });
};

exports.down = (pgm) => {
  pgm.dropColumn('connection_tests', 'settings');
};
