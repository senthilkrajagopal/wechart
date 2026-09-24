import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render as rtlRender, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { SearchPalette } from './SearchPalette';

/** The palette queries the search API, so it renders inside a query client. */
function render(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return rtlRender(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

/**
 * AC-006: WHEN the user presses ⌘K or Ctrl+K anywhere in the application, THE
 * SYSTEM SHALL open the search palette with keyboard focus in its input.
 * Fails when: after the shortcut, focus is not inside the palette input, or the
 * palette does not open.
 *
 * "Anywhere in the application" is the part worth testing hardest: the
 * shortcut has to work while focus sits in another control, which is exactly
 * where a naive implementation drops it.
 */
describe('search palette (AC-006)', () => {
  it('is closed until the shortcut is pressed', () => {
    render(<SearchPalette />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('opens on Meta+K with focus in the input', async () => {
    render(<SearchPalette />);

    await userEvent.keyboard('{Meta>}k{/Meta}');

    const input = screen.getByRole('combobox');
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(document.activeElement).toBe(input);
  });

  it('opens on Control+K with focus in the input', async () => {
    render(<SearchPalette />);

    await userEvent.keyboard('{Control>}k{/Control}');

    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole('combobox'));
  });

  it('opens while focus is inside another control', async () => {
    render(
      <>
        <input aria-label="elsewhere" />
        <SearchPalette />
      </>,
    );

    const elsewhere = screen.getByLabelText('elsewhere');
    await userEvent.click(elsewhere);
    expect(document.activeElement).toBe(elsewhere);

    await userEvent.keyboard('{Control>}k{/Control}');

    expect(document.activeElement).toBe(screen.getByRole('combobox'));
  });

  it('closes on Escape and gives focus back to where it was', async () => {
    render(
      <>
        <button type="button">before</button>
        <SearchPalette />
      </>,
    );

    const before = screen.getByRole('button', { name: 'before' });
    await userEvent.click(before);
    await userEvent.keyboard('{Control>}k{/Control}');
    expect(screen.getByRole('dialog')).toBeTruthy();

    await userEvent.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).toBeNull();
    // Losing the caller's place would make the shortcut hostile to keyboard use.
    expect(document.activeElement).toBe(before);
  });

  it('keeps Tab inside it, not on the page under it (T182, AC-176)', async () => {
    render(
      <>
        <SearchPalette />
        <button type="button">Under the palette</button>
      </>,
    );
    await userEvent.keyboard('{Control>}k{/Control}');
    const dialog = screen.getByRole('dialog');

    for (const shift of [false, false, true, true, true]) {
      await userEvent.tab({ shift });
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
  });

  it('does not open on K alone', async () => {
    render(<SearchPalette />);

    await userEvent.keyboard('k');

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('is labelled, so it is announced when it opens', async () => {
    render(<SearchPalette />);

    await userEvent.keyboard('{Control>}k{/Control}');

    const dialog = screen.getByRole('dialog');
    expect(
      dialog.getAttribute('aria-label') ?? dialog.getAttribute('aria-labelledby'),
    ).toBeTruthy();
    expect(dialog.getAttribute('aria-modal')).toBe('true');
  });
});
