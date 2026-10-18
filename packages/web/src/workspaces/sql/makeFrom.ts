import type { SqlOutcome } from '../data-sources/SqlResult';

/**
 * Whether a run's result may become a cube or a chart (T819, AC-461; design
 * 17 §6, rule 101): only a SELECT that ran to its end, Finished or Limited,
 * on a data source, whose columns each have their own name, and only for
 * someone who may make a model (AC-350's audience). Elsewhere both are
 * disabled with the reason, one for both; to someone who may not make a
 * model, and on a run with no result to model, neither is shown (`null`).
 *
 * The reasons are checked from the most lasting: Cube Store's holds whatever
 * is run on it, an EXPLAIN's whatever its end, and a stopped run's until it
 * is run again.
 */
export type MakeFrom =
  | { readonly enabled: true }
  | {
      readonly enabled: false;
      /** Said beside the buttons; a column's name between backticks, in the code face. */
      readonly reason: string;
    };

export function makeFrom({
  outcome,
  onCubeStore,
  mayModel,
}: {
  readonly outcome: SqlOutcome;
  readonly onCubeStore: boolean;
  /** Whether they may make a model: `hasWorkspace` (AC-350). */
  readonly mayModel: boolean;
}): MakeFrom | null {
  if (!mayModel) return null;
  const ended = outcome.outcome === 'finished';
  const stopped = outcome.outcome === 'timeout' || outcome.outcome === 'cancelled';
  if (!ended && !stopped) return null;
  if (onCubeStore)
    return {
      enabled: false,
      reason: 'Cube Store holds rollups Cube builds; model the source instead.',
    };
  if (ended && outcome.statement === 'explain')
    return { enabled: false, reason: 'An EXPLAIN’s plan isn’t data to model.' };
  if (outcome.outcome !== 'finished') return { enabled: false, reason: 'Run it to the end first.' };
  const seen = new Set<string>();
  for (const column of outcome.columns) {
    if (seen.has(column.name))
      return {
        enabled: false,
        reason: `Two columns are named \`${column.name}\`: give each its own name with AS, and run it again.`,
      };
    seen.add(column.name);
  }
  return { enabled: true };
}
