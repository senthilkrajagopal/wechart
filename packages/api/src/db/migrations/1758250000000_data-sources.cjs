/**
 * Data sources as folder items (phase 2, F18/F27), and their credentials,
 * encrypted (T332, AC-298; research/credential-encryption.md § Storage).
 *
 * The secrets live in a table of their own, so a query over `data_sources`
 * can never carry them. One envelope per data source: the key's id, a 12-byte
 * IV, the ciphertext and a 16-byte tag, as `bytea`. The AAD that binds an
 * envelope to its data source is derived from the row's id when it is opened,
 * never stored here.
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable('data_sources', {
    id: { type: 'text', primaryKey: true },
    folder_id: { type: 'text', notNull: true },
    name: { type: 'text', notNull: true },
    type: { type: 'text', notNull: true },
    /** Connection settings without secrets: host, port, database, user, and so on. */
    settings: { type: 'jsonb', notNull: true, default: pgm.func("'{}'::jsonb") },
    version: { type: 'integer', notNull: true, default: 1 },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('data_sources', 'folder_id');

  pgm.createTable('data_source_secrets', {
    data_source_id: {
      type: 'text',
      primaryKey: true,
      references: 'data_sources',
      onDelete: 'CASCADE',
    },
    scheme: { type: 'smallint', notNull: true, check: 'scheme = 1' },
    key_id: { type: 'text', notNull: true },
    iv: { type: 'bytea', notNull: true, check: 'octet_length(iv) = 12' },
    ciphertext: { type: 'bytea', notNull: true },
    tag: { type: 'bytea', notNull: true, check: 'octet_length(tag) = 16' },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  // Rotation finds the rows still under an old key.
  pgm.createIndex('data_source_secrets', 'key_id');
};

exports.down = (pgm) => {
  pgm.dropTable('data_source_secrets');
  pgm.dropTable('data_sources');
};
