/**
 * An item's latest proposal, looked up as its author's item is shown (T353,
 * design 05 state M): by the item, whether its proposals are open or decided.
 * The unique index on the item holds open ones alone (T353's review).
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createIndex('proposal_items', ['kind', 'item_id'], { name: 'proposal_items_by_item' });
};

exports.down = (pgm) => {
  pgm.dropIndex('proposal_items', ['kind', 'item_id'], { name: 'proposal_items_by_item' });
};
