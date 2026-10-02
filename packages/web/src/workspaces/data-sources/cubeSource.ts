import { SHARED_ROOT } from '../explore/roots';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A shared data source's connection name in Cube, which Generate cubes
 * browses it by (T492's review; the API's `connectionNameOf` and
 * `xcubeIdOf`): its own name in the shared root, `f<folder id, its dashes
 * dropped>__<name>` in a folder of a UUID's id. None for a folder of a
 * seed's id, whose xcube id is stored, not derived; nor for one in My
 * workspace, which Cube's introspection doesn't list (it reads no overlay).
 */
export function cubeSourceOf({
  name,
  folderId,
  inWorkspace,
}: {
  readonly name: string;
  /** The folder it sits in; none is the shared root. */
  readonly folderId: string | null | undefined;
  readonly inWorkspace: boolean;
}): string | undefined {
  if (inWorkspace) return undefined;
  const folder = folderId ?? SHARED_ROOT.id;
  if (folder === SHARED_ROOT.id) return name;
  return UUID.test(folder) ? `f${folder.replaceAll('-', '').toLowerCase()}__${name}` : undefined;
}
