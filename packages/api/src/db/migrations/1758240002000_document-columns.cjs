/**
 * Columns T003 deferred until an AC needed them: the folder tree and contents
 * listing (AC-017) and title search (AC-019).
 *
 * They are GENERATED ALWAYS ... STORED from `body` rather than written
 * alongside it. A document's title lives in exactly one place, so the column
 * and the body cannot drift apart, and a write path that forgets to update the
 * copy is not a failure mode that exists. `body ->> 'x'` is immutable, which is
 * what a stored generated column requires.
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE documents
      ADD COLUMN title text GENERATED ALWAYS AS (body ->> 'title') STORED,
      ADD COLUMN folder_id text GENERATED ALWAYS AS (body ->> 'folderId') STORED,
      ADD COLUMN owner text GENERATED ALWAYS AS (body ->> 'owner') STORED,
      ADD COLUMN local_to_dashboard_id text
        GENERATED ALWAYS AS (body ->> 'localToDashboardId') STORED
  `);

  // Listing a folder's contents (AC-017).
  pgm.createIndex('documents', ['kind', 'folder_id']);
  // Case-insensitive title search (AC-019).
  pgm.sql(`CREATE INDEX documents_title_lower_idx ON documents (lower(title))`);
};

exports.down = (pgm) => {
  pgm.sql(`DROP INDEX IF EXISTS documents_title_lower_idx`);
  pgm.dropIndex('documents', ['kind', 'folder_id']);
  pgm.sql(`
    ALTER TABLE documents
      DROP COLUMN title,
      DROP COLUMN folder_id,
      DROP COLUMN owner,
      DROP COLUMN local_to_dashboard_id
  `);
};
