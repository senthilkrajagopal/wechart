import { isMap, isScalar, isSeq, parseDocument, type Document, type YAMLMap } from 'yaml';

import { CUBE_PARSE } from './model/objects';
import { nameKey } from './names';

/**
 * How an imported file's models are bound to the data sources chosen for
 * those the file holds (T721, AC-358; from T671's WIP). A cube names its data
 * source by `data_source` or `dataSource`, its own or through a `<<` merge;
 * one naming none, and extending no other, binds to `default` (research
 * `xcube-slice-6.md`). A cube extending another takes its parent's, which is
 * the parent's to say. The file is read as Cube reads it (`CUBE_PARSE`;
 * research `yaml.md`, "Defaults differ from Cube's parser").
 *
 * Mapped to an existing data source of another name, each cube naming the
 * file's one is given the name of the one chosen, in the key it uses, or in
 * `data_source` beside its name where it names it through a merge; so it
 * binds to that one. Names compare in any case (R71), and the one chosen's
 * own spelling is written. A data source created for the import keeps its own
 * name, so its cubes are as they were. Only those values change: the rest of
 * the file keeps its text, layout and comments (research `yaml.md`, "Round-trip
 * is a re-render").
 */
export const DEFAULT_SOURCE = 'default';

const textOf = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;

/** A file's cubes, each with its keys as Cube resolves them; none where it doesn't read. */
function cubesOf(content: string): {
  readonly node: YAMLMap;
  readonly resolved: Record<string, unknown>;
}[] {
  let document: Document;
  try {
    document = parseDocument(content, CUBE_PARSE);
  } catch {
    return [];
  }
  if (document.errors.length > 0 || !isMap(document.contents)) return [];
  const cubes = document.contents.get('cubes');
  if (!isSeq(cubes)) return [];
  return (cubes.items as unknown[]).flatMap((item) => {
    if (!isMap(item)) return [];
    try {
      const resolved: unknown = item.toJS(document);
      return resolved !== null && typeof resolved === 'object'
        ? [{ node: item, resolved: resolved as Record<string, unknown> }]
        : [];
    } catch {
      return [];
    }
  });
}

/** The data source a cube names, as Cube resolves its keys; none where it names none. */
const namedIn = (resolved: Record<string, unknown>) =>
  textOf(resolved['data_source']) ?? textOf(resolved['dataSource']);

/**
 * The data source each cube of a model file binds to by its own say: the one
 * it names, or `default` for one naming none and extending none. A cube
 * extending another is left out: its parent says.
 */
export function sourcesNamedIn(content: string): { cube: string; source: string }[] {
  return cubesOf(content).flatMap(({ resolved }) => {
    const cube = textOf(resolved['name']);
    if (cube === undefined) return [];
    const source = namedIn(resolved);
    if (source !== undefined) return [{ cube, source }];
    return textOf(resolved['extends']) === undefined ? [{ cube, source: DEFAULT_SOURCE }] : [];
  });
}

/** A change to the text: what lies between two offsets, replaced. */
interface Edit {
  readonly from: number;
  readonly to: number;
  readonly text: string;
}

/**
 * The edit giving a cube a data source: its own key's value replaced, or a
 * `data_source` line put beneath its name, at its name's column.
 */
function editOf(content: string, cube: YAMLMap, name: string): Edit | undefined {
  for (const key of ['data_source', 'dataSource'] as const) {
    const node = cube.get(key, true);
    if (isScalar(node) && textOf(node.value) !== undefined && node.range != null)
      return { from: node.range[0], to: node.range[1], text: name };
  }
  const pair = cube.items.find((each) => isScalar(each.key) && each.key.value === 'name');
  if (pair === undefined || !isScalar(pair.key) || !isScalar(pair.value)) return undefined;
  const [start] = pair.key.range ?? [];
  const [, valueEnd] = pair.value.range ?? [];
  if (start === undefined || valueEnd === undefined) return undefined;
  const column = start - (content.lastIndexOf('\n', start - 1) + 1);
  const lineEnd = content.indexOf('\n', valueEnd);
  const line = `${' '.repeat(column)}data_source: ${name}`;
  return lineEnd === -1
    ? { from: content.length, to: content.length, text: `\n${line}` }
    : { from: lineEnd + 1, to: lineEnd + 1, text: `${line}\n` };
}

/**
 * A model file rebound to the names chosen (`chosen`: a data source of the
 * file, by its name, to the name of the one it was mapped to or created as):
 * each cube naming one, in any case, given the name chosen for it, and each
 * naming none, and extending none, the name chosen for `default` where that
 * differs. The file as it was where nothing changes, or where it doesn't read
 * as YAML (a template: `templateNeedsBinding`).
 */
export function rebound(content: string, chosen: ReadonlyMap<string, string>): string {
  const byKey = new Map([...chosen].map(([from, to]) => [nameKey(from), to]));
  if (byKey.size === 0) return content;
  const edits: Edit[] = [];
  for (const { node, resolved } of cubesOf(content)) {
    if (textOf(resolved['name']) === undefined) continue;
    const named = namedIn(resolved);
    const to =
      named !== undefined
        ? byKey.get(nameKey(named))
        : textOf(resolved['extends']) === undefined
          ? byKey.get(DEFAULT_SOURCE)
          : undefined;
    if (to === undefined || to === (named ?? DEFAULT_SOURCE)) continue;
    const edit = editOf(content, node, to);
    if (edit !== undefined) edits.push(edit);
  }
  // From the end, so each edit's offsets still hold.
  return edits
    .sort((a, b) => b.from - a.from)
    .reduce((text, edit) => text.slice(0, edit.from) + edit.text + text.slice(edit.to), content);
}

/**
 * Of a Jinja template's data sources, the first it names that would need
 * another name (T721's review): a template isn't YAML until Cube renders it,
 * so it isn't rebound here. `[file's name, name chosen]`, or none.
 */
export function templateNeedsBinding(
  content: string,
  chosen: ReadonlyMap<string, string>,
): readonly [string, string] | undefined {
  for (const [from, to] of chosen) {
    const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const written = content.match(new RegExp(`(?<![A-Za-z0-9_])${escaped}(?![A-Za-z0-9_])`, 'gi'));
    if (written?.some((each) => each !== to) === true) return [from, to];
  }
  return undefined;
}
