import { parseDocument, type DocumentOptions, type ParseOptions, type SchemaOptions } from 'yaml';

/**
 * What a model file defines (T137, AC-131): its cubes and views, and each
 * cube's measures, dimensions, segments, hierarchies, joins and
 * pre-aggregations — read from its text as Cube reads it.
 */
export type MemberKind =
  | 'measure'
  | 'dimension'
  | 'segment'
  | 'hierarchy'
  | 'join'
  | 'pre-aggregation'
  /** A view's member taken from one of its cubes, by path: `orders.count`, `orders.*`. */
  | 'include';

export interface ModelObject {
  readonly kind: 'cube' | 'view';
  readonly name: string;
  readonly members: readonly { readonly kind: MemberKind; readonly name: string }[];
}

export interface FileObjects {
  readonly objects: readonly ModelObject[];
  /** Why the file could not be read, with the line; absent when it could. */
  readonly problem?: string;
  /**
   * What a file is when it is not plain YAML, whose objects its text does
   * not list: code, or a Jinja template Cube renders before reading it.
   */
  readonly code?: 'JavaScript' | 'Python' | 'Jinja';
}

/**
 * Cube renders a YAML file with Jinja first if it matches this, and every
 * `.jinja` file (research/cube/data-modeling.md, "How each file type is
 * compiled"); `{#` comments too (research/yaml.md, "Jinja files").
 */
const JINJA = /{%|%}|{{|}}|{#/;

/**
 * Cube reads YAML with js-yaml's defaults, which resolve `<<` merges and
 * unquoted timestamps; `yaml` is told to do the same (research/yaml.md,
 * `CUBE_PARSE`), so a file reads here as it reads in Cube.
 */
export const CUBE_PARSE: ParseOptions & DocumentOptions & SchemaOptions = {
  merge: true,
  customTags: ['timestamp'],
  keepSourceTokens: true,
  prettyErrors: true,
};

/** A cube's member lists, in the order the listing shows them. */
const MEMBER_LISTS: readonly [key: string, kind: MemberKind][] = [
  ['measures', 'measure'],
  ['dimensions', 'dimension'],
  ['segments', 'segment'],
  ['hierarchies', 'hierarchy'],
  ['joins', 'join'],
  ['pre_aggregations', 'pre-aggregation'],
];

const named = (entries: unknown): string[] =>
  (Array.isArray(entries) ? entries : [])
    .map((entry) => (entry as { name?: unknown } | null)?.name)
    .filter((name): name is string => typeof name === 'string');

/**
 * What a view takes from its cubes (research Y.10a): each `cubes` entry's
 * `includes` — names, `{name, …}` objects, or `"*"` — by the join path.
 */
function includedBy(view: Record<string, unknown>): string[] {
  const cubes = Array.isArray(view['cubes']) ? (view['cubes'] as unknown[]) : [];
  return cubes.flatMap((entry) => {
    const { join_path: path, includes } = (entry ?? {}) as Record<string, unknown>;
    if (typeof path !== 'string') return [];
    if (includes === '*') return [`${path}.*`];
    return (Array.isArray(includes) ? includes : [])
      .map((each) => (typeof each === 'string' ? each : (each as { name?: unknown } | null)?.name))
      .filter((name): name is string => typeof name === 'string')
      .map((name) => `${path}.${name}`);
  });
}

const membersOf = (object: Record<string, unknown>) =>
  MEMBER_LISTS.flatMap(([key, kind]) => named(object[key]).map((name) => ({ kind, name })));

const namedObjects = (list: unknown) =>
  (Array.isArray(list) ? list : []).filter(
    (each): each is Record<string, unknown> =>
      each !== null &&
      typeof each === 'object' &&
      typeof (each as { name?: unknown }).name === 'string',
  );

export function objectsOf(path: string, content: string): FileObjects {
  if (path.endsWith('.js')) return { objects: [], code: 'JavaScript' };
  if (path.endsWith('.py')) return { objects: [], code: 'Python' };
  if (path.endsWith('.jinja') || JINJA.test(content)) return { objects: [], code: 'Jinja' };

  let document;
  try {
    // Not throw-free on every input (research/yaml.md, gotchas), so guarded.
    document = parseDocument(content, CUBE_PARSE);
  } catch (error) {
    return { objects: [], problem: error instanceof Error ? error.message : String(error) };
  }
  const [error] = document.errors;
  if (error !== undefined) {
    const line = error.linePos?.[0].line;
    const first = error.message.split('\n')[0] ?? error.message;
    return {
      objects: [],
      problem: line === undefined ? first : `line ${String(line)}: ${first}`,
    };
  }

  let model: { cubes?: unknown; views?: unknown };
  try {
    model = (document.toJS() ?? {}) as { cubes?: unknown; views?: unknown };
  } catch (error) {
    // Some problems show only in reading the values (research/yaml.md):
    // this file says so, and the rest of the listing still reads.
    return { objects: [], problem: error instanceof Error ? error.message : String(error) };
  }
  return {
    objects: [
      ...namedObjects(model.cubes).map((cube) => ({
        kind: 'cube' as const,
        name: cube['name'] as string,
        members: membersOf(cube),
      })),
      ...namedObjects(model.views).map((view) => ({
        kind: 'view' as const,
        name: view['name'] as string,
        members: [
          ...membersOf(view),
          ...includedBy(view).map((name) => ({ kind: 'include' as const, name })),
        ],
      })),
    ],
  };
}
