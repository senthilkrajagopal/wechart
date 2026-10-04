/**
 * A wechart schedule suspended after its failed runs in a row (T379, AC-155;
 * design 16, state E and Q9). Each schedule sets how many suspend it, a whole
 * number from 1 up, 3 unless changed, with no "never". Its failures in a row
 * are counted from Run history, its scheduled runs since `counted_from`,
 * which Resume sets, so the count starts again from 0. A suspended schedule
 * starts no runs until it is resumed: when, and why, are kept.
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.addColumns('schedules', {
    suspend_after: { type: 'integer', notNull: true, default: 3 },
    // Its failures in a row are counted from runs started after it.
    counted_from: { type: 'timestamptz' },
    suspended_at: { type: 'timestamptz' },
    // Cube's last error when it was suspended.
    suspended_error: { type: 'text' },
  });
  pgm.addConstraint('schedules', 'schedules_suspend_after', {
    check: 'suspend_after >= 1',
  });
};

exports.down = (pgm) => {
  pgm.dropConstraint('schedules', 'schedules_suspend_after');
  pgm.dropColumns('schedules', [
    'suspend_after',
    'counted_from',
    'suspended_at',
    'suspended_error',
  ]);
};
