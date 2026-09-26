import { joinRefusalsOf, rollupOwnersOf, type RollupOwner } from '../model/rollupJoins';
import { compileErrorsOf, placeOf, type CompileError } from '../model/validate';
import type { ModelFile } from '../server';
import type { CheckAnswer, XcubeAdmin } from './client';

/**
 * A publish checked by xcube's dry run (T445; `docs/research/xcube-slice-2.md`,
 * §"`PUT …/snapshot?dryRun=true`"), in place of the draft Cube read back and
 * the rollup probes asked of Cube under it: xcube compiles the merged files as
 * a candidate and plans a member of each cube with rollups against it,
 * storing nothing.
 *
 * Every break refuses the publish, a rollup already refused before the
 * change included: no `compare` is sent (R29).
 *
 * The answer is read in two steps, so the publish refuses in the order the
 * draft path did (T445's review): the compile first; then, after wechart's
 * own checks of names and crons, what the rollups' probes said. A rollup
 * naming a member the model lacks fails its probe with a 500, and is said by
 * name before that.
 */
export type CheckResult =
  /** xcube not reached, or not answering as it should: nothing is published. */
  | { readonly kind: 'unreachable'; readonly error: string }
  /** The files don't compile: Cube's errors, on their files (AC-136). */
  | { readonly kind: 'invalid'; readonly errors: readonly CompileError[] }
  /** They compile; what the rollups' probes said, read once the rest has passed. */
  | { readonly kind: 'compiled'; readonly rollups: () => RollupsVerdict };

export type RollupsVerdict =
  | { readonly kind: 'passed' }
  /** Cube can't plan these rollups (AC-235). */
  | { readonly kind: 'unjoinable'; readonly errors: readonly CompileError[] }
  /** A probe couldn't be run, or has no answer: nothing is published, and it says why. */
  | { readonly kind: 'unasked'; readonly error: string };

/** The most probes xcube takes in one check (research: `probes` ≤ 1000). */
const PROBES_PER_CHECK = 1000;

export async function checkWithXcube({
  xcube,
  draft,
  changed,
  securityContext,
  log,
}: {
  readonly xcube: XcubeAdmin;
  /** The whole model with the change in it. */
  readonly draft: readonly ModelFile[];
  /** What the publish changes: where errors naming no file are placed. */
  readonly changed: readonly ModelFile[];
  readonly securityContext: Record<string, unknown>;
  readonly log?: (error: unknown) => void;
}): Promise<CheckResult> {
  const owners = rollupOwnersOf(draft);
  const probes = owners.map((owner, at) => ({ id: `rollups-${String(at)}`, query: owner.probe }));
  const answers: CheckAnswer[] = [];
  try {
    // In batches past xcube's limit: each compiles the same files.
    for (let from = 0; from === 0 || from < probes.length; from += PROBES_PER_CHECK) {
      const answer = await xcube.check({
        files: draft,
        securityContext,
        probes: probes.slice(from, from + PROBES_PER_CHECK),
      });
      answers.push(answer);
      if (!answer.valid) break;
    }
  } catch (error) {
    log?.(error);
    return {
      kind: 'unreachable',
      error: 'xcube could not be asked to check the model, so nothing was published.',
    };
  }

  const first = answers[0]!;
  if (!first.valid) {
    // On their files, and those naming none on the changed file holding what
    // they name, as Cube's own compile errors are (AC-136).
    const errors = first.errors.flatMap((error): CompileError[] =>
      error.path !== null
        ? [
            {
              path: error.path,
              ...(error.line === undefined ? {} : { line: error.line }),
              ...(error.column === undefined ? {} : { column: error.column }),
              message: error.message,
            },
          ]
        : placeOf(error.message, changed).map((file) => ({
            path: file.path,
            message: error.message,
          })),
    );
    return {
      kind: 'invalid',
      errors:
        errors.length > 0
          ? errors
          : compileErrorsOf(first.cubeMessage ?? 'xcube refused the model.', changed),
    };
  }

  const byId = new Map(
    answers.flatMap((answer) => answer.probes).map((probe) => [probe.id, probe.candidate]),
  );
  return { kind: 'compiled', rollups: () => verdictOf(owners, byId) };
}

function verdictOf(
  owners: readonly RollupOwner[],
  byId: ReadonlyMap<string, { readonly status: number; readonly error?: string }>,
): RollupsVerdict {
  const refusals: CompileError[] = [];
  for (const [at, owner] of owners.entries()) {
    const candidate = byId.get(`rollups-${String(at)}`);
    // No answer for a cube is no check of it: not a pass (T445's review).
    if (candidate === undefined)
      return {
        kind: 'unasked',
        error: `xcube gave no answer for the rollups of ${owner.cube}, so nothing was published.`,
      };
    if (candidate.status === 200) continue;
    // 400 is Cube's refusal, word for word as `/v1/sql` gives it (research,
    // "What a probe reports"); anything else is Cube failing to plan it.
    if (candidate.status === 400) {
      refusals.push(...joinRefusalsOf(owner, candidate.error ?? 'Cube refused it'));
      continue;
    }
    return {
      kind: 'unasked',
      error: `xcube could not check the rollups of ${owner.cube}${
        candidate.error === undefined ? '' : ` (${candidate.error})`
      }, so nothing was published.`,
    };
  }
  return refusals.length > 0 ? { kind: 'unjoinable', errors: refusals } : { kind: 'passed' };
}
