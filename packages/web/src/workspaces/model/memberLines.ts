import { isNode, parseDocument } from 'yaml';

import { CUBE_PARSE } from './objects';

/**
 * The 1-based YAML lines of one member of a file's cube or view (T482; design
 * 03 note 9): the expanded member's lines, tinted in the code. Read from the
 * parsed node's `range` (research/yaml.md, "Addendum 2026-09-27"): from its
 * start to where its value ends. None for a member the text doesn't have.
 */
export function memberLines(
  text: string,
  list: 'cubes' | 'views',
  at: number,
  key: string,
  index: number,
): number[] {
  const document = parseDocument(text, CUBE_PARSE);
  if (document.errors.length > 0) return [];
  const node: unknown = document.getIn([list, at, key, index], true);
  if (!isNode(node) || node.range === undefined || node.range === null) return [];
  const [start, valueEnd] = node.range;
  const lineAt = (offset: number) => text.slice(0, offset).split('\n').length;
  // The value ends after its last line's break: that line is not the member's.
  const first = lineAt(start);
  const last = lineAt(Math.max(start, valueEnd - 1));
  return Array.from({ length: last - first + 1 }, (_, n) => first + n);
}
