/**
 * Publish drafts (T418, AC-319): the whole model with a publish's changes in
 * it, held while Cube compiles it and reads it back through the API. In the
 * database rather than one process's memory, so whichever API replica Cube's
 * read-back reaches has it (research/cube/ha-topology.md, table row 1). Each
 * row lives only as long as its publish; slice 3 removes the read-back (T431).
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable('publish_drafts', {
    // Text, not uuid: the id arrives in a URL, and a malformed one is a draft that isn't there.
    id: { type: 'text', primaryKey: true },
    files: { type: 'jsonb', notNull: true },
    // Set once Cube has read it: an answer given without reading it was of another model.
    read: { type: 'boolean', notNull: true, default: false },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
};

exports.down = (pgm) => {
  pgm.dropTable('publish_drafts');
};
