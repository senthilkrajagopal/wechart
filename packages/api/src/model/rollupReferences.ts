import { isMap, isSeq, LineCounter, parseDocument } from 'yaml';

import type { ModelFile } from '../server';

/**
 * The members a model's pre-aggregations name that the model doesn't have
 * (T207, AC-189, added at the user's decision).
 *
 * Cube compiles a rollup naming an unknown member, then fails every query on
 * its cube (research/cube/pre-aggregations.md, "Observed locally"), so a
 * publish is refused on them. The names are resolved as Cube resolved them
 * there, and as its source does (research/cube/rollup-references.md): bare
 * (`count`), `CUBE.count` and `TABLE.count` are the rollup's own cube's, as
 * is the cube's own name; `customers.country` another cube's; and a join path
 * (`CUBE.customers.country`) the member of the cube it ends at; a cube has
 * what it `extends`. Each is held to its list's kind — a time dimension must
 * be a `time` one — and only an index column may carry a time dimension's
 * granularity (`CUBE.ordered_at.month`).
 *
 * Hidden members count — a rollup may name them — so the model is read from
 * its files, not from `/v1/meta`, which leaves them out. What wechart cannot
 * read — a cube defined in code or a template, one extending such a cube, a
 * view, a name built from a template string — it cannot tell about, and says
 * nothing of: a false refusal would stop a model Cube serves.
 */
export interface RollupProblem {
  readonly path: string;
  readonly cube: string;
  readonly preAggregation: string;
  /** Where the rollup starts in its file. */
  readonly line?: number;
  /** The names as the file writes them, each with the list it is in. */
  readonly unknown: readonly { readonly list: string; readonly name: string }[];
}

type Value = Record<string, unknown>;
type Want = 'measure' | 'dimension' | 'time' | 'segment' | 'any';

interface Members {
  readonly measures: ReadonlySet<string>;
  readonly dimensions: ReadonlyMap<string, string | undefined>;
  readonly segments: ReadonlySet<string>;
  /** What the cube extends, as the file writes it. */
  readonly extends: unknown;
}

/** Cube renders a YAML file matching this with Jinja first (as publish.ts refuses them). */
const JINJA = /{%|%}|{{|}}/;
const YAML_FILE = /\.ya?ml$/;

/** Each key a rollup names members under, and what those members must be. */
const LISTS: Readonly<Record<string, Want>> = {
  measures: 'measure',
  measure_references: 'measure',
  measureReferences: 'measure',
  dimensions: 'dimension',
  dimension_references: 'dimension',
  dimensionReferences: 'dimension',
  segments: 'segment',
  segment_references: 'segment',
  segmentReferences: 'segment',
  time_dimension: 'time',
  time_dimension_reference: 'time',
  timeDimension: 'time',
  timeDimensionReference: 'time',
};
/** A name built at compile time (`${CUBE}.count`): not read here. */
const TEMPLATED = /^`|\$\{/;
const TIME_DIMENSIONS = new Set(['time_dimensions', 'timeDimensions']);

const recordsIn = (value: unknown): Value[] =>
  Array.isArray(value)
    ? value.filter((item): item is Value => typeof item === 'object' && item !== null)
    : [];
const namesIn = (value: unknown): string[] =>
  (typeof value === 'string' ? [value] : Array.isArray(value) ? value : []).filter(
    (item): item is string => typeof item === 'string',
  );
const nameOf = (value: Value): string | undefined =>
  typeof value['name'] === 'string' ? value['name'] : undefined;

function membersOf(cube: Value): Members {
  const named = (key: string) =>
    recordsIn(cube[key]).flatMap((item) => {
      const name = nameOf(item);
      return name === undefined ? [] : [[name, item] as const];
    });
  return {
    measures: new Set(named('measures').map(([name]) => name)),
    dimensions: new Map(
      named('dimensions').map(([name, item]) => [
        name,
        typeof item['type'] === 'string' ? item['type'] : undefined,
      ]),
    ),
    segments: new Set(named('segments').map(([name]) => name)),
    extends: cube['extends'],
  };
}

/** A parsed YAML model file, with where each of its cubes' rollups starts. */
interface Read {
  readonly path: string;
  readonly cubes: readonly { value: Value; rollupLines: readonly (number | undefined)[] }[];
  readonly views: readonly string[];
}

function read(file: ModelFile): Read | undefined {
  if (!YAML_FILE.test(file.path) || JINJA.test(file.content)) return undefined;
  const lines = new LineCounter();
  // Read as Cube's js-yaml reads it — `<<` merges and timestamps resolved —
  // as the web's `CUBE_PARSE` does (research/yaml.md): a member a merge
  // defines is one Cube has (research/cube/pre-aggregations.md, "Observed locally").
  const document = parseDocument(file.content, {
    lineCounter: lines,
    merge: true,
    customTags: ['timestamp'],
  });
  if (document.errors.length > 0) return undefined;
  const value: unknown = document.toJS();
  if (typeof value !== 'object' || value === null) return { path: file.path, cubes: [], views: [] };
  const cubeNodes = document.get('cubes');
  const cubes = recordsIn((value as Value)['cubes']).map((cube, at) => {
    const node = isSeq(cubeNodes) ? cubeNodes.items[at] : undefined;
    const rollups = isMap(node) ? node.get('pre_aggregations') : undefined;
    return {
      value: cube,
      rollupLines: isSeq(rollups)
        ? rollups.items.map((item) => {
            const start = isMap(item) ? item.range?.[0] : undefined;
            return start === undefined ? undefined : lines.linePos(start).line;
          })
        : [],
    };
  });
  const views = recordsIn((value as Value)['views']).flatMap((view) => nameOf(view) ?? []);
  return { path: file.path, cubes, views };
}

export function rollupProblemsOf(files: readonly ModelFile[]): RollupProblem[] {
  const reads = files.map(read);
  /** A file wechart can't read may define any cube. */
  const opaque = reads.some((each) => each === undefined);
  const model = new Map<string, Members>();
  const views = new Set<string>();
  for (const each of reads) {
    for (const { value } of each?.cubes ?? []) {
      const name = nameOf(value);
      if (name !== undefined) model.set(name, membersOf(value));
    }
    for (const view of each?.views ?? []) views.add(view);
  }

  /** Whether the cube, with what it extends, has the member: or `undefined`, when that can't be told. */
  const has = (
    owner: string,
    member: string,
    want: Want,
    seen = new Set<string>(),
  ): boolean | undefined => {
    const cube = model.get(owner);
    if (cube === undefined) return opaque || views.has(owner) ? undefined : false;
    const type = cube.dimensions.get(member);
    const found =
      ((want === 'measure' || want === 'any') && cube.measures.has(member)) ||
      ((want === 'dimension' || want === 'any') && cube.dimensions.has(member)) ||
      (want === 'time' && cube.dimensions.has(member) && (type === undefined || type === 'time')) ||
      ((want === 'segment' || want === 'any') && cube.segments.has(member));
    if (found) return true;
    // Its own member, of another kind: not one inherited.
    if (cube.measures.has(member) || cube.dimensions.has(member) || cube.segments.has(member))
      return false;
    if (cube.extends === undefined) return false;
    // Extended by a name written otherwise, or round in a circle: not told here.
    if (typeof cube.extends !== 'string' || seen.has(owner)) return undefined;
    seen.add(owner);
    return has(cube.extends, member, want, seen);
  };

  /** Whether a name, as the rollup on `cube` writes it, is in the model — or can't be told not to be. */
  const known = (cube: string, name: string, want: Want, granular: boolean): boolean => {
    if (TEMPLATED.test(name)) return true;
    const parts = name.split('.');
    if (parts[0] === 'CUBE' || parts[0] === 'TABLE') parts[0] = cube;
    if (parts.length === 1) parts.unshift(cube);
    const [owner = '', member = ''] = parts.slice(-2);
    if (has(owner, member, want) !== false) return true;
    if (!granular || parts.length < 3) return false;
    // An index column's time dimension and its granularity: `CUBE.ordered_at.month`.
    const [timeOwner = '', time = ''] = parts.slice(-3, -1);
    return has(timeOwner, time, 'time') !== false;
  };

  const problems: RollupProblem[] = [];
  for (const each of reads) {
    for (const { value, rollupLines } of each?.cubes ?? []) {
      const cube = nameOf(value);
      if (cube === undefined) continue;
      recordsIn(value['pre_aggregations']).forEach((rollup, at) => {
        const unknown: { list: string; name: string }[] = [];
        const check = (list: string, names: readonly string[], want: Want, granular: boolean) => {
          for (const name of names)
            // The alias form of an index column (`orders__created_at_day`) is not read here.
            if (!name.includes('__') && !known(cube, name, want, granular))
              unknown.push({ list, name });
        };
        for (const [key, given] of Object.entries(rollup)) {
          const want = LISTS[key];
          if (want !== undefined) check(key, namesIn(given), want, false);
          else if (TIME_DIMENSIONS.has(key))
            check(
              key,
              recordsIn(given).flatMap((item) => namesIn(item['dimension'])),
              'time',
              false,
            );
          else if (key === 'indexes') {
            const indexes = Array.isArray(given)
              ? recordsIn(given).map((index) => [nameOf(index) ?? '', index] as const)
              : typeof given === 'object' && given !== null
                ? Object.entries(given as Value).flatMap(([name, index]) =>
                    typeof index === 'object' && index !== null
                      ? [[name, index as Value] as const]
                      : [],
                  )
                : [];
            for (const [name, index] of indexes)
              check(`index ${name}`, namesIn(index['columns']), 'any', true);
          }
        }
        if (unknown.length === 0) return;
        const line = rollupLines[at];
        problems.push({
          path: each?.path ?? '',
          cube,
          preAggregation: nameOf(rollup) ?? String(at + 1),
          ...(line === undefined ? {} : { line }),
          unknown,
        });
      });
    }
  }
  return problems;
}
