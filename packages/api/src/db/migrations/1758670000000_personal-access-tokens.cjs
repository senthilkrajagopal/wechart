/**
 * Personal access tokens (T767, AC-430, AC-431, AC-468, AC-470; R78): each
 * user's tokens for wechart's MCP server. A token's text is never stored:
 * only its SHA-256 (`mcp-deployment-and-tokens.md` §4), found by an index.
 * Its owner's name is kept for Security › Access tokens (AC-470); its
 * revocation, when and by whom, for "No longer working" (AC-431).
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable('personal_access_tokens', {
    id: { type: 'uuid', primaryKey: true },
    owner_key: { type: 'text', notNull: true },
    owner_name: { type: 'text', notNull: true },
    name: { type: 'text', notNull: true },
    scopes: { type: 'text[]', notNull: true },
    digest: { type: 'bytea', notNull: true, unique: true },
    created_at: { type: 'timestamptz(3)', notNull: true, default: pgm.func('now()') },
    expires_at: { type: 'timestamptz(3)', notNull: true },
    last_used_at: { type: 'timestamptz(3)' },
    revoked_at: { type: 'timestamptz(3)' },
    revoked_by_key: { type: 'text' },
    revoked_by_name: { type: 'text' },
  });
  pgm.createIndex('personal_access_tokens', ['owner_key', { name: 'created_at', sort: 'DESC' }]);
};

exports.down = (pgm) => {
  pgm.dropTable('personal_access_tokens');
};
