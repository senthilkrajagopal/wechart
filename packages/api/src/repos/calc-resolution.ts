import { addedMeasures } from '../model/added-measures';
import { shortOf } from '../model/bind';

/** A model file as an approval landed it, and as it was before (null for a new one). */
export interface LandedModelFile {
  readonly folderId: string;
  readonly path: string;
  readonly before: string | null;
  readonly after: string;
}

/**
 * The calculation requests an approval resolves (T385, AC-052): each open
 * one on a cube of a model file the approval landed in the request's folder,
 * where the file adds a measure to that cube, proposed by a member who took
 * the request up — opened it into their workspace (T384). Each names the
 * members that resolve it: the measures added, by the request's full name
 * for its cube.
 *
 * Taken up is what ties a measure to a request: a measure some other change
 * adds to the cube answers no one's request in particular.
 */
export interface OpenRequest {
  readonly id: string;
  /** The cube or view, by its full published name. */
  readonly cube: string;
  readonly folderId: string;
  /** The keys of the members who took it up. */
  readonly takenBy: readonly string[];
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
    const name = shortOf(request.cube);
    const members = landed
      .filter((file) => file.folderId === request.folderId)
      .flatMap((file) => addedMeasures(file.before, file.after).get(name) ?? [])
      .map((measure) => `${request.cube}.${measure}`);
    if (members.length > 0) resolved.push({ id: request.id, members });
  }
  return resolved;
}
