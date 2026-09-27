import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { YamlEditor } from './YamlEditor';

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
