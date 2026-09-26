import { joinRefusalsOf, rollupOwnersOf, type RollupOwner } from '../model/rollupJoins';
import { compileErrorsOf, placeOf, type CompileError } from '../model/validate';
import type { ModelFile } from '../server';
import { declaredIn, pathsByName } from '../model/split';
import { ROOT_FOLDER_ID } from '../repos/catalog';
import { changesetOf, type Changeset } from './changesets';
import { ROOT_ONLY, XCUBE_ROOT } from './folders';
import { itemsHashOf, itemsOf } from './items';
import { XcubeError, type CheckAnswer, type ItemsCheckAnswer, type XcubeAdmin } from './client';
import { plainYamlOf } from './snapshot';

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
  /**
   * They compile; what the rollups' probes said, read once the rest has
   * passed. On a model in items mode, the changeset checked, to be applied
   * once the publish is committed (T426).
   */
  | {
      readonly kind: 'compiled';
      readonly rollups: () => RollupsVerdict;
      readonly changeset?: Changeset;
    };

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
  live = [],
  folders = ROOT_ONLY.ids,
  securityContext,
  log,
}: {
  readonly xcube: XcubeAdmin;
  /** The whole model with the change in it, every folder's files (T452). */
  readonly draft: readonly ModelFile[];
  /** What the publish changes: where errors naming no file are placed. */
  readonly changed: readonly ModelFile[];
  /** The model as it is published now: what the changeset is taken against (T426). */
  readonly live?: readonly ModelFile[];
  /** Each served folder's xcube id, by wechart's (T452); the root alone where none are given. */
  readonly folders?: ReadonlyMap<string, string>;
  readonly securityContext: Record<string, unknown>;
  readonly log?: (error: unknown) => void;
}): Promise<CheckResult> {
  // Checked as it will be served: its plain YAML alone (T446, AC-335), the
  // root's for a file set, which is all a model holding one has.
  const served = plainYamlOf(
    draft.filter((file) => (file.folderId ?? ROOT_FOLDER_ID) === ROOT_FOLDER_ID),
  );
  // Each folder's rollups, probed by their cube's full name (T452; research
  // 3a: "Probe queries use full names"): a folder's own `orders` is
  // `<folderId>__orders` there.
  const owners: FolderOwner[] = [...folders].flatMap(([folderId, xcubeId]) =>
    rollupOwnersOf(
      plainYamlOf(draft.filter((file) => (file.folderId ?? ROOT_FOLDER_ID) === folderId)),
    ).map((owner) =>
      xcubeId === XCUBE_ROOT
        ? owner
        : { ...owner, folderId, probe: fullNamed(owner.probe, xcubeId) },
    ),
  );
  const probes = owners.map((owner, at) => ({ id: `rollups-${String(at)}`, query: owner.probe }));

  /**
   * On a model in items mode, by the changeset's dry run (T426; research
   * 3a, "POST …/changesets?dryRun=true"): the items the change makes, each
   * error on its item's file. A model still holding a file set (the moment
   * before an API's first send moves it, T449) is checked as a file set.
   */
  let change = changesetOf(live, draft, folders);
  /**
   * Whether xcube holds what wechart's store does. Where it doesn't (a send
   * lost, or a row written to the store), a changeset taken against the
   * store would be checked without what xcube lacks, so every item is
   * checked, and the publish then sends the whole model (T426's e2e).
   */
  let whole = false;
  const itemAnswers: ItemsCheckAnswer[] = [];
  try {
    const head = await xcube.revision();
    if (head.mode !== 'items') throw new XcubeError(409, 'mode', 'xcube holds a file set');
    if (head.current?.itemsHash !== itemsHashOf(itemsOf(live, folders))) {
      whole = true;
      // Every item the store makes, and a delete of each xcube holds that it
      // doesn't: the model as the whole send will leave it (T426's review).
      const upserts = itemsOf(draft, folders);
      const kept = new Set(upserts.map((item) => `${item.folderId}/${item.name}`));
      const held = await xcube.items();
      change = {
        upserts,
        deletes: held.filter((item) => !kept.has(`${item.folderId}/${item.name}`)),
      };
    }
    for (let from = 0; from === 0 || from < probes.length; from += PROBES_PER_CHECK) {
      const answer = await xcube.checkChangeset({
        ...change,
        securityContext,
        probes: probes.slice(from, from + PROBES_PER_CHECK),
      });
      itemAnswers.push(answer);
      if (!answer.valid) break;
    }
  } catch (error) {
    if (!(error instanceof XcubeError && error.code === 'mode')) {
      log?.(error);
      return {
        kind: 'unreachable',
        error: 'xcube could not be asked to check the model, so nothing was published.',
      };
    }
  }
  if (itemAnswers.length > 0) {
    const first = itemAnswers[0]!;
    if (!first.valid) {
      // By the item's folder and name (T452): two folders' files can declare
      // one name. By name alone where xcube names no folder.
      const byItem = new Map<
        string,
        { readonly path: string | undefined; readonly folderId: string | undefined }
      >();
      // The draft's first; then what is live, for an item the change deletes (T428).
      for (const file of [...draft, ...live]) {
        const xcubeId = folders.get(file.folderId ?? ROOT_FOLDER_ID);
        if (xcubeId === undefined) continue;
        for (const { name } of declaredIn(file.content))
          if (!byItem.has(`${xcubeId}/${name}`))
            byItem.set(`${xcubeId}/${name}`, { path: file.path, folderId: file.folderId });
      }
      const paths = pathsByName(draft);
      const errors = first.errors.flatMap((error): CompileError[] => {
        const placed =
          error.name === null
            ? undefined
            : error.folderId === null
              ? { path: paths.get(error.name), folderId: undefined }
              : byItem.get(`${error.folderId}/${error.name}`);
        const path = placed?.path;
        // Outside the root, its folder too: a path can be one in each (T452).
        const where =
          placed?.folderId === undefined || placed.folderId === ROOT_FOLDER_ID
            ? {}
            : { folderId: placed.folderId };
        // Only a YAML error's line is the author's: a compile error's would
        // be xcube's resolved copy's (AC-136 as reworded; research 3b).
        const at =
          error.kind === 'yaml'
            ? {
                ...(error.line === undefined ? {} : { line: error.line }),
                ...(error.column === undefined ? {} : { column: error.column }),
              }
            : {};
        return path !== undefined
          ? [{ path, ...where, ...at, message: error.message }]
          : placeOf(error.message, changed).map((file) => ({
              path: file.path,
              message: error.message,
            }));
      });
      return {
        kind: 'invalid',
        errors:
          errors.length > 0
            ? errors
            : compileErrorsOf(first.cubeMessage ?? 'xcube refused the model.', changed),
      };
    }
    const byId = new Map(
      itemAnswers.flatMap((answer) => answer.probes).map((probe) => [probe.id, probe.candidate]),
    );
    return {
      kind: 'compiled',
      rollups: () => verdictOf(owners, byId),
      ...(whole ? {} : { changeset: change }),
    };
  }

  // A file set is the root's files alone, so only its cubes are probed
  // (T452's review): a folder's would fail, being in none of them.
  const rootOwners = rollupOwnersOf(served);
  const rootProbes = rootOwners.map((owner, at) => ({
    id: `rollups-${String(at)}`,
    query: owner.probe,
  }));
  const answers: CheckAnswer[] = [];
  try {
    // In batches past xcube's limit: each compiles the same files.
    for (let from = 0; from === 0 || from < rootProbes.length; from += PROBES_PER_CHECK) {
      const answer = await xcube.check({
        files: served,
        securityContext,
        probes: rootProbes.slice(from, from + PROBES_PER_CHECK),
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
  return { kind: 'compiled', rollups: () => verdictOf(rootOwners, byId) };
}

/** A cube with rollups, and the folder holding its file where that isn't the root (T452). */
type FolderOwner = RollupOwner & { readonly folderId?: string };

/** A probe's members under their cube's full name in a folder: `<folderId>__<cube>.<member>`. */
function fullNamed(probe: RollupOwner['probe'], xcubeId: string): RollupOwner['probe'] {
  return 'measures' in probe
    ? { measures: probe.measures.map((member) => `${xcubeId}__${member}`) }
    : { dimensions: probe.dimensions.map((member) => `${xcubeId}__${member}`) };
}

function verdictOf(
  owners: readonly FolderOwner[],
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
      refusals.push(
        ...joinRefusalsOf(owner, candidate.error ?? 'Cube refused it').map((refusal) =>
          owner.folderId === undefined ? refusal : { ...refusal, folderId: owner.folderId },
        ),
      );
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
