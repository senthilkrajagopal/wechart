import { createContext } from 'react';
import { parseDocument } from 'yaml';

import { CUBE_PARSE } from '../objects';

/**
 * What a reference field may name (T235, AC-224; direction.md §7b), as the
 * prototype scopes its pickers (docs/design/prototype/model.js, `options`):
 * read from the model's files, the cube's own members by their bare names
 * and another cube's by `cube.member` — Cube's references outside SQL
 * (research/cube/data-modeling.md, Y.18).
 */
export type MemberScope =
  /** Dimensions and measures, as drill members are. */
  | 'members'
  | 'dimensions'
  /** Dimensions of type `time`. */
  | 'time'
  | 'measures'
  /** The cube's own segments. */
  | 'segments'
  /** Rollups: the cube's own, and another cube's for a rollup join (Y.13). */
  | 'pre-aggregations'
  /** Every other cube: a join's target. */
  | 'cubes'
  /**
   * A view's cube entry's members, from the last cube of its `join_path`,
   * by bare name (Y.10a: measures, dimensions, segments and hierarchies).
   */
  | 'path'
  /**
   * A view's cube entry's `join_path`: a cube, or a path from it that follows
   * its directed joins, `root.cube2.cube3` (Y.10a; T493).
   */
  | 'join-paths';

export interface CubeMembers {
  readonly dimensions: readonly string[];
  readonly time: readonly string[];
  readonly measures: readonly string[];
  readonly segments: readonly string[];
  readonly hierarchies: readonly string[];
  readonly preAggregations: readonly string[];
  /** The cubes it joins to, by the join's name, its target (Y.5). */
  readonly joins: readonly string[];
}

export type MemberIndex = ReadonlyMap<string, CubeMembers>;

type Value = Record<string, unknown>;

const isPlain = (value: unknown): value is Value =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const itemsOf = (value: unknown): Value[] =>
  Array.isArray(value) ? (value as unknown[]).filter(isPlain) : [];

const namesOf = (value: unknown, keep: (item: Value) => boolean = () => true): string[] =>
  itemsOf(value)
    .filter(keep)
    .map((item) => item['name'])
    .filter((name): name is string => typeof name === 'string');

/**
 * Every cube's members, from the files that parse; a file that does not adds
 * none. A cube that `extends` another has that one's members too, before its
 * own (research/cube/data-modeling.md, Y.3 `extends`: "Inherits members").
 */
export function memberIndexOf(
  files: readonly { readonly path: string; readonly content: string }[],
): MemberIndex {
  const own = new Map<string, CubeMembers>();
  const bases = new Map<string, string>();
  for (const file of files) {
    let model: unknown;
    try {
      const document = parseDocument(file.content, CUBE_PARSE);
      if (document.errors.length > 0) continue;
      model = document.toJS();
    } catch {
      continue;
    }
    if (!isPlain(model)) continue;
    for (const cube of itemsOf(model['cubes'])) {
      const name = cube['name'];
      if (typeof name !== 'string') continue;
      own.set(name, {
        dimensions: namesOf(cube['dimensions']),
        time: namesOf(cube['dimensions'], (dimension) => dimension['type'] === 'time'),
        measures: namesOf(cube['measures']),
        segments: namesOf(cube['segments']),
        hierarchies: namesOf(cube['hierarchies']),
        preAggregations: namesOf(cube['pre_aggregations']),
        joins: namesOf(cube['joins']),
      });
      if (typeof cube['extends'] === 'string') bases.set(name, cube['extends']);
    }
  }
  const index = new Map<string, CubeMembers>();
  /** A cube's members with its bases', each once; a cycle stops where it closes. */
  const resolve = (name: string, seen: ReadonlySet<string>): CubeMembers | undefined => {
    const members = own.get(name);
    if (members === undefined) return undefined;
    const base = bases.get(name);
    const inherited =
      base === undefined || seen.has(base) ? undefined : resolve(base, new Set([...seen, base]));
    if (inherited === undefined) return members;
    const merge = (key: keyof CubeMembers) => [...new Set([...inherited[key], ...members[key]])];
    return {
      dimensions: merge('dimensions'),
      time: merge('time'),
      measures: merge('measures'),
      segments: merge('segments'),
      hierarchies: merge('hierarchies'),
      preAggregations: merge('preAggregations'),
      joins: merge('joins'),
    };
  };
  for (const name of own.keys()) {
    const members = resolve(name, new Set([name]));
    if (members !== undefined) index.set(name, members);
  }
  return index;
}

/**
 * The member a reference names, as the pickers compare them: the cube's own
 * members written `CUBE.x`, `TABLE.x` or `<cube>.x` are its bare `x`
 * (research/cube/rollup-references.md, Summary).
 */
export function canonicalOf(name: string, scope: PickerScope): string {
  for (const prefix of ['CUBE.', 'TABLE.', ...(scope.cube === undefined ? [] : [`${scope.cube}.`])])
    if (name.startsWith(prefix)) return name.slice(prefix.length);
  return name;
}

/** The model the form's pickers read, and the cube the form is of — none for a view. */
export interface PickerScope {
  readonly index: MemberIndex;
  readonly cube: string | undefined;
}

export const PickerScopeContext = createContext<PickerScope>({
  index: new Map(),
  cube: undefined,
});

type Lists = (members: CubeMembers) => readonly string[];

/**
 * Past this many paths — a dense join graph — each cube lists only its
 * shortest path to each cube it reaches. wechart's bound on the picker's
 * length, not a Cube rule: every cube a root reaches is still offered (T493).
 */
const PATH_LIMIT = 2000;

type JoinGraph = ReadonlyMap<string, readonly string[]>;

/** Every path along declared joins, a cube once per path; undefined past the limit. */
function everyPathOf(graph: JoinGraph): string[] | undefined {
  const paths: string[] = [];
  const walk = (path: readonly string[]): boolean => {
    paths.push(path.join('.'));
    if (paths.length > PATH_LIMIT) return false;
    for (const next of graph.get(path[path.length - 1] ?? '') ?? [])
      if (!path.includes(next) && !walk([...path, next])) return false;
    return true;
  };
  for (const cube of graph.keys()) if (!walk([cube])) return undefined;
  return paths;
}

/** Each cube, then its shortest path along declared joins to each cube it reaches. */
function shortestPathsOf(graph: JoinGraph): string[] {
  return [...graph.keys()].flatMap((root) => {
    const found = [[root]];
    const seen = new Set([root]);
    for (let at = 0; at < found.length; at += 1) {
      const path = found[at] ?? [];
      for (const next of graph.get(path[path.length - 1] ?? '') ?? []) {
        if (seen.has(next)) continue;
        seen.add(next);
        found.push([...path, next]);
      }
    }
    return found.map((path) => path.join('.'));
  });
}

/** The last model's paths: the index is read again on each keystroke, its joins rarely change. */
let lastPaths: { readonly key: string; readonly paths: string[] } | undefined;

/**
 * Every join path a view may start from: each cube, then each path from it
 * that follows its directed joins to a cube the model has, a cube at most
 * once per path (research/cube/data-modeling.md, Y.10a: "Follows directed
 * joins from the root"). Cube also takes a hop the joins reach only through
 * other cubes (rollup-join-paths.md, `buildJoinTreeForRoot`); those are left
 * out, as every cube they end on is listed along its joins, and a path
 * already written is kept as it is.
 */
function joinPathsOf(index: MemberIndex): string[] {
  const edges = [...index].map(
    ([cube, members]) =>
      [
        cube,
        [...new Set(members.joins)].filter((next) => next !== cube && index.has(next)),
      ] as const,
  );
  const key = JSON.stringify(edges);
  if (lastPaths?.key === key) return lastPaths.paths;
  const graph = new Map(edges);
  const paths = everyPathOf(graph) ?? shortestPathsOf(graph);
  lastPaths = { key, paths };
  return paths;
}

/** The cube's own, bare, then every other cube's, qualified. */
function ownThenOthers(scope: PickerScope, lists: Lists): string[] {
  const own = scope.cube === undefined ? undefined : scope.index.get(scope.cube);
  return [
    ...(own === undefined ? [] : lists(own)),
    ...[...scope.index.entries()]
      .filter(([name]) => name !== scope.cube)
      .flatMap(([name, members]) => lists(members).map((member) => `${name}.${member}`)),
  ];
}

/** What a field of this scope may name, where `owner` is the object the field is a key of. */
export function optionsFor(
  what: MemberScope,
  scope: PickerScope,
  owner: Readonly<Value> = {},
): string[] {
  switch (what) {
    case 'members':
      return ownThenOthers(scope, (members) => [...members.dimensions, ...members.measures]);
    case 'dimensions':
      return ownThenOthers(scope, (members) => members.dimensions);
    case 'time':
      return ownThenOthers(scope, (members) => members.time);
    case 'measures':
      return ownThenOthers(scope, (members) => members.measures);
    // A joined cube's by `cube.segment` too (rollup-references.md).
    case 'segments':
      return ownThenOthers(scope, (members) => members.segments);
    // Never the rollup being edited: a rollup joins others.
    case 'pre-aggregations':
      return ownThenOthers(scope, (members) => members.preAggregations).filter(
        (name) => name !== owner['name'],
      );
    case 'cubes':
      return [...scope.index.keys()].filter((name) => name !== scope.cube);
    case 'join-paths':
      return joinPathsOf(scope.index);
    case 'path': {
      const path = owner['join_path'];
      const last = typeof path === 'string' ? path.split('.').pop() : undefined;
      const members = last === undefined ? undefined : scope.index.get(last);
      return members === undefined
        ? []
        : [...members.dimensions, ...members.measures, ...members.segments, ...members.hierarchies];
    }
  }
}
