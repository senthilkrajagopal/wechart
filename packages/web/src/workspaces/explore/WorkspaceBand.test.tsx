import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { WorkspaceBand } from './WorkspaceBand';

/**
 * T498 (AC-343; design 04 of 2026-09-27, pin 2; rule 72): every page inside
 * the user's workspace says so in a band, with a person icon.
 */
describe('the workspace band (T498)', () => {
  it('says the place is the user’s alone, the icon drawn only', () => {
    render(<WorkspaceBand />);

    const band = screen.getByRole('note');
    expect(band.textContent).toBe('My workspace · only you can see this');
    expect(band.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });
});
