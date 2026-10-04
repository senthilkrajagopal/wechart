import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRef, useState } from 'react';
import { describe, expect, it } from 'vitest';

import { PopOut } from './PopOut';

/**
 * T600 (AC-420; R58, the user: "you should be able to popout into modal and
 * closing should pop back into place"): what is popped out is the same
 * element, moved into a dialog and back — so what it holds is never reset —
 * and closing gives focus back to the control that popped it out.
 */
function Harness() {
  const [out, setOut] = useState(false);
  const control = useRef<HTMLButtonElement>(null);
  return (
    <div data-testid="place">
      <PopOut
        out={out}
        onClose={() => {
          setOut(false);
        }}
        label="YAML and join diagram"
        className="held"
        returnFocus={control}
      >
        <button
          ref={control}
          type="button"
          aria-pressed={out}
          onClick={() => {
            setOut(!out);
          }}
        >
          Pop out
        </button>
        <textarea aria-label="Text" />
      </PopOut>
    </div>
  );
}

describe('popping a pane out and back (T600, AC-420)', () => {
  it('moves the same element into a dialog, and leaves its place empty meanwhile', async () => {
    render(<Harness />);
    const text = screen.getByRole('textbox', { name: 'Text' });
    await userEvent.type(text, 'before');

    await userEvent.click(screen.getByRole('button', { name: 'Pop out' }));
    const dialog = screen.getByRole('dialog', { name: 'YAML and join diagram' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(within(dialog).getByRole('textbox', { name: 'Text' })).toBe(text);
    expect(screen.getByTestId('place').contains(text)).toBe(false);
    // What it held, as it was.
    expect((text as HTMLTextAreaElement).value).toBe('before');
  });

  it('puts it back in place on Esc, unchanged, with focus on its control', async () => {
    render(<Harness />);
    const text = screen.getByRole('textbox', { name: 'Text' });
    await userEvent.click(screen.getByRole('button', { name: 'Pop out' }));
    await userEvent.type(text, 'while out');

    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByTestId('place').contains(text)).toBe(true);
    expect((text as HTMLTextAreaElement).value).toBe('while out');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Pop out' }));
  });

  it('puts it back on the dialog’s Close, and on its own control', async () => {
    render(<Harness />);
    const text = screen.getByRole('textbox', { name: 'Text' });
    await userEvent.click(screen.getByRole('button', { name: 'Pop out' }));
    const dialog = screen.getByRole('dialog', { name: 'YAML and join diagram' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(screen.getByTestId('place').contains(text)).toBe(true);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Pop out' }));

    await userEvent.click(screen.getByRole('button', { name: 'Pop out' }));
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Pop out' }),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByTestId('place').contains(text)).toBe(true);
  });

  it('keeps Tab within the dialog while it is out', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'Pop out' }));
    const dialog = screen.getByRole('dialog', { name: 'YAML and join diagram' });
    for (let step = 0; step < 4; step += 1) {
      await userEvent.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
  });
});
