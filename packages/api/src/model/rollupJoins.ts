import { isMap, isSeq, LineCounter, parseDocument } from 'yaml';

import type { ModelFile } from '../server';
import type { CompileError } from './validate';

/**
 * The cubes whose rollups a publish asks Cube to build the joins of (T265,
 * AC-235): each cube a YAML file defines with pre-aggregations, one member of
 * it to ask `/v1/sql` for, and its rollups with where each starts and the
 * other cubes each names.
 *
 * Cube compiles a rollup whose cubes it cannot join, then fails every query
 * on its cube and its refresh worker's whole run; the model compile never
 * builds the join, but `/v1/sql` for a member of the cube does, for every
 * pre-aggregation of it, running nothing — asked for a member whose `sql`
 * touches only that cube, so the plan holds only it
 * (research/cube/rollup-join-paths.md, summary 4–5 and Q5). A file Cube
 * renders first (Jinja), or that isn't YAML, isn't read here, as elsewhere
 * (publish.ts, rollupReferences.ts).
 */

/** Cube renders a YAML file matching this with Jinja first (as publish.ts refuses them). */
const JINJA = /{%|%}|{{|}}/;
const YAML_FILE = /\.ya?ml$/;
/** Cube camelizes a cube's keys, so either spelling is a cube's rollups (research/cube/data-modeling.md). */
const ROLLUPS = ['pre_aggregations', 'preAggregations'];
/** The keys a rollup names members, or other cubes' rollups, under (as rollupReferences.ts reads them). */
const MEMBER_LISTS = [
  'measures',
  'measure_references',
  'measureReferences',
  'dimensions',
  'dimension_references',
  'dimensionReferences',
  'segments',
  'segment_references',
  'segmentReferences',
  'time_dimension',
  'time_dimension_reference',
  'timeDimension',
  'timeDimensionReference',
  'rollups',
  'rollup_references',
  'rollupReferences',
];
const TIME_DIMENSIONS = ['time_dimensions', 'timeDimensions'];
/** `{CUBE}`, `{FILTER_PARAMS…}`, `{SECURITY_CONTEXT…}`: the context, not another cube. */
const CONTEXT = /^[A-Z_]+$/;

export interface RollupOwner {
  readonly path: string;
  readonly cube: string;
  readonly probe: { readonly measures: string[] } | { readonly dimensions: string[] };
  readonly rollups: readonly {
    readonly name: string;
    readonly line?: number;
    /** The other cubes it names members of — along a join path too — which it must be joined to. */
    readonly cubes: readonly string[];
  }[];
}

type Value = Record<string, unknown>;

const recordsIn = (value: unknown): Value[] =>
  Array.isArray(value)
    ? value.filter((item): item is Value => typeof item === 'object' && item !== null)
    : [];
const stringsIn = (value: unknown): string[] =>
  (typeof value === 'string' ? [value] : Array.isArray(value) ? value : []).filter(
    (each): each is string => typeof each === 'string',
  );
const nameOf = (value: Value): string | undefined =>
  typeof value['name'] === 'string' ? value['name'] : undefined;
const rollupsOf = (cube: Value): { key: string; rollups: Value[] } | undefined => {
  const key = ROLLUPS.find((each) => Array.isArray(cube[each]));
  return key === undefined ? undefined : { key, rollups: recordsIn(cube[key]) };
};

/** The cubes a member's `sql` reaches into, other than its own: `{user.city}`, `{user}.id`. */
function cubesReached(sql: unknown, own: string): string[] {
  if (typeof sql !== 'string') return [];
  return [...sql.matchAll(/\{(\w+)(?:\.|\}\.)/g)]
    .map(([, cube = '']) => cube)
    .filter((cube) => cube !== own && !CONTEXT.test(cube));
}

/** Every name a rollup writes a member or another cube's rollup by. */
function namesIn(rollup: Value): string[] {
  return [
    ...MEMBER_LISTS.flatMap((key) => stringsIn(rollup[key])),
    ...TIME_DIMENSIONS.flatMap((key) =>
      recordsIn(rollup[key]).flatMap((item) => stringsIn(item['dimension'])),
    ),
  ];
}

/** A name as the rollup on `cube` writes it: the cubes along its path, and its own member if it is one. */
function resolved(cube: string, name: string): { path: string[]; own?: string } {
  const parts = name.split('.');
  if (parts[0] === 'CUBE' || parts[0] === 'TABLE') parts[0] = cube;
  if (parts.length === 1) parts.unshift(cube);
  const path = parts.slice(0, -1);
  return path.length === 1 && path[0] === cube ? { path, own: parts[1] ?? '' } : { path };
}

/**
 * The member to ask about: a `count` of the cube's own, which has no `sql`;
 * else one whose `sql` touches only this cube, a measure before a dimension;
 * else, for a cube whose members are all inherited, one its rollups name of it.
 */
function probeOf(
  name: string,
  cube: Value,
  rollups: readonly Value[],
): RollupOwner['probe'] | undefined {
  const measures = recordsIn(cube['measures']);
  const dimensions = recordsIn(cube['dimensions']);
  const alone = (member: Value) => cubesReached(member['sql'], name).length === 0;
  const count = measures.find(
    (member) => member['type'] === 'count' && nameOf(member) && alone(member),
  );
  const measure = count ?? measures.find((member) => nameOf(member) && alone(member));
  if (measure !== undefined) return { measures: [`${name}.${nameOf(measure) ?? ''}`] };
  const dimension = dimensions.find((member) => nameOf(member) && alone(member));
  if (dimension !== undefined) return { dimensions: [`${name}.${nameOf(dimension) ?? ''}`] };
  for (const [keys, kind] of [
    [['measures', 'measure_references', 'measureReferences'], 'measures'],
    [['dimensions', 'dimension_references', 'dimensionReferences'], 'dimensions'],
  ] as const) {
    for (const rollup of rollups) {
      const own = keys
        .flatMap((key) => stringsIn(rollup[key]))
        .map((each) => resolved(name, each).own)
        .find((each) => each !== undefined && each !== '');
      if (own !== undefined)
        return kind === 'measures'
          ? { measures: [`${name}.${own}`] }
          : { dimensions: [`${name}.${own}`] };
    }
  }
  return undefined;
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
      const listed = rollupsOf(cube);
      if (name === undefined || listed === undefined || listed.rollups.length === 0) return [];
      const probe = probeOf(name, cube, listed.rollups);
      if (probe === undefined) return [];
      const node = isSeq(cubeNodes) ? cubeNodes.items[at] : undefined;
      const rollupNodes = isMap(node) ? node.get(listed.key) : undefined;
      /** An own member's `sql` joins what it reaches into, as Cube adds it (Q5's rule, step 3). */
      const reachedBy = new Map(
        [...recordsIn(cube['measures']), ...recordsIn(cube['dimensions'])].flatMap((member) => {
          const own = nameOf(member);
          return own === undefined ? [] : [[own, cubesReached(member['sql'], name)] as const];
        }),
      );
      return [
        {
          path: file.path,
          cube: name,
          probe,
          rollups: listed.rollups.flatMap((rollup, index) => {
            const rollupName = nameOf(rollup);
            if (rollupName === undefined) return [];
            const item = isSeq(rollupNodes) ? rollupNodes.items[index] : undefined;
            const start = isMap(item) ? item.range?.[0] : undefined;
            const cubes = new Set(
              namesIn(rollup).flatMap((each) => {
                const { path, own } = resolved(name, each);
                return own === undefined ? path : (reachedBy.get(own) ?? []);
              }),
            );
            cubes.delete(name);
            return [
              {
                name: rollupName,
                ...(start === undefined ? {} : { line: lines.linePos(start).line }),
                cubes: [...cubes],
              },
            ];
          }),
        },
      ];
    });
  });
}

/**
 * The rollups Cube's refusal is about. Its text names cubes, not a rollup —
 * `Can't find join path to join 'user', 'base'`, a path as `'a,b'` (Q3; rule
 * step 7) — so it is put on the rollups naming those cubes; failing that, on
 * those naming any other cube; failing that, on all of the cube's.
 */
export function refusedRollupsOf(
  owner: RollupOwner,
  reason: string,
): RollupOwner['rollups'][number][] {
  // After its own words, whose "Can't" has a quote of its own.
  const listed = /join path to join (.*)$/.exec(reason)?.[1] ?? '';
  const named = new Set(
    [...listed.matchAll(/'([^']+)'/g)].flatMap(([, cubes = '']) => cubes.split(',')),
  );
  const naming = owner.rollups.filter((rollup) => rollup.cubes.some((cube) => named.has(cube)));
  if (naming.length > 0) return naming;
  const joining = owner.rollups.filter((rollup) => rollup.cubes.length > 0);
  return joining.length > 0 ? joining : [...owner.rollups];
}

/**
 * Cube's refusal to plan a cube's rollups, on the rollups it is about (T265,
 * AC-235): each on its line in its file, with Cube's reason, and said as a
 * join Cube can't make where it is one. Asked of Cube under a draft, or of
 * xcube's check (T445), the words are the same.
 */
export function joinRefusalsOf(owner: RollupOwner, reason: string): CompileError[] {
  const said = reason.replace(/\.$/, '');
  return refusedRollupsOf(owner, said).map((rollup) => ({
    path: owner.path,
    ...(rollup.line === undefined ? {} : { line: rollup.line }),
    message: /Can't find join path/.test(said)
      ? `Pre-aggregation ${rollup.name} can't be built: Cube cannot join its cubes. ${said}.`
      : `Pre-aggregation ${rollup.name} can't be built: ${said}.`,
    preAggregation: { cube: owner.cube, name: rollup.name },
  }));
}
