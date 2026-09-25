import { parse } from 'yaml';

import type { ModelFile } from '../server';
import type { CompileError } from './validate';

/**
 * Where files generated from a data source clash with the model store (T276,
 * AC-249). Cube's scaffold knows nothing of wechart's model
 * (research/cube/introspection-api.md, "Scaffold ignores the existing model"):
 * a generated file may have a stored file's path, which publishing would
 * overwrite, or declare a cube or view the model has already — cubes and
 * views share one namespace in Cube. Each clash names what it clashes with.
 *
 * The names are read from the stored YAML files, and from Cube's compiled
 * model (`/v1/meta?extended`: each cube's and view's `fileName`,
 * research/cube/data-apis.md) — which knows the cubes of files wechart can't
 * read as YAML: JavaScript, Python, Jinja (T276's review).
 */

/** A cube or view Cube compiled, and its file. */
export interface Compiled {
  readonly kind: 'cube' | 'view';
  readonly name: string;
  readonly path: string;
}

/** The cubes and views in Cube's `/v1/meta?extended` answer, with their files. */
export function compiledIn(meta: unknown): Compiled[] {
  const cubes = (meta as { cubes?: unknown } | null)?.cubes;
  if (!Array.isArray(cubes)) return [];
  return cubes.flatMap((each: unknown) => {
    const { name, type, fileName } = (each ?? {}) as Record<string, unknown>;
    return typeof name === 'string' && typeof fileName === 'string'
      ? [{ kind: type === 'view' ? ('view' as const) : ('cube' as const), name, path: fileName }]
      : [];
  });
}

/** Cube renders a YAML file matching this with Jinja first (as publish.ts refuses them). */
const JINJA = /{%|%}|{{|}}/;
const YAML_FILE = /\.ya?ml$/;

/** The cubes and views a YAML file declares, by name; none from a file it can't read. */
function declared(file: ModelFile): { kind: 'cube' | 'view'; name: string }[] {
  if (!YAML_FILE.test(file.path) || JINJA.test(file.content)) return [];
  let read: unknown;
  try {
    // Cube reads YAML with js-yaml's defaults: `<<` merges, and no cap on
    // aliases, where `yaml` stops at 100 (research/yaml.md).
    read = parse(file.content, { merge: true, maxAliasCount: -1 });
  } catch {
    return [];
  }
  const namesIn = (list: unknown) =>
    Array.isArray(list)
      ? list.flatMap((each: unknown) => {
          const name = (each as { name?: unknown } | null)?.name;
          return typeof name === 'string' ? [name] : [];
        })
      : [];
  const { cubes, views } = (read ?? {}) as { cubes?: unknown; views?: unknown };
  return [
    ...namesIn(cubes).map((name) => ({ kind: 'cube' as const, name })),
    ...namesIn(views).map((name) => ({ kind: 'view' as const, name })),
  ];
}

export function clashesOf(
  created: readonly ModelFile[],
  stored: readonly ModelFile[],
  compiled: readonly Compiled[] = [],
): CompileError[] {
  const paths = new Set(stored.map((file) => file.path));
  const names = new Map<string, { kind: 'cube' | 'view'; path: string }>();
  for (const file of stored)
    for (const { kind, name } of declared(file))
      if (!names.has(name)) names.set(name, { kind, path: file.path });
  for (const { kind, name, path } of compiled)
    if (!names.has(name)) names.set(name, { kind, path });
  return created.flatMap((file) => {
    const byName = declared(file).flatMap(({ name }) => {
      const found = names.get(name);
      return found === undefined ? [] : [{ name, ...found }];
    });
    // A stored file a name clash already names needs no second word.
    const byPath =
      paths.has(file.path) && !byName.some((clash) => clash.path === file.path)
        ? [{ path: file.path, message: `${file.path} is already in the model store.` }]
        : [];
    return [
      ...byPath,
      ...byName.map(({ name, kind, path }) => ({
        path: file.path,
        message: `\`${name}\` is already a ${kind} in ${path}.`,
      })),
    ];
  });
}
