import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ReadOnlyFile } from './ReadOnlyFile';

/**
 * T146 / AC-140: WHEN a model file uses Jinja, Python or JavaScript
 * generation, THE SYSTEM SHALL open it read-only in the code view and say
 * why it cannot be edited as a form.
 * Fails when: such a file opens in an editable form, or gives no reason.
 */
describe('a model file that is code or a template', () => {
  const TEMPLATE = 'cubes:\n{% for n in ["a", "b"] %}\n  - name: {{ n }}\n{% endfor %}\n';

  it('shows its text, read-only, and says why it isn’t a form', () => {
    render(<ReadOnlyFile path="cubes/generated.yml" content={TEMPLATE} code="Jinja" />);

    expect(screen.getByRole('note').textContent).toBe(
      'Jinja template: Cube renders it before reading its cubes and views, so they aren’t listed from its text. It opens read-only here: the form edits plain YAML only.',
    );
    const editor = screen.getByRole('textbox', { name: 'cubes/generated.yml, read-only' });
    expect(editor.getAttribute('contenteditable')).not.toBe('true');
    expect(editor.getAttribute('aria-readonly')).toBe('true');
    // Reached from the keyboard, to read and scroll (T146's review).
    expect(editor.getAttribute('tabindex')).toBe('0');
    expect(editor.textContent).toContain('{% for n in ["a", "b"] %}');
    // And no form: nothing here takes an edit.
    expect(screen.queryAllByRole('region', { name: /^Cube / })).toEqual([]);
    expect(document.querySelectorAll('input, select, textarea')).toHaveLength(0);
  });

  it('says why for JavaScript and Python too', () => {
    const { unmount } = render(
      <ReadOnlyFile path="cubes/orders.js" content={'cube(`orders`, {});\n'} code="JavaScript" />,
    );
    expect(screen.getByRole('note').textContent).toMatch(/^JavaScript: Cube runs it/);
    unmount();

    const { unmount: gone } = render(
      <ReadOnlyFile path="cubes/helpers.py" content={'x = 1\n'} code="Python" />,
    );
    // One Cube doesn't use: said so, and nothing said that contradicts it.
    expect(screen.getByRole('note').textContent).toBe(
      'Python: Cube reads only a globals.py at the model’s root, so it doesn’t use this file. It opens read-only here: the form edits plain YAML only.',
    );
    gone();

    render(
      <ReadOnlyFile
        path="globals.py"
        content={'from cube import TemplateContext\n'}
        code="Python"
      />,
    );
    expect(screen.getByRole('note').textContent).toMatch(/^Python: the functions and variables/);
    expect(screen.getByRole('textbox', { name: 'globals.py, read-only' }).textContent).toContain(
      'from cube import TemplateContext',
    );
  });
});
