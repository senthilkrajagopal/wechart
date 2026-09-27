/**
 * The folder a data source made in a workspace is to go to (T345, AC-282):
 * one of the shared folders where its author has read-write access, which a
 * proposal lands it in (T349). None for one in a shared folder.
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.addColumn('data_sources', { target_folder_id: { type: 'text' } });
};

exports.down = (pgm) => {
  pgm.dropColumn('data_sources', 'target_folder_id');
};
