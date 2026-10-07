/**
 * A wechart schedule paused by hand (T556, AC-396; design 16, P3): when, and
 * by whom, so the page says "Paused · by <name>". A paused schedule starts
 * none of its runs until it is resumed. Its count of failures in a row isn't
 * touched by a pause or its resume (R59).
 *
 * `runs_from`: when it was last laid in pg-boss (made, changed, resumed or
 * unpaused). pg-boss sends any occurrence of the last 60 s when a schedule
 * is laid (research pg-boss-12.33.2-installed.md, "The due window"); wechart
 * runs none from before this time. Additive.
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.addColumns('schedules', {
    paused_at: { type: 'timestamptz' },
    paused_by_key: { type: 'text' },
    paused_by_name: { type: 'text' },
    runs_from: { type: 'timestamptz' },
  });
};

exports.down = (pgm) => {
  pgm.dropColumns('schedules', ['paused_at', 'paused_by_key', 'paused_by_name', 'runs_from']);
};
