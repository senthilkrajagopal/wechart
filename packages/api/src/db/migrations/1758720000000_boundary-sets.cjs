/**
 * Custom boundary sets (T979, AC-628; R81-1, "Folder item via proposal"): a
 * Map's GeoJSON regions, keyed by the property named at upload. A read-write
 * member uploads one into their My workspace, naming the shared folder it is
 * to go to (`target_folder_id`); it lands there through a proposal, a new
 * row in that folder (or over the one of its name), and the workspace's is
 * then a copy of it (`origin`: `{ id, folderId, version }`), as a workspace's
 * data sources are. Charts find a set along their folder's path, as models.
 *
 * Kept apart from the model files: they are Cube's, and pushed to xcube.
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable('boundary_sets', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    folder_id: { type: 'text', notNull: true },
    name: { type: 'text', notNull: true },
    key_property: { type: 'text', notNull: true },
    geojson: { type: 'jsonb', notNull: true },
    regions: { type: 'integer', notNull: true },
    version: { type: 'integer', notNull: true, default: 1 },
    target_folder_id: { type: 'text' },
    origin: { type: 'jsonb' },
    created_by: { type: 'text', notNull: true },
    created_at: { type: 'timestamptz(3)', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz(3)', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('boundary_sets', 'boundary_sets_folder_name', {
    unique: ['folder_id', 'name'],
  });
};

exports.down = (pgm) => {
  pgm.dropTable('boundary_sets');
};
