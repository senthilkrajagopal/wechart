/**
 * R81's types join the vocabulary (T934) before each is drawn and given its
 * table view by its own tasks (docs/tasks.md §P2.27). The e2e that walk every
 * type (`chart-editor.spec.ts`, "no chart type is left undrawn";
 * `table-view.spec.ts`, AC-178) leave out the ones still waiting, named here,
 * and each type's series task and table-view task takes its line out, so
 * that from then on the walk covers it like every other type.
 */

/** Types whose series isn't registered yet: the tile says "‹type› charts are not drawn yet." */
export const AWAITING_SERIES: ReadonlySet<string> = new Set([
  'waterfall',
  'histogram',
  'bubble',
  'sankey',
  'funnel',
  'timeline',
  'calendar',
  'icicle',
  'graphicalTable',
]);

/** Types whose table view and fixture aren't built yet (AC-178, each type's table-view task). */
export const AWAITING_TABLE_VIEW: ReadonlySet<string> = new Set([
  'waterfall',
  'histogram',
  'bubble',
  'parallel',
  'sankey',
  'funnel',
  'timeline',
  'calendar',
  'icicle',
  'graphicalTable',
]);
