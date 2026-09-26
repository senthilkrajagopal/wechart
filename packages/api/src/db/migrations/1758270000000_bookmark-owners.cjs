/**
 * Each bookmark its saver's own (T366, AC-292): a bookmark names its owner in
 * `body.owner`, which the generated `owner` column reads. Those saved before
 * had none. Phase 1 had one user, whose key is `admin` (auth/user.ts), so each
 * of them is given to that user.
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
    UPDATE documents
       SET body = jsonb_set(body, '{owner}', '"admin"')
     WHERE kind = 'bookmark' AND body ->> 'owner' IS NULL
  `);
};

// Down leaves the owners in place: the code before this one never reads them.
exports.down = () => {};
