import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { Me } from './AccountMenu';
import { hiddenWorkspacesFor, WORKSPACES, WorkspaceSwitcher } from './WorkspaceSwitcher';

/**
 * AC-001: WHEN the application loads, THE SYSTEM SHALL show a top bar whose
 * workspace switcher lists Explore to every user; Data sources, Jobs and
 * Schedules to Super-Admins and read-write members; and Security to
 * Super-Admins. It SHALL list no Model workspace.
 * Fails when: the switcher shows a "Dashboards" or "Model" entry, omits an
 * entry the user's role may use, or shows one it may not.
 *
 * These assert the whole list rather than the presence of each name: an entry
 * too many has to fail this file.
 */
const EVERY = ['Explore', 'Data sources', 'Jobs', 'Schedules', 'Security'];

const labelsFor = (me: Me | undefined) => {
  render(<WorkspaceSwitcher current="explore" hidden={hiddenWorkspacesFor(me)} />);
  return within(screen.getByRole('navigation', { name: /workspace/i }))
    .getAllByRole('link')
    .map((entry) => entry.textContent);
};

const signedIn = (who: Partial<Me>): Me => ({
  name: 'Someone',
  groups: [],
  superAdmin: false,
  readWrite: false,
  security: 'oidc',
  ...who,
});

describe('workspace switcher (AC-001)', () => {
  it('lists every workspace but Model, in order, when nothing is left out', () => {
    render(<WorkspaceSwitcher current="explore" />);

    const switcher = screen.getByRole('navigation', { name: /workspace/i });
    const entries = within(switcher).getAllByRole('link');

    expect(entries.map((entry) => entry.textContent)).toEqual(EVERY);
  });

  it('shows no Dashboards entry, because dashboards live in Explore folders', () => {
    render(<WorkspaceSwitcher current="explore" />);

    expect(screen.queryByRole('link', { name: /dashboards/i })).toBeNull();
  });

  it('shows no Model entry: models open from their folders in Explore (F27)', () => {
    render(<WorkspaceSwitcher current="model" />);

    expect(screen.queryByRole('link', { name: /model/i })).toBeNull();
    // On the model's own page, which keeps its address, no entry claims to be it.
    expect(
      screen.getAllByRole('link').filter((entry) => entry.getAttribute('aria-current') !== null),
    ).toEqual([]);
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
    expect(hrefs).toEqual(['/explore', '/data-sources', '/jobs', '/schedules', '/security']);
  });

  it('exports the workspace list the rest of the app routes from, Model’s address kept', () => {
    // The switcher and the router must not drift apart: both read this. The
    // Model workspace keeps its route for links into it (T331), unlisted.
    expect(WORKSPACES.map((workspace) => workspace.label)).toEqual([
      'Explore',
      'Model',
      'Data sources',
      'Jobs',
      'Schedules',
      'Security',
    ]);
    expect(WORKSPACES.find((workspace) => workspace.id === 'model')?.path).toBe('/model');
  });

  it('leaves out a workspace the user may not open (T500; design 08, state D)', () => {
    render(<WorkspaceSwitcher current="explore" hidden={['security']} />);

    expect(screen.getAllByRole('link').map((entry) => entry.textContent)).toEqual(
      EVERY.filter((label) => label !== 'Security'),
    );
  });
});

/** T331: the entries each role may use (AC-001; design 09, state A). */
describe('the switcher by role (T331, AC-001)', () => {
  it('lists everything but Model to a Super-Admin', () => {
    expect(labelsFor(signedIn({ superAdmin: true, readWrite: true }))).toEqual(EVERY);
  });

  it('lists Explore, Data sources, Jobs and Schedules to a read-write member, and no Security', () => {
    expect(labelsFor(signedIn({ readWrite: true }))).toEqual([
      'Explore',
      'Data sources',
      'Jobs',
      'Schedules',
    ]);
  });

  it('lists Explore alone to a read-only user', () => {
    expect(labelsFor(signedIn({ groups: ['sales-ro'] }))).toEqual(['Explore']);
  });

  it('lists Explore alone to someone in no group', () => {
    expect(labelsFor(signedIn({ groups: [] }))).toEqual(['Explore']);
  });

  it('lists everything but Model to the single user with sign-in off, who holds every permission', () => {
    expect(
      labelsFor({ name: 'admin', groups: [], superAdmin: true, readWrite: true, security: 'off' }),
    ).toEqual(EVERY);
  });

  it('lists Explore alone until who is signed in is known, never more than they may open', () => {
    expect(labelsFor(undefined)).toEqual(['Explore']);
  });
});
