/**
 * A run's parameter values (T811, AC-454; R78): each `{{name}}`'s name, type
 * and value, as its user gave them, kept with the run for its owner's
 * History alone. Never in the audit trail, which keeps `{{name}}` only.
 * Additive: a run from before has none.
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.addColumn('sql_runs', {
    parameters: { type: 'jsonb', notNull: true, default: pgm.func("'[]'::jsonb") },
  });
};

exports.down = (pgm) => {
  pgm.dropColumn('sql_runs', 'parameters');
};
