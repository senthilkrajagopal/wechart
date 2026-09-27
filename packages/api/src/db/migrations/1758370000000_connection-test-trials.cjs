/**
 * A connection test of a data source not yet made (T363, AC-158): the wizard's
 * Test step. It belongs to no data source until one is made from exactly the
 * settings it tested, `shape` being their print (the driver, the sign-in
 * method, the fields and the sealed envelopes). A create names the test that
 * passed, or says it is made anyway; the test then heads the new source's
 * history (AC-163). Like every test it holds no secret: an envelope's print
 * opens nothing.
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.alterColumn('connection_tests', 'data_source_id', { notNull: false });
  pgm.addColumn('connection_tests', { shape: { type: 'text' } });
};

exports.down = (pgm) => {
  pgm.sql('DELETE FROM connection_tests WHERE data_source_id IS NULL');
  pgm.dropColumn('connection_tests', 'shape');
  pgm.alterColumn('connection_tests', 'data_source_id', { notNull: true });
};
