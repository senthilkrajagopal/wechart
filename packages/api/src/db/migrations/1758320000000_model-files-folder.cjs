/**
 * Models are folder items (T334, AC-269): each model file sits in a folder,
 * the shared root's (`root`) for every file there is now. The same path in
 * two folders is two files, so the key becomes the folder and the path.
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.addColumn('model_files', {
    folder_id: { type: 'text', notNull: true, default: 'root' },
  });
  pgm.dropConstraint('model_files', 'model_files_pkey');
  pgm.addConstraint('model_files', 'model_files_pkey', { primaryKey: ['folder_id', 'path'] });
};

exports.down = (pgm) => {
  // Only the root's files had a path to themselves.
  pgm.sql(`DELETE FROM model_files WHERE folder_id <> 'root'`);
  pgm.dropConstraint('model_files', 'model_files_pkey');
  pgm.addConstraint('model_files', 'model_files_pkey', { primaryKey: ['path'] });
  pgm.dropColumn('model_files', 'folder_id');
};
