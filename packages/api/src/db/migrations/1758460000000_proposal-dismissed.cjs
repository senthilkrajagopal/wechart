/**
 * A rejection's band dismissed by its author (T358; design 05, state M;
 * R42.1): kept on the proposal, so it stays gone on every device until the
 * item is proposed again, which is a new proposal.
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.addColumn('proposals', { dismissed_at: { type: 'timestamptz' } });
};

exports.down = (pgm) => {
  pgm.dropColumn('proposals', 'dismissed_at');
};
