/**
 * Each version of a shared item wechart lands, a copy wechart holds (T352,
 * AC-288; T354, AC-289): its content as it was — a dashboard with its own
 * charts, a data source's settings with its credentials still sealed
 * (AC-298) — who proposed it, who approved it, when, and the description.
 * A version from before proposals, replaced by the first approval, is kept
 * too, with neither.
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable('item_versions', {
    kind: { type: 'text', notNull: true },
    item_id: { type: 'text', notNull: true },
    version: { type: 'integer', notNull: true },
    // The item as it was: `{ body, parts }`, parts being a dashboard's own charts.
    content: { type: 'jsonb', notNull: true },
    folder_id: { type: 'text', notNull: true },
    title: { type: 'text', notNull: true },
    author_key: { type: 'text' },
    author_name: { type: 'text' },
    approver_key: { type: 'text' },
    approver_name: { type: 'text' },
    at: { type: 'timestamptz(3)', notNull: true, default: pgm.func('now()') },
    description: { type: 'text' },
    proposal_id: { type: 'uuid' },
  });
  pgm.addConstraint('item_versions', 'item_versions_pkey', {
    primaryKey: ['kind', 'item_id', 'version'],
  });
};

exports.down = (pgm) => {
  pgm.dropTable('item_versions');
};
