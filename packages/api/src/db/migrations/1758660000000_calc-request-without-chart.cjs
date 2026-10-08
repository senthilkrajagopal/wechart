/**
 * A calculation request with no chart (T717, AC-283; R73): a use-only copy's
 * page asks its folder for a change to its cube, its description alone, no
 * chart and no fields in use. A chart's request keeps its chart as before.
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.alterColumn('calc_requests', 'chart_id', { notNull: false });
};

exports.down = (pgm) => {
  pgm.sql('DELETE FROM calc_requests WHERE chart_id IS NULL');
  pgm.alterColumn('calc_requests', 'chart_id', { notNull: true });
};
