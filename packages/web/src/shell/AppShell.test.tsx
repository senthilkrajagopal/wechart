import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AppShell } from './AppShell';

/**
 * AC-001: WHEN the application loads, THE SYSTEM SHALL show a top bar whose
 * workspace switcher lists exactly Explore, Model, Data sources, Jobs,
 * Schedules and Security.
 */
describe('app shell (AC-001)', () => {
  it('shows a top bar carrying the workspace switcher', () => {
    render(<AppShell workspace="explore" />);

    const bar = screen.getByRole('banner');
    const switcher = within(bar).getByRole('navigation', { name: /workspace/i });

    expect(within(switcher).getAllByRole('link')).toHaveLength(6);
  });

  it('renders the workspace content in a main landmark', () => {
    render(
      <AppShell workspace="model">
        <p>model workspace</p>
      </AppShell>,
    );

    expect(within(screen.getByRole('main')).getByText('model workspace')).toBeTruthy();
  });
});
