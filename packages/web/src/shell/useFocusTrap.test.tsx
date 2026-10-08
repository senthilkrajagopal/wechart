import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRef } from 'react';
import { describe, expect, it } from 'vitest';

import { useFocusTrap } from './useFocusTrap';

/**
 * T182 / AC-176: every dialog is reachable from the keyboard, and a modal one
 * keeps Tab inside it (the WAI-ARIA dialog pattern). `aria-modal` alone moves
 * nothing: without a trap, Tab walks out of the dialog onto the page behind
 * it, where focus is invisible under the backdrop.
 */
function Modal() {
  const dialog = useRef<HTMLDivElement>(null);
  useFocusTrap(dialog);
  return (
    <>
      <button type="button">Behind</button>
      <div ref={dialog} role="dialog" aria-modal="true" aria-label="Asking">
        <button type="button">First</button>
        <button type="button" disabled>
          Off
        </button>
        <button type="button">Last</button>
      </div>
      <button type="button">After</button>
    </>
  );
}

/** Search (⌘K) opened over a dialog: two modals, the later one on top. */
function Stacked() {
  const under = useRef<HTMLDivElement>(null);
  const over = useRef<HTMLDivElement>(null);
  useFocusTrap(under);
  useFocusTrap(over);
  return (
    <>
      <div ref={under} role="dialog" aria-modal="true" aria-label="Under">
        <button type="button">Under first</button>
      </div>
      <div ref={over} role="dialog" aria-modal="true" aria-label="Over">
        <button type="button">Over first</button>
        <button type="button">Over last</button>
      </div>
    </>
  );
}

describe('a modal dialog’s Tab', () => {
  it('is left to a modal opened over it', async () => {
    render(<Stacked />);
    screen.getByRole('button', { name: 'Over first' }).focus();

    await userEvent.tab();

    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Over last' }));
  });

  it('goes from its last control back to its first', async () => {
    render(<Modal />);
    screen.getByRole('button', { name: 'Last' }).focus();

    await userEvent.tab();

    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'First' }));
  });

  it('goes from its first control back to its last with Shift', async () => {
    render(<Modal />);
    screen.getByRole('button', { name: 'First' }).focus();

    await userEvent.tab({ shift: true });

    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Last' }));
  });

  it('still moves between its own controls, skipping a disabled one', async () => {
    render(<Modal />);
    screen.getByRole('button', { name: 'First' }).focus();

    await userEvent.tab();

    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Last' }));
  });

  it('brings focus in from outside', async () => {
    render(<Modal />);
    // After the dialog, so the page's own order would not lead into it.
    screen.getByRole('button', { name: 'After' }).focus();

    await userEvent.tab();

    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'First' }));
  });

  it('keeps Shift+Tab in it from its heading, which took focus as it opened (T640)', async () => {
    render(<Headed />);
    screen.getByRole('heading', { name: 'Sheet' }).focus();

    await userEvent.tab({ shift: true });

    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close' }));
  });

  it('keeps Tab in it from text after its last control that took focus (T640)', async () => {
    render(<Headed />);
    screen.getByRole('region', { name: 'Log' }).focus();

    await userEvent.tab();

    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Back' }));
  });
});

/** A sheet whose heading takes focus as it opens, its controls after it, and a log after them. */
function Headed() {
  const sheet = useRef<HTMLDivElement>(null);
  useFocusTrap(sheet);
  return (
    <>
      <button type="button">Under</button>
      <div ref={sheet} aria-label="Sheet">
        <h2 tabIndex={-1}>Sheet</h2>
        <button type="button">Back</button>
        <button type="button">Close</button>
        <div role="region" aria-label="Log" tabIndex={-1}>
          lines
        </div>
      </div>
      <button type="button">Over</button>
    </>
  );
}
