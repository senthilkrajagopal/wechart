/**
 * A shared data source's connection name in Cube, which Generate cubes
 * browses it by (T492's review): its own name, in the shared root and in
 * every other folder alike (T710, AC-328; research `xcube-256d632371.md`,
 * 1.1). None for one in My workspace, which Cube's introspection doesn't
 * list (it reads no overlay).
 */
export function cubeSourceOf({
  name,
  inWorkspace,
}: {
  readonly name: string;
  /** The folder it sits in; none is the shared root. Its name holds no folder. */
  readonly folderId: string | null | undefined;
  readonly inWorkspace: boolean;
}): string | undefined {
  return inWorkspace ? undefined : name;
}
