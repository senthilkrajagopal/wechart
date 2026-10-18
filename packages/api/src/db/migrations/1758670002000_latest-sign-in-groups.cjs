/**
 * Each user's latest web sign-in (T777, AC-471): the groups the provider
 * sent then, and when. A personal access token acts on `/mcp` with these
 * groups, so a change of groups takes effect from the owner's next sign-in.
 * One row per user, replaced by each later sign-in.
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable('latest_sign_ins', {
    user_key: { type: 'text', primaryKey: true },
    groups: { type: 'text[]', notNull: true },
    signed_in_at: { type: 'timestamptz(3)', notNull: true },
  });
};

exports.down = (pgm) => {
  pgm.dropTable('latest_sign_ins');
};
