import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { LossWarning } from './LossWarning';

/**
 * T140 / AC-134: IF switching from code to form would lose information, such
 * as comments or anchors, THEN THE SYSTEM SHALL warn and name what would be
 * lost before applying the change.
 * Fails when: comments disappear from a file with no warning.
 */
describe('the warning before a form edit that would lose something', () => {
  it('names each thing the edit would drop', () => {
    render(
      <LossWarning
        lost={[
          { kind: 'comment', text: 'Kept for the finance team.' },
          { kind: 'anchor', text: 'base' },
          { kind: 'alias', text: 'shared' },
        ]}
        onApply={vi.fn()}
        onKeep={vi.fn()}
      />,
    );

    expect(screen.getByRole('alert').textContent).toContain(
      'This edit would drop the comment “Kept for the finance team.”, the anchor &base and the alias *shared.',
    );
  });

  it('names a comment of several lines by its first', () => {
    render(
      <LossWarning
        lost={[{ kind: 'comment', text: 'Cube hides primary keys.\nThis one is public.' }]}
        onApply={vi.fn()}
        onKeep={vi.fn()}
      />,
    );

    expect(screen.getByRole('alert').textContent).toContain(
      'This edit would drop the comment “Cube hides primary keys. …”.',
    );
  });

  it('takes the focus, on the choice that loses nothing, and is scrolled to', () => {
    // The form locks while it waits, which takes the focus from the field
    // being edited: it goes here, where the answer is.
    const scrolled = vi.fn();
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = scrolled;
    try {
      render(
        <LossWarning lost={[{ kind: 'comment', text: 'x' }]} onApply={vi.fn()} onKeep={vi.fn()} />,
      );
    } finally {
      Element.prototype.scrollIntoView = original;
    }

    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Keep the file' }));
    expect(scrolled).toHaveBeenCalledWith({ block: 'nearest' });
  });

  it('applies the edit, or keeps the file as it is', async () => {
    const onApply = vi.fn();
    const onKeep = vi.fn();
    render(
      <LossWarning lost={[{ kind: 'comment', text: 'x' }]} onApply={onApply} onKeep={onKeep} />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Apply anyway' }));
    expect(onApply).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: 'Keep the file' }));
    expect(onKeep).toHaveBeenCalledTimes(1);
  });
});
