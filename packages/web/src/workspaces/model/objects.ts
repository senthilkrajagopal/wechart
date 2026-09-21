import { parseDocument, type DocumentOptions, type ParseOptions, type SchemaOptions } from 'yaml';

/**
 * What a model file defines (T137, AC-131): its cubes and views, and each
 * cube's measures, dimensions, segments, hierarchies, joins and
 * pre-aggregations — read from its text as Cube reads it.
 */
export type MemberKind =
  'measure' | 'dimension' | 'segment' | 'hierarchy' | 'join' | 'pre-aggregation';

export interface ModelObject {
  readonly kind: 'cube' | 'view';
  readonly name: string;
  readonly members: readonly { readonly kind: MemberKind; readonly name: string }[];
}

export interface FileObjects {
  readonly objects: readonly ModelObject[];
  /** Why the file could not be read, with the line; absent when it could. */
  readonly problem?: string;
  /** The language of a file that is code, not YAML, whose objects its text does not list. */
  readonly code?: 'JavaScript' | 'Python';
}

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

export function objectsOf(path: string, content: string): FileObjects {
  if (path.endsWith('.js')) return { objects: [], code: 'JavaScript' };
  if (path.endsWith('.py')) return { objects: [], code: 'Python' };

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

  const model = (document.toJS() ?? {}) as { cubes?: unknown; views?: unknown };
  const cubes = (Array.isArray(model.cubes) ? model.cubes : []) as Record<string, unknown>[];
  return {
    objects: [
      ...cubes
        .filter((cube) => typeof cube?.['name'] === 'string')
        .map((cube) => ({
          kind: 'cube' as const,
          name: cube['name'] as string,
          members: MEMBER_LISTS.flatMap(([key, kind]) =>
            named(cube[key]).map((name) => ({ kind, name })),
          ),
        })),
      ...named(model.views).map((name) => ({ kind: 'view' as const, name, members: [] })),
    ],
  };
}
