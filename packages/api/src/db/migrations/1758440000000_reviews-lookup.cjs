/**
 * The Reviews page's lists (T355, design 05 states D and E): every open
 * proposal and an author's own, each newest first, and the version each
 * approval landed as.
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createIndex('proposals', ['proposed_at'], {
    name: 'proposals_open_by_time',
    where: "status = 'open'",
  });
  pgm.createIndex('proposals', ['author_key', 'proposed_at'], { name: 'proposals_by_author' });
  pgm.createIndex('item_versions', ['proposal_id'], { name: 'item_versions_by_proposal' });
};

exports.down = (pgm) => {
  pgm.dropIndex('item_versions', ['proposal_id'], { name: 'item_versions_by_proposal' });
  pgm.dropIndex('proposals', ['author_key', 'proposed_at'], { name: 'proposals_by_author' });
  pgm.dropIndex('proposals', ['proposed_at'], { name: 'proposals_open_by_time' });
};
