import type { FolderNode } from '../workspaces/explore/FolderTree';
import { folderChain } from '../workspaces/explore/folders';
import { SHARED_ROOT } from '../workspaces/explore/roots';
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
): readonly CubeSummary[] {
  if (folderId === undefined || !cubes.some((cube) => cube.xcube !== undefined)) return cubes;
  const crumbs = folderChain(folders, folderId);
  // From the root down: each folder's xcube id and the path to it in words.
  // An item under My workspace reaches the shared root's cubes alone: xcube
  // serves no workspace until slice 5 (T429's review).
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
