import { describe, expect, it } from 'vitest';

import { changeBetween } from './YamlEditor';

/**
 * T139's review: a form edit reached the YAML as a change of the whole text,
 * and a selection mapped through that collapses to its edge, so the cursor
 * went to the top on every keystroke in the form. The change dispatched is
 * the part that differs, so the editor maps the cursor through it
 * (research/code-editor.md, "Controlled value").
 */
describe('the change between two texts', () => {
  it('is only the part that differs', () => {
    const before = 'cubes:\n  - name: orders\n    sql_table: public.orders\n';
    const after = 'cubes:\n  - name: orders\n    title: O\n    sql_table: public.orders\n';

    // The shared start runs through the next line's indent, so the insert
    // begins after it: 28 characters in.
    expect(changeBetween(before, after)).toEqual({ from: 28, to: 28, insert: 'title: O\n    ' });
  });

  it('removes what went, and inserts nothing', () => {
    expect(changeBetween('a: 1\nb: 2\nc: 3\n', 'a: 1\nc: 3\n')).toEqual({
      from: 5,
      to: 10,
      insert: '',
    });
  });

  it('replaces the whole of a text that shares nothing', () => {
    expect(changeBetween('abc', 'xyz')).toEqual({ from: 0, to: 3, insert: 'xyz' });
  });

  it('does not count a shared start as a shared end too', () => {
    // "aa" → "aaa": the start takes both a's; the end must not take them again.
    expect(changeBetween('aa', 'aaa')).toEqual({ from: 2, to: 2, insert: 'a' });
  });
});
