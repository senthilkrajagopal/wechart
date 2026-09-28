import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { hangOf, YamlEditor } from './YamlEditor';

/**
 * T482 / AC-134, design 03 notes 8 and 9: the YAML soft-wraps, on by default
 * and switched from its head; the lines a note is about are tinted; a comment
 * the form could drop is flagged in the gutter. Checked as the class the
 * editor sets (research/code-editor.md, "Addendum 2026-09-27"): jsdom does no
 * layout, so wrapped heights are the e2e's.
 */
const TEXT = ['cubes:', '  - name: orders', '    # a note', '    sql_table: t', ''].join('\n');

const editor = (props: Partial<Parameters<typeof YamlEditor>[0]> = {}) => (
  <YamlEditor value={TEXT} onChange={vi.fn()} label="cubes/orders.yml, as YAML" {...props} />
);

const lineClasses = (container: HTMLElement, name: string) =>
  [...container.querySelectorAll('.cm-content > .cm-line')].map((line) =>
    line.classList.contains(name),
  );

describe('the YAML’s wrap, tints and flags', () => {
  it('soft-wraps when asked, and stops when not', () => {
    const { container, rerender } = render(editor({ wrap: true }));
    expect(container.querySelector('.cm-content')?.classList.contains('cm-lineWrapping')).toBe(
      true,
    );
    rerender(editor({ wrap: false }));
    expect(container.querySelector('.cm-content')?.classList.contains('cm-lineWrapping')).toBe(
      false,
    );
  });

  it('hangs a wrapped line under its text: a comment’s words, a key’s value, a list item’s key', () => {
    // As design 03 draws them (note 8): the columns the wrapped part starts at.
    expect(hangOf('        # Cube hides primary keys')).toBe(10);
    expect(hangOf('    description: One row per order line')).toBe(17);
    expect(hangOf('  - name: orders')).toBe(4);
    expect(hangOf("        sql: '{CUBE}.customer_id = {customers}.id'")).toBe(13);
    // A key alone, a bare value and a blank line hang under their indent.
    expect(hangOf('    dimensions:')).toBe(4);
    expect(hangOf('      - status')).toBe(8);
    expect(hangOf('')).toBe(0);
    // Never so far the wrapped part has no room.
    expect(hangOf(`    ${'a'.repeat(40)}: value`)).toBe(24);
  });

  it('hangs the lines only while it wraps', () => {
    const { container, rerender } = render(editor({ wrap: true }));
    const styleOf = (text: string) =>
      [...container.querySelectorAll('.cm-content > .cm-line')]
        .find((line) => line.textContent === text)
        ?.getAttribute('style');
    expect(styleOf('    # a note')).toBe('padding-left: calc(6ch + 6px); text-indent: -6ch;');
    rerender(editor({ wrap: false }));
    expect(styleOf('    # a note')).toBe(null);
  });

  it('tints the lines asked for, and only those, until asked for others', () => {
    const { container, rerender } = render(editor({ tinted: [2, 3] }));
    expect(lineClasses(container, 'yaml-editor__tint')).toEqual([false, true, true, false, false]);
    rerender(editor({ tinted: [4] }));
    expect(lineClasses(container, 'yaml-editor__tint')).toEqual([false, false, false, true, false]);
    rerender(editor({ tinted: [] }));
    expect(lineClasses(container, 'yaml-editor__tint')).toEqual([
      false,
      false,
      false,
      false,
      false,
    ]);
  });

  it('marks a tinted line’s number too, as design 03 draws it', () => {
    const { container } = render(editor({ tinted: [2, 3] }));
    expect(
      [
        ...container.querySelectorAll('.cm-lineNumbers .cm-gutterElement.yaml-editor__tint-number'),
      ].map((element) => element.textContent),
    ).toEqual(['2', '3']);
  });

  it('tints the lines of a note as a warning, apart from the open member’s', () => {
    const { container, rerender } = render(editor({ tinted: [2], noted: [3] }));
    expect(lineClasses(container, 'yaml-editor__noted')).toEqual([
      false,
      false,
      true,
      false,
      false,
    ]);
    expect(lineClasses(container, 'yaml-editor__tint')).toEqual([false, true, false, false, false]);
    rerender(editor({ tinted: [2], noted: [] }));
    expect(lineClasses(container, 'yaml-editor__noted')).toEqual([
      false,
      false,
      false,
      false,
      false,
    ]);
    expect(lineClasses(container, 'yaml-editor__tint')).toEqual([false, true, false, false, false]);
  });

  /**
   * T482's review: a mark can map off its line as the text changes (a line
   * moved up drops it), so the lines asked for are set again with each text.
   */
  it('keeps each mark on the lines asked for as the text changes under it', () => {
    const lines = ['cubes:', '  - name: orders', '    # a note', '    sql_table: t', ''];
    const marks = { tinted: [3, 4], noted: [3, 4], flagged: [4] };
    const { container, rerender } = render(editor(marks));
    // Line 4 moved up a line, as Alt-ArrowUp does: the member is still lines 3 and 4.
    const moved = [lines[0], lines[1], lines[3], lines[2], lines[4]].join('\n');
    rerender(editor({ value: moved, ...marks }));
    expect(lineClasses(container, 'yaml-editor__tint')).toEqual([false, false, true, true, false]);
    expect(lineClasses(container, 'yaml-editor__noted')).toEqual([false, false, true, true, false]);
    const flags = [...container.querySelectorAll('.cm-lineNumbers .cm-gutterElement')]
      .filter((element) => element.classList.contains('yaml-editor__flag'))
      .map((element) => element.textContent);
    expect(flags).toEqual(['4']);
  });

  it('flags a line in the line numbers’ gutter', () => {
    const { container } = render(editor({ flagged: [3] }));
    const numbers = [...container.querySelectorAll('.cm-lineNumbers .cm-gutterElement')].filter(
      (element) => element.textContent !== '',
    );
    expect(
      numbers
        .filter((element) => element.classList.contains('yaml-editor__flag'))
        .map((element) => element.textContent),
    ).toEqual(['3']);
  });

  it('takes a line the text no longer has without failing', () => {
    const { container } = render(editor({ tinted: [2, 99], flagged: [0, 99] }));
    expect(lineClasses(container, 'yaml-editor__tint')).toEqual([false, true, false, false, false]);
  });
});
