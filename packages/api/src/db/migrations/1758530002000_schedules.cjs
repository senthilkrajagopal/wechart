/**
 * wechart's own schedules (T378, AC-234; design 16, screen 2 and Q7, Q8,
 * Q10): each builds every partition of one pre-aggregation at its cron's
 * times, in its zone, through Cube's jobs API. A schedule belongs to its
 * pre-aggregation's folder, and names who made it and who last changed it.
 * pg-boss keeps the timing in its own schema (research scheduler.md); this
 * table is what wechart says a schedule is, and pg-boss's rows follow it.
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable('schedules', {
    id: { type: 'text', primaryKey: true },
    // Names its runs in Run history.
    name: { type: 'text', notNull: true },
    // Its published name, `cube.pre_aggregation`, as the jobs API names it.
    pre_aggregation: { type: 'text', notNull: true },
    // Its pre-aggregation's folder when it was made or last changed (T371).
    folder_id: { type: 'text' },
    // Five fields, in `timezone`, which is required (AC-234).
    cron: { type: 'text', notNull: true },
    timezone: { type: 'text', notNull: true },
    // A run that fell due while wechart was stopped: run once when back, or skip (Q8).
    missed: { type: 'text', notNull: true, default: 'once' },
    created_by_key: { type: 'text', notNull: true },
    created_by_name: { type: 'text', notNull: true },
    created_at: { type: 'timestamptz', notNull: true },
    updated_by_key: { type: 'text', notNull: true },
    updated_by_name: { type: 'text', notNull: true },
    updated_at: { type: 'timestamptz', notNull: true },
  });
  pgm.addConstraint('schedules', 'schedules_missed', {
    check: "missed IN ('once', 'skip')",
  });
  pgm.createIndex('schedules', ['pre_aggregation'], { name: 'schedules_by_preagg' });
  pgm.createIndex('schedules', ['folder_id'], { name: 'schedules_by_folder' });
};

exports.down = (pgm) => {
  pgm.dropTable('schedules');
};
