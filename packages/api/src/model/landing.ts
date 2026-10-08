import type { StoredModelFile } from '../repos/model-files';
import { declaredIn } from './split';

/**
 * Where a proposal's models land in their folders (T451; AC-288, AC-275).
 *
 * Files are stored by folder and path, but a proposed model replaces the
 * folder's file declaring its name (T350), and the two can disagree (T350's
 * review):
 * - The file of its name at another path is moved to the model's path,
 *   keeping its id, so the folder declares the name once and the item's
 *   history goes on.
 * - A file at its path declaring another name is refused, never written
 *   over.
 * - A copy declaring a name other than its original's is refused: a landed
 *   name is fixed, and a copy lands over its original under it (T706,
 *   AC-423, AC-422). So nothing a landing writes over is renamed away.
 */
export interface LandingModel {
  /** The workspace file proposed: the proposal item's id. */
  readonly fileId: string;
  readonly title: string;
  /** The folder it lands in. */
  readonly folderId: string;
  readonly path: string;
  readonly content: string;
  /** The shared file it was copied from, where it is a copy. */
  readonly originId: string | null;
}

export interface LandingWrite {
  readonly fileId: string;
  readonly folderId: string;
  readonly path: string;
  readonly content: string;
  /** The folder's file it lands as, its id kept; none for a new one. */
  readonly over: StoredModelFile | null;
  /** That file's path, where the model moves it to its own. */
  readonly from?: string;
}

export type LandingPlan =
  | { readonly kind: 'refused'; readonly error: string }
  | {
      readonly kind: 'planned';
      readonly writes: readonly LandingWrite[];
      /** Per folder, the names it sends again, which bind anew. */
      readonly resent: ReadonlyMap<string, readonly string[]>;
    };

const namesOf = (content: string) =>
  declaredIn(content)
    .map(({ name }) => name)
    .filter((name) => name !== '');

const push = (map: Map<string, string[]>, key: string, value: string) => {
  const list = map.get(key);
  if (list === undefined) map.set(key, [value]);
  else if (!list.includes(value)) list.push(value);
};

export function planLanding(
  /** The files of the folders the models land in, as stored. */
  shared: readonly StoredModelFile[],
  models: readonly LandingModel[],
): LandingPlan {
  // One path and one name to a folder among the models themselves.
  const paths = new Set<string>();
  const names = new Set<string>();
  for (const each of models) {
    const at = `${each.folderId}\n${each.path}`;
    if (paths.has(at))
      return {
        kind: 'refused',
        error: `Two of its models would land as “${each.path}” in one folder.`,
      };
    paths.add(at);
    for (const name of namesOf(each.content)) {
      const named = `${each.folderId}\n${name}`;
      if (names.has(named))
        return {
          kind: 'refused',
          error: `Two of its models would land declaring “${name}” in one folder.`,
        };
      names.add(named);
    }
  }

  const writes: LandingWrite[] = [];
  for (const each of models) {
    const [name] = namesOf(each.content);
    if (name === undefined)
      return {
        kind: 'refused',
        error: `“${each.title}” declares no cube or view, so it can’t land.`,
      };
    const own = shared.filter((file) => file.folderId === each.folderId);
    // A landed name is fixed: a copy of its file lands only under it (T706, AC-423).
    const origin = own.find((file) => file.id === each.originId);
    const kept = origin === undefined ? undefined : namesOf(origin.content)[0];
    if (kept !== undefined && kept !== name)
      return {
        kind: 'refused',
        error: `“${each.title}” can’t land: “${kept}” has landed, so its name is fixed: a copy of it keeps that name.`,
      };
    const atPath = own.find((file) => file.path === each.path);
    const named = own.find((file) => namesOf(file.content).includes(name));
    const write = {
      fileId: each.fileId,
      folderId: each.folderId,
      path: each.path,
      content: each.content,
    };
    if (atPath !== undefined && namesOf(atPath.content).includes(name))
      writes.push({ ...write, over: atPath });
    else if (atPath !== undefined)
      return {
        kind: 'refused',
        error: `“${each.title}” can’t land: its folder’s file at that path declares ${namesOf(
          atPath.content,
        )
          .map((one) => `“${one}”`)
          .join(', ')}. Give yours another path in your workspace, and propose it again.`,
      };
    else if (named !== undefined) writes.push({ ...write, over: named, from: named.path });
    else writes.push({ ...write, over: null });
  }

  // One model over one file: two over the same one, a rename and a move of
  // it, would leave one of them written over the other (T451's review).
  for (const [at, write] of writes.entries()) {
    const other = writes
      .slice(at + 1)
      .find((each) => write.over !== null && each.over?.id === write.over.id);
    if (other !== undefined)
      return {
        kind: 'refused',
        error: `“${write.path}” and “${other.path}” would both land over its folder’s ${write.over!.path}.`,
      };
  }

  // What each folder declares once they land.
  const resent = new Map<string, string[]>();
  for (const each of writes)
    for (const name of namesOf(each.content)) push(resent, each.folderId, name);
  return { kind: 'planned', writes, resent };
}
