import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ReadOnlyFile } from './ReadOnlyFile';

/**
 * T146 / AC-140: WHEN a model file uses Jinja, Python or JavaScript
 * generation, THE SYSTEM SHALL open it read-only in the code view and say
 * why it cannot be edited as a form.
 * Fails when: such a file opens in an editable form, or gives no reason.
 *
 * In the editor's frame (T483, MW-16): its head says it is read-only and
 * what it is, the note is an InfoBar that names no xcube (D3), and the code
 * fills the pane, wrapped.
 */
describe('a model file that is code or a template', () => {
  const TEMPLATE = 'cubes:\n{% for n in ["a", "b"] %}\n  - name: {{ n }}\n{% endfor %}\n';

  it('shows its text, read-only, and says why it isn’t a form', () => {
    render(<ReadOnlyFile path="cubes/generated.yml" content={TEMPLATE} code="Jinja" />);

    // Headed as every file is: its path, and its state in words with its icon.
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('cubes/generated.yml');
    const state = document.querySelector('.model-editor__state');
    expect(state?.textContent).toBe('Read-only · Jinja template');
    expect(state?.querySelector('.secret-pasted__lock')).not.toBeNull();
    // The template stays in wechart, which publishes plain YAML only (T447, AC-335; D3).
    const note = screen.getByRole('note');
    expect(note.classList.contains('info-bar')).toBe(true);
    expect(note.textContent).toBe(
      'Jinja template: wechart publishes plain YAML only, so this template is never rendered or served, and its cubes and views aren’t listed. It opens read-only here: the form edits plain YAML only.',
    );
    expect(note.textContent).not.toMatch(/xcube/i);
    const editor = screen.getByRole('textbox', { name: 'cubes/generated.yml, read-only' });
    expect(editor.getAttribute('contenteditable')).not.toBe('true');
    expect(editor.getAttribute('aria-readonly')).toBe('true');
    // Reached from the keyboard, to read and scroll (T146's review).
    expect(editor.getAttribute('tabindex')).toBe('0');
    expect(editor.textContent).toContain('{% for n in ["a", "b"] %}');
    // Wrapped, as a file's YAML is (design 03 note 8).
    expect(editor.classList.contains('cm-lineWrapping')).toBe(true);
    // And no form: nothing here takes an edit.
    expect(screen.queryAllByRole('region', { name: /^Cube / })).toEqual([]);
    expect(document.querySelectorAll('input, select, textarea')).toHaveLength(0);
  });

  it('says why for JavaScript and Python too', () => {
    const { unmount } = render(
      <ReadOnlyFile path="cubes/orders.js" content={'cube(`orders`, {});\n'} code="JavaScript" />,
    );
    expect(screen.getByRole('note').textContent).toBe(
      'JavaScript: wechart publishes plain YAML only, so Cube never runs this file, and its cubes and views aren’t served or listed. It opens read-only here: the form edits plain YAML only.',
    );
    expect(document.querySelector('.model-editor__state')?.textContent).toBe(
      'Read-only · JavaScript',
    );
    unmount();

    render(
      <ReadOnlyFile
        path="globals.py"
        content={'from cube import TemplateContext\n'}
        code="Python"
      />,
    );
    // Not even the globals Cube once read for its templates.
    expect(screen.getByRole('note').textContent).toBe(
      'Python: wechart publishes plain YAML only, so Cube never reads this file. It opens read-only here: the form edits plain YAML only.',
    );
    expect(screen.getByRole('textbox', { name: 'globals.py, read-only' }).textContent).toContain(
      'from cube import TemplateContext',
    );
  });
});
