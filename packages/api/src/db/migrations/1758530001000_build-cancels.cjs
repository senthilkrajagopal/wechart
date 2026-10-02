/**
 * A build wechart started, cancelled from the queue (T376, AC-150, AC-151):
 * who cancelled it, and when. Its cancelled jobs read `cancelled` in
 * `build_tokens`, a state wechart gives, not Cube.
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.addColumns('build_runs', {
    cancelled_by_key: { type: 'text' },
    cancelled_by_name: { type: 'text' },
    cancelled_at: { type: 'timestamptz' },
  });
  // The queue's entries name their start by its request id or a job's token.
  pgm.createIndex('build_runs', ['request_id'], { name: 'build_runs_by_request' });
  pgm.createIndex('build_tokens', ['token'], { name: 'build_tokens_by_token' });
};

exports.down = (pgm) => {
  pgm.dropIndex('build_tokens', [], { name: 'build_tokens_by_token' });
  pgm.dropIndex('build_runs', [], { name: 'build_runs_by_request' });
  pgm.dropColumns('build_runs', ['cancelled_by_key', 'cancelled_by_name', 'cancelled_at']);
};
