/**
 * A calculation request resolved (T385, AC-052, amended by R63): the approval
 * of a proposal that adds measures to its cube, from a member who took it up.
 * It keeps the members that resolve it, by full name, the proposal, its
 * author and its approver, and when. All are null while it is open.
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.addColumns('calc_requests', {
    // The measures that resolve it, each `<cube>.<measure>` by full name.
    resolved_members: { type: 'jsonb' },
    resolved_proposal_id: { type: 'uuid' },
    resolved_by_key: { type: 'text' },
    resolved_by_name: { type: 'text' },
    approved_by_name: { type: 'text' },
    resolved_at: { type: 'timestamptz' },
  });
};

exports.down = (pgm) => {
  pgm.dropColumns('calc_requests', [
    'resolved_members',
    'resolved_proposal_id',
    'resolved_by_key',
    'resolved_by_name',
    'approved_by_name',
    'resolved_at',
  ]);
};
