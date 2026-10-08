import type { FolderNode } from '../workspaces/explore/FolderTree';
import { folderChain } from '../workspaces/explore/folders';
import { MY_WORKSPACE, SHARED_ROOT } from '../workspaces/explore/roots';
import type { CubeSummary } from './fields';

/** The shared root's id in xcube (research `xcube-slice-3a.md`, "Names"). */
const XCUBE_ROOT = 'froot';

/** A cube in the picker, and what hides it where a nearer one has its name. */
export interface PickerRow {
  readonly cube: CubeSummary;
  /** Its own in the list: a workspace copy shares its original's name. */
  readonly key: string;
  /** "hidden by your copy", or "hidden by _title_ in _path_": the cube its name binds to instead (AC-342). */
  readonly hiddenBy?: string;
}

/** A folder's cubes in the picker, under its path below Shared, or "Shared", or "My workspace". */
export interface PickerGroup {
  readonly label: string | undefined;
  readonly rows: readonly PickerRow[];
}

/**
 * The cube picker's groups (T475; AC-329, AC-342; 2026-09-27 design 10,
 * state D): the cubes on the item's folder path, by folder, nearest first —
 * for a workspace item its workspace's own, then its target's path — each
 * group named by its path below Shared. A cube whose name a nearer one on the
 * path holds is listed in its folder too, unselectable, saying which cube
 * hides it, since that one is what the name binds to (AC-272, AC-281). A
 * descendant's or a sibling's cube isn't listed at all.
 *
 * Where the item's folder isn't known, or the model says nothing of folders,
 * every cube is listed in one group with no label, as it was.
 */
export function pickerGroupsOf(
  cubes: readonly CubeSummary[],
  folderId: string | undefined,
  folders: readonly FolderNode[],
  targetFolderId?: string,
  /**
   * For a workspace item, the folders' published cubes (`/api/meta` without
   * the overlay): its overlay's meta holds a copy in place of the cube it
   * copies, under the same name, so that one is read from here (T475's
   * review).
   */
  published?: readonly CubeSummary[],
): readonly PickerGroup[] {
  if (folderId === undefined || !cubes.some((cube) => cube.xcube !== undefined))
    return [{ label: undefined, rows: cubes.map((cube) => ({ cube, key: cube.name })) }];
  let chain = folderChain(folders, folderId);
  const inWorkspace = chain[0]?.id === MY_WORKSPACE.id;
  if (inWorkspace) chain = folderChain(folders, targetFolderId ?? SHARED_ROOT.id);
  // The path, nearest first: each folder's xcube id and its words below Shared.
  const steps =
    chain[0]?.id === SHARED_ROOT.id
      ? chain
          .map((crumb, at) => ({
            xcubeId:
              at === 0
                ? XCUBE_ROOT
                : (folders.find((folder) => folder.id === crumb.id)?.xcubeId ?? undefined),
            label:
              at === 0
                ? SHARED_ROOT.title
                : chain
                    .slice(1, at + 1)
                    .map((each) => each.title)
                    .join(' / '),
          }))
          .reverse()
      : [{ xcubeId: XCUBE_ROOT, label: SHARED_ROOT.title }];

  const groups: { label: string; rows: PickerRow[] }[] = [];
  /** Each short name's binding so far, nearest first: what hides the farther ones. */
  const bound = new Map<string, string>();
  const shared =
    inWorkspace && published !== undefined
      ? published
      : cubes.filter((cube) => cube.inWorkspace !== true);
  if (inWorkspace) {
    const own = cubes.filter((cube) => cube.inWorkspace === true);
    for (const cube of own)
      if (cube.xcube)
        bound.set(
          cube.xcube.shortName,
          // A copy keeps its original's name: "your copy" (design 10, state D);
          // a cube made new in the workspace is named with it.
          shared.some((each) => each.name === cube.name)
            ? 'hidden by your copy'
            : `hidden by ${cube.title} in ${MY_WORKSPACE.title}`,
        );
    groups.push({
      label: MY_WORKSPACE.title,
      rows: own.map((cube) => ({ cube, key: `${MY_WORKSPACE.title}/${cube.name}` })),
    });
  }
  for (const step of steps) {
    if (step.xcubeId === undefined) continue;
    const here = shared.filter((cube) => cube.xcube?.folderId === step.xcubeId);
    const rows = here.map((cube): PickerRow => {
      const key = `${step.label}/${cube.name}`;
      const hider = bound.get(cube.xcube!.shortName);
      return hider === undefined ? { cube, key } : { cube, key, hiddenBy: hider };
    });
    for (const cube of here)
      if (!bound.has(cube.xcube!.shortName))
        bound.set(cube.xcube!.shortName, `hidden by ${cube.title} in ${step.label}`);
    if (rows.length > 0) groups.push({ label: step.label, rows });
  }
  return groups;
}

/**
 * The cubes a chart or dashboard in a folder may be built on (T429,
 * AC-329): those its folder's path keeps, from the root down, never a
 * descendant's or a sibling's. Each is under its own name, one item's in
 * every folder (T710, AC-328), and carries its folder path, which the picker
 * shows beside its title.
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
   * wherever its overlay places them; then its target's path, or the shared
   * root's where it has none. A copy is its cube's one name, standing in for
   * the landed cube in the overlay, so the landed one isn't offered too.
   */
  if (chain[0]?.id === MY_WORKSPACE.id) {
    const own = cubes
      .filter((cube) => cube.inWorkspace === true)
      .map((cube) => ({ ...cube, folderPath: MY_WORKSPACE.title }));
    const held = new Set(own.map((cube) => cube.name.toLowerCase()));
    const shared = cubesOnPath(
      cubes.filter((cube) => cube.inWorkspace !== true),
      targetFolderId ?? SHARED_ROOT.id,
      folders,
    ).filter((cube) => !held.has(cube.name.toLowerCase()));
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
  const wordsOf = new Map(
    path.flatMap((step) =>
      step.xcubeId === undefined ? [] : [[step.xcubeId, step.words] as const],
    ),
  );
  // Each cube a folder on the path keeps, under its own name.
  return cubes.flatMap((cube) => {
    const words = cube.xcube === undefined ? undefined : wordsOf.get(cube.xcube.folderId);
    return words === undefined ? [] : [{ ...cube, folderPath: words }];
  });
}
