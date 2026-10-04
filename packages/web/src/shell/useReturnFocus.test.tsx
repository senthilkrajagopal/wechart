import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode, useEffect, useRef, useState } from 'react';
import { describe, expect, it } from 'vitest';

import { useReturnFocus } from './useReturnFocus';

/**
 * T405 (AC-176; direction.md rule 85): a dialog gives focus back to what
 * opened it. Under StrictMode too, as the app runs (`main.tsx`): its effects
 * run twice, the second time after the first has moved focus into the
 * dialog, which must not then be taken for its opener (T405's review).
 */
function Dialog({ onClose }: { readonly onClose: () => void }) {
  useReturnFocus();
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => field.current?.focus(), []);
  return (
    <div role="dialog" aria-label="Asking">
      <input ref={field} aria-label="Name" />
      <button type="button" onClick={onClose}>
        Close
      </button>
    </div>
  );
}

function Page() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      {open ? <Dialog onClose={() => setOpen(false)} /> : null}
    </>
  );
}

describe('focus back to the opener (T405, rule 85)', () => {
  it('goes back to what opened the dialog once it closes, under StrictMode', async () => {
    render(
      <StrictMode>
        <Page />
      </StrictMode>,
    );
    const opener = screen.getByRole('button', { name: 'Open' });
    await userEvent.click(opener);
    expect(document.activeElement).toBe(screen.getByLabelText('Name'));
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(opener));
  });

  it('leaves focus where a close put it on purpose', async () => {
    function Elsewhere() {
      const [open, setOpen] = useState(true);
      const other = useRef<HTMLButtonElement>(null);
      return (
        <>
          <button type="button" ref={other}>
            Other
          </button>
          {open ? (
            <Dialog
              onClose={() => {
                setOpen(false);
                other.current?.focus();
              }}
            />
          ) : null}
        </>
      );
    }
    render(<Elsewhere />);
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    await new Promise((settle) => requestAnimationFrame(settle));
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Other' }));
  });
});
