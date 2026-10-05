import { isMap, isSeq, parseDocument } from 'yaml';

/**
 * What a landed model file adds (T385, AC-052): each cube's measures it has
 * that the file it replaced didn't, by cube name, in the file's order. A new
 * file adds every measure it has. A file that doesn't read as YAML adds
 * nothing to say: its problems are the publish check's.
 */
export function addedMeasures(
  before: string | null,
  after: string,
): ReadonlyMap<string, readonly string[]> {
  const had = measuresOf(before ?? '');
  const added = new Map<string, string[]>();
  for (const [cube, measures] of measuresOf(after)) {
    const known = new Set(had.get(cube) ?? []);
    const fresh = measures.filter((measure) => !known.has(measure));
    if (fresh.length > 0) added.set(cube, fresh);
  }
  return added;
}

/**
 * The cubes on each view's join paths, by short name (T590, AC-052; R64):
 * every segment of each `cubes[].join_path`, which each name a cube
 * (`cube/data-modeling.md`, Y.10a), once each, in the file's order. A cube's
 * file, or one that doesn't read as YAML, has none.
 */
export function joinPathCubesOf(content: string): ReadonlyMap<string, readonly string[]> {
  const byView = new Map<string, string[]>();
  const document = parseDocument(content);
  if (document.errors.length > 0 || !isMap(document.contents)) return byView;
  const views = document.contents.get('views');
  if (!isSeq(views)) return byView;
  for (const view of views.items) {
    if (!isMap(view)) continue;
    const name = view.get('name');
    if (typeof name !== 'string') continue;
    const cubes = view.get('cubes');
    const segments = isSeq(cubes)
      ? cubes.items.flatMap((entry) => {
          const path: unknown = isMap(entry) ? entry.get('join_path') : undefined;
          return typeof path === 'string' ? path.split('.').filter((part) => part !== '') : [];
        })
      : [];
    byView.set(name, [...new Set(segments)]);
  }
  return byView;
}

/** Each cube a file declares, with its measures' names, in the file's order. */
function measuresOf(content: string): Map<string, string[]> {
  const byCube = new Map<string, string[]>();
  const document = parseDocument(content);
  if (document.errors.length > 0 || !isMap(document.contents)) return byCube;
  const cubes = document.contents.get('cubes');
  if (!isSeq(cubes)) return byCube;
  for (const cube of cubes.items) {
    if (!isMap(cube)) continue;
    const name = cube.get('name');
    if (typeof name !== 'string') continue;
    const measures = cube.get('measures');
    byCube.set(
      name,
      isSeq(measures)
        ? measures.items.flatMap((measure) => {
            const named = isMap(measure) ? measure.get('name') : undefined;
            return typeof named === 'string' ? [named] : [];
          })
        : [],
    );
  }
  return byCube;
}
