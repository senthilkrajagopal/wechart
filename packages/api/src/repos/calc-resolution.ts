import { addedMeasures, joinPathCubesOf } from '../model/added-measures';
import { declaredIn } from '../model/split';

/** A model file as an approval landed it, and as it was before (null for a new one). */
export interface LandedModelFile {
  readonly folderId: string;
  readonly path: string;
  readonly before: string | null;
  readonly after: string;
}

/** A cube a measure may be added to, in its folder: by its name, which is its published name too (T709). */
export interface RequestCube {
  readonly folderId: string;
  readonly name: string;
  readonly fullName: string;
}

/**
 * The calculation requests an approval resolves (T385, AC-052): each open
 * one whose cube a model file the approval landed adds a measure to,
 * proposed by a member who took the request up — opened it into their
 * workspace (T384). Each names the members that resolve it: the measures
 * added, by their cube's full name.
 *
 * Taken up is what ties a measure to a request: a measure some other change
 * adds to the cube answers no one's request in particular (R63). A request
 * on a view is resolved by a measure added to any cube on the view's join
 * paths (T590, R64).
 */
export interface OpenRequest {
  readonly id: string;
  /** The cube or view, by its full published name. */
  readonly cube: string;
  readonly folderId: string;
  /** The keys of the members who took it up. */
  readonly takenBy: readonly string[];
  /**
   * The cubes a measure resolves it on (T590): a view's, those on its join
   * paths. Unset, its own cube, in its own folder.
   */
  readonly on?: readonly RequestCube[];
}

export interface Resolution {
  readonly id: string;
  readonly members: readonly string[];
}

export function resolutionsOf(
  open: readonly OpenRequest[],
  landed: readonly LandedModelFile[],
  authorKey: string,
): Resolution[] {
  const resolved: Resolution[] = [];
  for (const request of open) {
    if (!request.takenBy.includes(authorKey)) continue;
    const cubes = request.on ?? [
      { folderId: request.folderId, name: request.cube, fullName: request.cube },
    ];
    const members = landed.flatMap((file) => {
      const added = addedMeasures(file.before, file.after);
      return cubes
        .filter((cube) => cube.folderId === file.folderId)
        .flatMap((cube) =>
          (added.get(cube.name) ?? []).map((measure) => `${cube.fullName}.${measure}`),
        );
    });
    if (members.length > 0) resolved.push({ id: request.id, members });
  }
  return resolved;
}

/**
 * The cubes a view's join paths bound when it was published (T590), by full
 * name: each segment as its held bindings give it (`GET …/items`;
 * `xcube-meta-revision-and-bindings.md`, "`bindings`"). A segment it holds
 * no binding for, or one bound to the view itself, is left out.
 */
/** What `withViewCubes` reads: the model files of a folder, the items xcube holds, and wechart's folder for a full name. */
export interface ViewLookups {
  readonly filesIn: (folderId: string) => Promise<readonly { readonly content: string }[]>;
  readonly held: () => Promise<
    readonly { readonly fullName: string; readonly bindings: Readonly<Record<string, string>> }[]
  >;
  readonly folderOf: (fullName: string) => Promise<string | undefined>;
}

/**
 * Requests on a view, with the cubes a measure resolves them on (T590,
 * AC-052; R64): those on the view's join paths, from the view's own file in
 * its folder and the bindings xcube holds for it, each in wechart's folder. A
 * request on a cube is left as it is. A lookup that fails leaves its request
 * as it is too, so it can't keep the others from being resolved (T590's
 * review); a view's request left so is resolved by none of its cubes.
 */
export async function withViewCubes(
  requests: readonly OpenRequest[],
  lookups: ViewLookups,
): Promise<OpenRequest[]> {
  let held: ReturnType<ViewLookups['held']> | undefined;
  return Promise.all(
    requests.map(async (request): Promise<OpenRequest> => {
      try {
        const name = request.cube;
        const file = (await lookups.filesIn(request.folderId)).find((each) =>
          declaredIn(each.content).some(
            (declared) => declared.name === name && declared.kind === 'view',
          ),
        );
        if (file === undefined) return request;
        held ??= lookups.held();
        const view = (await held).find((item) => item.fullName === request.cube);
        const on: RequestCube[] = [];
        for (const fullName of boundCubesOf(
          request.cube,
          joinPathCubesOf(file.content).get(name) ?? [],
          view?.bindings ?? {},
        )) {
          const folderId = await lookups.folderOf(fullName);
          if (folderId !== undefined) on.push({ folderId, name: fullName, fullName });
        }
        return { ...request, on };
      } catch {
        return request;
      }
    }),
  );
}

export function boundCubesOf(
  viewFullName: string,
  segments: readonly string[],
  bindings: Readonly<Record<string, string>>,
): string[] {
  return segments.flatMap((segment) => {
    const bound = bindings[segment];
    return bound === undefined || bound === viewFullName ? [] : [bound];
  });
}
