/**
 * Each folder's id in xcube (T425, AC-328; R30): `f` and 1–40 lower-case
 * letters and digits, the shared root `froot` (docs/research/xcube-slice-3a.md,
 * "Names"). It names every item published in the folder, so it is stored,
 * unique, and never reused: a row outlives its folder, and nothing else is
 * ever given its id. A rename or a move changes no row.
 *
 * Filled here for the root and every folder there is: a folder named by a
 * UUID takes `f` and its hex digits, any other (a seed's) a random one of the
 * same form. Folders made later are given theirs as the tree is built
 * (`repos/folder-xcube-ids.ts`).
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable('folder_xcube_ids', {
    folder_id: { type: 'text', primaryKey: true },
    xcube_id: {
      type: 'text',
      notNull: true,
      unique: true,
      check: "xcube_id ~ '^f[a-z0-9]{1,40}$'",
    },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.sql(`
    INSERT INTO folder_xcube_ids (folder_id, xcube_id) VALUES ('root', 'froot');
    INSERT INTO folder_xcube_ids (folder_id, xcube_id)
      SELECT id,
             CASE WHEN id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                  THEN 'f' || lower(replace(id, '-', ''))
                  ELSE 'f' || replace(gen_random_uuid()::text, '-', '')
             END
        FROM documents
       WHERE kind = 'folder'
      ON CONFLICT DO NOTHING;
  `);
};

exports.down = (pgm) => {
  pgm.dropTable('folder_xcube_ids');
};
