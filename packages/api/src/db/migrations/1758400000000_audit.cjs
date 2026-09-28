/**
 * The audit trail (T368, AC-294): every sign-in, permission change,
 * proposal, approval, rejection, restore and data-source change, each with
 * who, what, which folder and when. Records are only ever added, and removed
 * by the retention period alone (AC-296). None holds a credential: a secret
 * is said "replaced", never given (AC-298, rule 83).
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable('audit_records', {
    id: { type: 'uuid', primaryKey: true },
    // To the millisecond, as a JavaScript date holds it: a page's cursor is
    // one, and a finer time would never equal it (T368's review).
    at: { type: 'timestamptz(3)', notNull: true, default: pgm.func('now()') },
    actor_key: { type: 'text' },
    actor_name: { type: 'text' },
    actor_identity: { type: 'text' },
    event: { type: 'text', notNull: true },
    folder_id: { type: 'text' },
    item_kind: { type: 'text' },
    item_id: { type: 'text' },
    item_title: { type: 'text' },
    summary: { type: 'text', notNull: true },
    details: { type: 'jsonb' },
  });
  // Newest first, filtered: by time, then by who, what and where.
  pgm.createIndex('audit_records', [
    { name: 'at', sort: 'DESC' },
    { name: 'id', sort: 'DESC' },
  ]);
  pgm.createIndex('audit_records', ['actor_key']);
  pgm.createIndex('audit_records', ['folder_id']);
};

exports.down = (pgm) => {
  pgm.dropTable('audit_records');
};
