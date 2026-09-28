import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { WORKSPACES, WorkspaceSwitcher } from './WorkspaceSwitcher';

/**
 * AC-001: WHEN the application loads, THE SYSTEM SHALL show a top bar whose
 * workspace switcher lists exactly Explore, Model, Data sources, Jobs,
 * Schedules and Security.
 * Fails when: the switcher shows a "Dashboards" entry, or any of the six
 * entries is absent.
 *
 * "Exactly" is the whole criterion, so these assert the full list rather than
 * the presence of each name: a seventh entry has to fail this file.
 */
const EXPECTED = ['Explore', 'Model', 'Data sources', 'Jobs', 'Schedules', 'Security'];

describe('workspace switcher (AC-001)', () => {
  it('lists exactly the six workspaces, in order', () => {
    render(<WorkspaceSwitcher current="explore" />);

    const switcher = screen.getByRole('navigation', { name: /workspace/i });
    const entries = within(switcher).getAllByRole('link');

    expect(entries.map((entry) => entry.textContent)).toEqual(EXPECTED);
  });

  it('shows no Dashboards entry, because dashboards live in Explore folders', () => {
    render(<WorkspaceSwitcher current="explore" />);

    expect(screen.queryByRole('link', { name: /dashboards/i })).toBeNull();
  });

  it('marks the current workspace for assistive technology, not by colour alone', () => {
    render(<WorkspaceSwitcher current="jobs" />);

    const current = screen.getByRole('link', { name: 'Jobs' });
    expect(current.getAttribute('aria-current')).toBe('page');

    const others = screen
      .getAllByRole('link')
      .filter((entry) => entry.textContent !== 'Jobs')
      .map((entry) => entry.getAttribute('aria-current'));
    expect(others.every((value) => value === null)).toBe(true);
  });

  it('points each entry at its own route', () => {
    render(<WorkspaceSwitcher current="explore" />);

    const hrefs = screen.getAllByRole('link').map((entry) => entry.getAttribute('href'));
    expect(hrefs).toEqual([
      '/explore',
      '/model',
      '/data-sources',
      '/jobs',
      '/schedules',
      '/security',
    ]);
  });

  it('exports the workspace list the rest of the app routes from', () => {
    // The switcher and the router must not drift apart: both read this.
    expect(WORKSPACES.map((workspace) => workspace.label)).toEqual(EXPECTED);
  });

  it('leaves out a workspace the user may not open (T500; design 08, state D)', () => {
    render(<WorkspaceSwitcher current="explore" hidden={['security']} />);

    expect(screen.getAllByRole('link').map((entry) => entry.textContent)).toEqual(
      EXPECTED.filter((label) => label !== 'Security'),
    );
  });
});
