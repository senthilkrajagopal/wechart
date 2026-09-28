import { describe, expect, it } from 'vitest';

import { memberLines } from './memberLines';

/**
 * T482, design 03 note 9: the open member's lines in the YAML, to tint them —
 * from the parsed node's place in the text (research/yaml.md, "Addendum
 * 2026-09-27").
 */
const TEXT = [
  'cubes:', //                          1
  '  - name: orders', //                2
  '    dimensions:', //                 3
  '      - name: id', //                4
  '        sql: id', //                 5
  '        type: number', //            6
  '      - name: status', //            7
  '        sql: status', //             8
  '        type: string', //            9
  '', //                               10
  '    measures:', //                  11
  '      - name: count', //            12
  '        type: count', //            13
  '',
].join('\n');

describe('a member’s lines in its file', () => {
  it('are the lines its entry spans, from its name to its last key', () => {
    expect(memberLines(TEXT, 'cubes', 0, 'dimensions', 1)).toEqual([7, 8, 9]);
    expect(memberLines(TEXT, 'cubes', 0, 'measures', 0)).toEqual([12, 13]);
  });

  it('are none for a member the text doesn’t have, or text that doesn’t parse', () => {
    expect(memberLines(TEXT, 'cubes', 0, 'dimensions', 5)).toEqual([]);
    expect(memberLines(TEXT, 'views', 0, 'dimensions', 0)).toEqual([]);
    expect(memberLines('cubes: [\n', 'cubes', 0, 'dimensions', 0)).toEqual([]);
  });
});
