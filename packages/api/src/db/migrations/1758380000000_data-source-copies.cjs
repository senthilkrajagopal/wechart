/**
 * A data source copied into a workspace (T346, AC-280): it keeps its
 * original's name, and targets its original's folder, which it stands in for
 * in the workspace's previews (T347). So a workspace holds one data source of
 * a name per target: `warehouse` copied from /Sales and from /Ops lives side
 * by side. A shared folder's have no target, and stay one of a name.
 *
 * `origin` names what a copy was copied from: `{ id, version, folderId }`.
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.addColumn('data_sources', { origin: { type: 'jsonb' } });
  pgm.dropConstraint('data_sources', 'data_sources_folder_name_key');
  pgm.createIndex('data_sources', ['folder_id', "(coalesce(target_folder_id, ''))", 'name'], {
    name: 'data_sources_folder_target_name_key',
    unique: true,
  });
};

exports.down = (pgm) => {
  pgm.dropIndex('data_sources', [], { name: 'data_sources_folder_target_name_key' });
  // One of a name per folder again: the copies go, and of the workspace's own
  // of one name, the first made stays (T346's review).
  pgm.sql('DELETE FROM data_sources WHERE origin IS NOT NULL');
  pgm.sql(`
    DELETE FROM data_sources d
    USING data_sources kept
    WHERE d.folder_id = kept.folder_id AND d.name = kept.name
      AND (d.created_at, d.id) > (kept.created_at, kept.id)
  `);
  pgm.addConstraint('data_sources', 'data_sources_folder_name_key', {
    unique: ['folder_id', 'name'],
  });
  pgm.dropColumn('data_sources', 'origin');
};
