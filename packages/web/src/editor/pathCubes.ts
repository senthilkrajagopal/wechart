import type { FolderNode } from '../workspaces/explore/FolderTree';
import { folderChain } from '../workspaces/explore/folders';
import { MY_WORKSPACE, SHARED_ROOT } from '../workspaces/explore/roots';
import type { CubeSummary } from './fields';

/** The shared root's id in xcube (research `xcube-slice-3a.md`, "Names"). */
const XCUBE_ROOT = 'froot';

/**
 * The cubes a chart or dashboard in a folder may be built on (T429,
 * AC-329): those on its folder's path, from the root down, each name's
 * nearest alone — as xcube binds it at publish (AC-272) — never a
 * descendant's or a sibling's. Each carries its folder path, which the
 * picker shows beside its title, never its prefixed name.
 *
 * Where the item's folder isn't known, or the model says nothing of folders
 * (a Cube not served by xcube), every cube is offered as it was.
 */
export function cubesOnPath(
  cubes: readonly CubeSummary[],
  folderId: string | undefined,
  folders: readonly FolderNode[],
  /**
   * For an item in My workspace, the shared folder it is to go to (T347,
   * AC-281): its path is the workspace's own cubes, then that folder's.
   */
  targetFolderId?: string,
): readonly CubeSummary[] {
  if (folderId === undefined || !cubes.some((cube) => cube.xcube !== undefined)) return cubes;
  const chain = folderChain(folders, folderId);
  /**
   * In My workspace (T347; AC-329, AC-281): the workspace's own cubes first,
   * wherever its overlay places them, each hiding a cube of its short name
   * on the path, as names resolve in the overlay first; then its target's
   * path, or the shared root's where it has none.
   */
  if (chain[0]?.id === MY_WORKSPACE.id) {
    const own = cubes
      .filter((cube) => cube.inWorkspace === true)
      .map((cube) => ({ ...cube, folderPath: MY_WORKSPACE.title }));
    const hidden = new Set(own.flatMap((cube) => (cube.xcube ? [cube.xcube.shortName] : [])));
    const shared = cubesOnPath(
      cubes.filter((cube) => cube.inWorkspace !== true),
      targetFolderId ?? SHARED_ROOT.id,
      folders,
    ).filter((cube) => cube.xcube === undefined || !hidden.has(cube.xcube.shortName));
    return [...own, ...shared];
  }
  const crumbs = chain;
  // From the root down: each folder's xcube id and the path to it in words.
  // An item under My workspace reaches its own and its target's path, above.
  const path =
    crumbs[0]?.id === SHARED_ROOT.id
      ? crumbs.map((crumb, at) => ({
          xcubeId:
            at === 0
              ? XCUBE_ROOT
              : (folders.find((folder) => folder.id === crumb.id)?.xcubeId ?? undefined),
          words: crumbs
            .slice(0, at + 1)
            .map((each) => each.title)
            .join(' / '),
        }))
      : [{ xcubeId: XCUBE_ROOT, words: SHARED_ROOT.title }];
  const depthOf = new Map(
    path.flatMap((step, at) => (step.xcubeId === undefined ? [] : [[step.xcubeId, at] as const])),
  );
  // Each short name's nearest: the deepest folder on the path that holds it.
  const nearest = new Map<string, { cube: CubeSummary; depth: number }>();
  for (const cube of cubes) {
    if (cube.xcube === undefined) continue;
    const depth = depthOf.get(cube.xcube.folderId);
    if (depth === undefined) continue;
    const held = nearest.get(cube.xcube.shortName);
    if (held === undefined || depth > held.depth)
      nearest.set(cube.xcube.shortName, { cube, depth });
  }
  const chosen = new Set([...nearest.values()].map(({ cube }) => cube));
  return cubes
    .filter((cube) => chosen.has(cube))
    .map((cube) => ({ ...cube, folderPath: path[depthOf.get(cube.xcube!.folderId)!]!.words }));
}
