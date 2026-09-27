/**
 * Data sources as folder items, with their secrets sealed in the browser to
 * xcube's public key (T335; AC-298, AC-325; research credential-sealing.md,
 * xcube-slice-6.md).
 *
 * T332's table held one AES-GCM envelope per data source, under a key wechart
 * held. That design was superseded before any product flow wrote to it
 * (AD 7, R27): wechart holds no key, and each secret field arrives as an HPKE
 * envelope `{ v: 1, kid, enc, ct }` it keeps and never opens. So the table is
 * replaced, one envelope per secret field, each with the revision xcube is
 * told it by (`revisions` in `PUT …/connections/{name}`).
 *
 * A data source also records how it signs in, and its name is unique in its
 * folder (AC-270): its full name in xcube is made from the two.
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.addColumn('data_sources', {
    auth_method: { type: 'text', notNull: true, default: '' },
  });
  pgm.addConstraint('data_sources', 'data_sources_folder_name_key', {
    unique: ['folder_id', 'name'],
  });

  pgm.dropTable('data_source_secrets');
  pgm.createTable(
    'data_source_secrets',
    {
      data_source_id: {
        type: 'text',
        notNull: true,
        references: 'data_sources',
        onDelete: 'CASCADE',
      },
      /** The secret field it seals: `password`, `sslKey`, … */
      field: { type: 'text', notNull: true },
      /** `{ v: 1, kid, enc, ct }`, exactly as the browser sealed it. */
      envelope: { type: 'jsonb', notNull: true, check: "envelope->>'v' = '1'" },
      /** Changes whenever the envelope does. */
      revision: { type: 'text', notNull: true },
      updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    },
    { constraints: { primaryKey: ['data_source_id', 'field'] } },
  );
};

exports.down = (pgm) => {
  pgm.dropTable('data_source_secrets');
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
  pgm.createIndex('data_source_secrets', 'key_id');
  pgm.dropConstraint('data_sources', 'data_sources_folder_name_key');
  pgm.dropColumn('data_sources', 'auth_method');
};
