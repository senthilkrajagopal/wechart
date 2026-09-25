import { isMap, isSeq, LineCounter, parseDocument } from 'yaml';

import type { ModelFile } from '../server';

/**
 * The cubes whose rollups a publish asks Cube to build the joins of (T265,
 * AC-235): each cube a changed YAML file defines with pre-aggregations, one
 * member of it to ask `/v1/sql` for — its first measure, else its first
 * dimension — and its rollups with where each starts.
 *
 * Cube compiles a rollup whose cubes it cannot join, then fails every query
 * on its cube and its refresh worker's whole run; the model compile never
 * builds the join, but `/v1/sql` for a member of the cube does, for every
 * pre-aggregation of it, running nothing (research/cube/rollup-join-paths.md,
 * summary 4–5 and Q5). A file Cube renders first (Jinja), or that isn't YAML,
 * isn't read here, as elsewhere (publish.ts, rollupReferences.ts).
 */

/** Cube renders a YAML file matching this with Jinja first (as publish.ts refuses them). */
const JINJA = /{%|%}|{{|}}/;
const YAML_FILE = /\.ya?ml$/;

export interface RollupOwner {
  readonly path: string;
  readonly cube: string;
  readonly probe: { readonly measures: string[] } | { readonly dimensions: string[] };
  readonly rollups: readonly {
    readonly name: string;
    readonly line?: number;
    /** Whether it names a member of another cube, which it must be joined to. */
    readonly joins: boolean;
  }[];
}

type Value = Record<string, unknown>;

const recordsIn = (value: unknown): Value[] =>
  Array.isArray(value)
    ? value.filter((item): item is Value => typeof item === 'object' && item !== null)
    : [];
const nameOf = (value: Value): string | undefined =>
  typeof value['name'] === 'string' ? value['name'] : undefined;

/** Every member name a rollup writes, in any of its lists. */
function namesIn(rollup: Value): string[] {
  return Object.values(rollup).flatMap((value) =>
    (typeof value === 'string' ? [value] : Array.isArray(value) ? value : []).filter(
      (each): each is string => typeof each === 'string',
    ),
  );
}

export function rollupOwnersOf(files: readonly ModelFile[]): RollupOwner[] {
  return files.flatMap((file) => {
    if (!YAML_FILE.test(file.path) || JINJA.test(file.content)) return [];
    const lines = new LineCounter();
    const document = parseDocument(file.content, { lineCounter: lines, merge: true });
    if (document.errors.length > 0) return [];
    const value: unknown = document.toJS();
    const cubeNodes = document.get('cubes');
    return recordsIn((value as Value | null)?.['cubes']).flatMap((cube, at) => {
      const name = nameOf(cube);
      const rollups = recordsIn(cube['pre_aggregations']);
      if (name === undefined || rollups.length === 0) return [];
      const node = isSeq(cubeNodes) ? cubeNodes.items[at] : undefined;
      const rollupNodes = isMap(node) ? node.get('pre_aggregations') : undefined;
      const measure = recordsIn(cube['measures'])
        .map(nameOf)
        .find((each) => each !== undefined);
      const dimension = recordsIn(cube['dimensions'])
        .map(nameOf)
        .find((each) => each !== undefined);
      if (measure === undefined && dimension === undefined) return [];
      return [
        {
          path: file.path,
          cube: name,
          probe:
            measure !== undefined
              ? { measures: [`${name}.${measure}`] }
              : { dimensions: [`${name}.${dimension ?? ''}`] },
          rollups: rollups.flatMap((rollup, index) => {
            const rollupName = nameOf(rollup);
            if (rollupName === undefined) return [];
            const item = isSeq(rollupNodes) ? rollupNodes.items[index] : undefined;
            const start = isMap(item) ? item.range?.[0] : undefined;
            const joins = namesIn(rollup).some((each) => {
              const [owner] = each.split('.');
              return each.includes('.') && owner !== name && owner !== 'CUBE' && owner !== 'TABLE';
            });
            return [
              {
                name: rollupName,
                ...(start === undefined ? {} : { line: lines.linePos(start).line }),
                joins,
              },
            ];
          }),
        },
      ];
    });
  });
}
