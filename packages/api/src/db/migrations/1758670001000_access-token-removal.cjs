/**
 * Remove (T768, AC-431; design 18's Q1): a token that no longer works,
 * taken off its owner's "No longer working". The row stays, unusable as
 * before, and so does every audit record of it.
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.addColumn('personal_access_tokens', {
    removed_at: { type: 'timestamptz(3)' },
  });
};

exports.down = (pgm) => {
  pgm.dropColumn('personal_access_tokens', 'removed_at');
};
