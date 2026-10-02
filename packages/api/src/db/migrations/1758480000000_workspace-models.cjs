/**
 * Models in a workspace (T347; AC-281, AC-282) and in proposals (T350).
 *
 * Every model file gets an id, which a proposal names it by, and a version,
 * raised by each write over it: what a proposal replaces is "version n" of
 * the file (design 05). A file in a workspace also says where it is to go —
 * its target, a shared folder its author may write — and a copy what it was
 * copied from (`origin`: `{ id, folderId, path, version }`), as the
 * workspace's dashboards and data sources do. Its overlay places it in its
 * target (a copy's is its origin's folder), so previews resolve its names
 * along that folder's path (AC-281). A shared folder's own have neither.
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.addColumns('model_files', {
    id: { type: 'uuid', notNull: true, default: pgm.func('gen_random_uuid()') },
    version: { type: 'integer', notNull: true, default: 1 },
    target_folder_id: { type: 'text' },
    origin: { type: 'jsonb' },
  });
  pgm.addConstraint('model_files', 'model_files_id_key', { unique: ['id'] });
};

exports.down = (pgm) => {
  pgm.dropConstraint('model_files', 'model_files_id_key');
  pgm.dropColumns('model_files', ['id', 'version', 'target_folder_id', 'origin']);
};
