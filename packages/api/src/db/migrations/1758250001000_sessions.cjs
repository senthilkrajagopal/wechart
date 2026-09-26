/**
 * Signed-in sessions (T316, AC-252, AC-253; research/openid-client.md, "Server-
 * side store"). The browser holds only a signed session id; the user, their
 * groups (hundreds, for some) and the ID token stay here. Deleting a row ends
 * that session everywhere at once, which is what sign-out needs (AC-253).
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable('sessions', {
    id: { type: 'text', primaryKey: true },
    session: { type: 'jsonb', notNull: true },
    expires_at: { type: 'timestamptz' },
  });
  // Expired rows are removed by a periodic sweep: Postgres has no TTL.
  pgm.createIndex('sessions', 'expires_at');
};

exports.down = (pgm) => {
  pgm.dropTable('sessions');
};
