import { isAlias, isMap, isNode, isSeq, parseDocument, type Document } from 'yaml';

import { CUBE_PARSE } from './objects';

/**
 * The form and the YAML view kept in step (T139, AC-133). The file's text is
 * the one truth: a form edit is written into it — in place, through the
 * parsed document, so its comments and every key the edit did not touch stay
 * as written (research/yaml.md) — and the form reads back from it.
 */
type Value = Record<string, unknown>;

export interface FileModel {
  readonly cubes?: Value[];
  readonly views?: Value[];
}

/** The model a file's text holds, or the first problem with its line. */
export function modelOf(text: string): { model?: FileModel; problem?: string } {
  let document: Document;
  try {
    document = parseDocument(text, CUBE_PARSE);
  } catch (error) {
    return { problem: error instanceof Error ? error.message : String(error) };
  }
  const [error] = document.errors;
  if (error !== undefined) {
    const line = error.linePos?.[0].line;
    const first = error.message.split('\n')[0] ?? error.message;
    return { problem: line === undefined ? first : `line ${String(line)}: ${first}` };
  }
  try {
    return { model: (document.toJS() ?? {}) as FileModel };
  } catch (error) {
    // Some problems show only in reading the values: an alias to no anchor (T141).
    return { problem: error instanceof Error ? error.message : String(error) };
  }
}

const isPlain = (value: unknown): value is Value =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/**
 * Where each of `after`'s items was in `before`, when `after` is `before`'s
 * items in another order and nothing else; otherwise undefined.
 */
function reorderOf(before: readonly unknown[], after: readonly unknown[]): number[] | undefined {
  if (before.length !== after.length) return undefined;
  const taken = new Set<number>();
  const order: number[] = [];
  for (const item of after) {
    const text = JSON.stringify(item);
    const from = before.findIndex((each, at) => !taken.has(at) && JSON.stringify(each) === text);
    if (from === -1) return undefined;
    taken.add(from);
    order.push(from);
  }
  return order.some((from, at) => from !== at) ? order : undefined;
}

/**
 * The document changed from `before` to `after` at `path`, key by key: a key
 * unchanged is left alone — its node, its comments — and only what differs
 * is set or deleted.
 */
function applyChange(
  document: Document,
  path: readonly (string | number)[],
  before: unknown,
  after: unknown,
): void {
  if (JSON.stringify(before) === JSON.stringify(after)) return;
  const node = document.getIn(path, true);
  if (isPlain(before) && isPlain(after) && isMap(node)) {
    for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
      if (!(key in after)) document.deleteIn([...path, key]);
      else applyChange(document, [...path, key], before[key], after[key]);
    }
    return;
  }
  if (Array.isArray(before) && Array.isArray(after) && isSeq(node)) {
    // The same items in another order — an index's columns moved (T152):
    // the item nodes are moved, each with its comments and anchor, rather
    // than each value written over whatever node sits at its place
    // (research/yaml.md, a sequence's `items`; T152's review).
    const order = reorderOf(before, after);
    if (order !== undefined) {
      const nodes = [...node.items];
      node.items = order.map((from) => nodes[from]);
      return;
    }
    // Item by item where they line up, and a member added at the end is
    // added there, so the items kept keep their comments.
    if (after.length >= before.length) {
      before.forEach((item, index) => {
        applyChange(document, [...path, index], item, after[index]);
      });
      for (const item of after.slice(before.length)) node.add(document.createNode(item));
      return;
    }
    // One member removed: that one goes, and nothing around it.
    const gone = before.findIndex(
      (_, at) =>
        JSON.stringify([...before.slice(0, at), ...before.slice(at + 1)]) === JSON.stringify(after),
    );
    if (before.length - after.length === 1 && gone !== -1) {
      document.deleteIn([...path, gone]);
      return;
    }
  }
  // A scalar goes in as its value: over a scalar, `yaml` sets the value on the
  // node that is there, keeping its comments. A list or a map is written anew,
  // as a node, and given what the node it replaces carried itself: its anchor
  // — or an alias to it would resolve to nothing, and the file could not be
  // written (T139's review) — and its own comments. What was inside it goes;
  // `lossCheck` names that before the edit is applied (T140).
  if (after === null || typeof after !== 'object') {
    document.setIn(path, after);
    return;
  }
  const written = document.createNode(after);
  if (isNode(node) && !isAlias(node)) {
    if (node.anchor !== undefined) written.anchor = node.anchor;
    if (node.commentBefore !== undefined) written.commentBefore = node.commentBefore;
    if (node.comment !== undefined) written.comment = node.comment;
  }
  document.setIn(path, written);
}

/**
 * How the file is written: its own indent, and whether its lists sit under
 * their key's indent or past it, read from the text; no line folded
 * (`lineWidth: 0`). Without these `yaml` writes its defaults — two spaces,
 * lists indented, folded at 80 columns — and a form edit reflows the whole
 * file (research/yaml.md, "Round-trip is a re-render").
 */
function styleOf(text: string): { indent: number; indentSeq: boolean; lineWidth: 0 } {
  const lines = text
    .split('\n')
    .filter((line) => line.trim() !== '' && !line.trim().startsWith('#'));
  const indents = lines.map((line) => line.length - line.trimStart().length).filter((n) => n > 0);
  const indent = indents.length === 0 ? 2 : Math.min(...indents);
  // A `key:` line, then a `-` on the next: past its indent, or at it.
  let indentSeq = true;
  for (let at = 0; at + 1 < lines.length; at += 1) {
    const key = /^(\s*)[^\s#-][^:]*:\s*$/.exec(lines[at] ?? '');
    const dash = /^(\s*)- /.exec(lines[at + 1] ?? '');
    if (key !== null && dash !== null) {
      indentSeq = (dash[1] ?? '').length > (key[1] ?? '').length;
      break;
    }
  }
  return { indent, indentSeq, lineWidth: 0 };
}

/** The file with one cube or view replaced by the form's next version of it. */
export function withObject(
  text: string,
  list: 'cubes' | 'views',
  index: number,
  next: Value,
): string {
  const document = parseDocument(text, CUBE_PARSE);
  const before = (document.toJS() as FileModel | null)?.[list]?.[index];
  applyChange(document, [list, index], before, next);
  return document.toString(styleOf(text));
}
