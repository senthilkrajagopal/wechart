import { isMap, isSeq, parseDocument, type YAMLMap } from 'yaml';

import { nameKey } from './names';

/**
 * How an imported file's models are bound to the data sources chosen for
 * those the file holds (T721, AC-358; from T671's WIP). A cube names its data
 * source by `data_source` or `dataSource`; one naming none, and extending no
 * other, binds to `default` (research `xcube-slice-6.md`). A cube extending
 * another takes its parent's, which is the parent's to say.
 *
 * Mapped to an existing data source of another name, each cube naming the
 * file's one is given the name of the one chosen, in the key it uses, so it
 * binds to that one. Names compare in any case (R71). A data source created
 * for the import keeps its own name, so its cubes are as they were. Nothing
 * else in the file changes.
 */
export const DEFAULT_SOURCE = 'default';

const textOf = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;

/** Each cube of a file, read as YAML, or none where it doesn't read. */
function cubesOf(content: string): {
  document: ReturnType<typeof parseDocument>;
  cubes: YAMLMap[];
} {
  const document = parseDocument(content);
  if (document.errors.length > 0 || !isMap(document.contents)) return { document, cubes: [] };
  const cubes = document.contents.get('cubes');
  const maps: YAMLMap[] = [];
  if (isSeq(cubes)) for (const item of cubes.items as unknown[]) if (isMap(item)) maps.push(item);
  return { document, cubes: maps };
}

/** The key a cube names its data source by, and the name, if it names one. */
function namedBy(cube: YAMLMap): { key: 'data_source' | 'dataSource'; name: string } | undefined {
  for (const key of ['data_source', 'dataSource'] as const) {
    const name = textOf(cube.get(key));
    if (name !== undefined) return { key, name };
  }
  return undefined;
}

/**
 * The data source each cube of a model file binds to by its own say: the one
 * it names, or `default` for one naming none and extending none. A cube
 * extending another is left out: its parent says.
 */
export function sourcesNamedIn(content: string): { cube: string; source: string }[] {
  return cubesOf(content).cubes.flatMap((cube) => {
    const name = textOf(cube.get('name'));
    if (name === undefined) return [];
    const named = namedBy(cube);
    if (named !== undefined) return [{ cube: name, source: named.name }];
    return textOf(cube.get('extends')) === undefined
      ? [{ cube: name, source: DEFAULT_SOURCE }]
      : [];
  });
}

/**
 * A model file rebound to the names chosen (`chosen`: a data source of the
 * file, by its name, to the name of the one it was mapped to or created as):
 * each cube naming one, in any case, given the name chosen for it, and each
 * naming none, and extending none, the name chosen for `default` where that
 * differs. The file as it was where nothing changes.
 */
export function rebound(content: string, chosen: ReadonlyMap<string, string>): string {
  const byKey = new Map([...chosen].map(([from, to]) => [nameKey(from), to]));
  const { document, cubes } = cubesOf(content);
  let changed = false;
  for (const cube of cubes) {
    if (textOf(cube.get('name')) === undefined) continue;
    const named = namedBy(cube);
    if (named !== undefined) {
      const to = byKey.get(nameKey(named.name));
      if (to !== undefined && to !== named.name) {
        cube.set(named.key, to);
        changed = true;
      }
      continue;
    }
    if (textOf(cube.get('extends')) !== undefined) continue;
    const to = byKey.get(DEFAULT_SOURCE);
    if (to !== undefined && to !== DEFAULT_SOURCE) {
      cube.set('data_source', to);
      changed = true;
    }
  }
  return changed ? document.toString() : content;
}
