import { isMap, isSeq, parseDocument, type Document } from 'yaml';

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
  if (
    Array.isArray(before) &&
    Array.isArray(after) &&
    isSeq(node) &&
    before.length === after.length
  ) {
    after.forEach((item, index) => {
      applyChange(document, [...path, index], before[index], item);
    });
    return;
  }
  document.setIn(path, after);
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
  return document.toString();
}
