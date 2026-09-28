/**
 * Proposals (T349, AC-284): a workspace item offered to its target folder,
 * with an optional description of at most 1,000 characters. Each holds the
 * items it would land, as they were when proposed — the item first, then
 * what goes with it, such as a dashboard's charts — each naming the item it
 * would replace, and that item's version then. Nothing reaches the folder
 * until an approval (AC-286, AC-288): until then it serves what it had.
 *
 * An item waits in at most one open proposal, as its item or going with
 * another's. A decision (T351, T353) names
 * who made it, when, and a reason of at most 1,000 characters.
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable('proposals', {
    id: { type: 'uuid', primaryKey: true },
    kind: { type: 'text', notNull: true },
    item_id: { type: 'text', notNull: true },
    title: { type: 'text', notNull: true },
    target_folder_id: { type: 'text', notNull: true },
    author_key: { type: 'text', notNull: true },
    author_name: { type: 'text', notNull: true },
    description: { type: 'text' },
    proposed_at: { type: 'timestamptz(3)', notNull: true, default: pgm.func('now()') },
    status: { type: 'text', notNull: true, default: 'open' },
    decided_by_key: { type: 'text' },
    decided_by_name: { type: 'text' },
    decided_at: { type: 'timestamptz(3)' },
    reason: { type: 'text' },
  });
  pgm.addConstraint('proposals', 'proposals_status', {
    check: "status IN ('open', 'approved', 'rejected', 'withdrawn')",
  });
  // Characters as people count them, as the dialog's counter does.
  pgm.addConstraint('proposals', 'proposals_description_length', {
    check: 'description IS NULL OR char_length(description) <= 1000',
  });
  pgm.addConstraint('proposals', 'proposals_reason_length', {
    check: 'reason IS NULL OR char_length(reason) <= 1000',
  });
  pgm.createIndex('proposals', ['kind', 'item_id'], {
    unique: true,
    where: "status = 'open'",
    name: 'proposals_one_open_per_item',
  });
  pgm.createIndex('proposals', ['target_folder_id'], { where: "status = 'open'" });
  pgm.createIndex('proposals', ['author_key']);

  pgm.createTable('proposal_items', {
    proposal_id: {
      type: 'uuid',
      notNull: true,
      references: 'proposals',
      onDelete: 'CASCADE',
    },
    position: { type: 'integer', notNull: true },
    kind: { type: 'text', notNull: true },
    item_id: { type: 'text', notNull: true },
    title: { type: 'text', notNull: true },
    version: { type: 'integer', notNull: true },
    snapshot: { type: 'jsonb', notNull: true },
    // The folder it lands in: the proposal's target, or a library chart's
    // own, going with a dashboard (T349's review).
    lands_in: { type: 'text', notNull: true },
    replaces_id: { type: 'text' },
    replaces_version: { type: 'integer' },
    // While its proposal is open: a decision clears it (T351–T353).
    open: { type: 'boolean', notNull: true, default: true },
  });
  pgm.addConstraint('proposal_items', 'proposal_items_pkey', {
    primaryKey: ['proposal_id', 'position'],
  });
  // An item waits in one open proposal at a time, whether proposed itself or
  // going with another, such as a dashboard's chart (T349's review).
  pgm.createIndex('proposal_items', ['kind', 'item_id'], {
    unique: true,
    where: 'open',
    name: 'proposal_items_one_open_per_item',
  });
};

exports.down = (pgm) => {
  pgm.dropTable('proposal_items');
  pgm.dropTable('proposals');
};
