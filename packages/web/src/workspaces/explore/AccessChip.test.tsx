import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AccessChip, OnlySuperAdminsChip } from './AccessChip';

/**
 * Rule 69 (T331; designs 04, 07 and 09, pin 7): every shared folder's header
 * shows the user's access there as a chip with an icon and a label:
 * Super-Admin (a shield), Read-write (a pencil) or View only (an eye). And
 * rule 63: when nothing reaches the folder, a second chip, with a lock, says
 * so.
 */
describe('the folder header’s access chip (rule 69, T331)', () => {
  it.each([
    ['super-admin', 'Super-Admin', 'shield', true],
    ['read-write', 'Read-write', 'pencil', true],
    ['view-only', 'View only', 'eye', false],
  ] as const)('says %s as “%s”, with its %s icon', (level, label, icon, accent) => {
    render(<AccessChip access={level} />);

    const chip = screen.getByTestId('access-chip');
    // Said to a screen reader as the user's access, not as a bare word.
    expect(chip.textContent).toBe(`Your access: ${label}`);
    expect(chip.querySelector(`svg[data-icon="${icon}"]`)).not.toBeNull();
    expect(chip.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    // The accent for those who may change the folder; neutral for a reader.
    expect(chip.classList.contains('access-chip--accent')).toBe(accent);
  });

  it('says when only Super-Admins can see the folder, with a lock (rule 63)', () => {
    render(<OnlySuperAdminsChip />);

    const chip = screen.getByTestId('only-super-admins');
    expect(chip.textContent).toBe('Only Super-Admins can see this folder');
    expect(chip.querySelector('svg[data-icon="lock"]')).not.toBeNull();
  });
});
