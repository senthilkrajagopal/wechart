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
 */

/** Cube renders a YAML file matching this with Jinja first (as publish.ts refuses them). */
const JINJA = /{%|%}|{{|}}/;
const YAML_FILE = /\.ya?ml$/;

/** The cubes and views a YAML file declares, by name; none from a file it can't read. */
function declared(file: ModelFile): { kind: 'cube' | 'view'; name: string }[] {
  if (!YAML_FILE.test(file.path) || JINJA.test(file.content)) return [];
  let read: unknown;
  try {
    // Cube reads YAML with js-yaml's defaults, `<<` merges among them (research/yaml.md).
    read = parse(file.content, { merge: true });
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
): CompileError[] {
  const paths = new Set(stored.map((file) => file.path));
  const names = new Map<string, { kind: 'cube' | 'view'; path: string }>();
  for (const file of stored)
    for (const { kind, name } of declared(file))
      if (!names.has(name)) names.set(name, { kind, path: file.path });
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
