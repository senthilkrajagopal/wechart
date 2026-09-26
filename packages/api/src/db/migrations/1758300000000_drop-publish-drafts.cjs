/**
 * Publish drafts, gone (T431, AC-327): xcube's dry run checks a publish
 * (T445), so Cube reads no draft back from wechart, and nothing writes one.
 * `down` makes the table again as `…_publish-drafts.cjs` made it.
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.dropTable('publish_drafts', { ifExists: true });
};

exports.down = (pgm) => {
  pgm.createTable('publish_drafts', {
    id: { type: 'text', primaryKey: true },
    files: { type: 'jsonb', notNull: true },
    read: { type: 'boolean', notNull: true, default: false },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
};
