import { describe, expect, it } from 'vitest';

import { DEFAULT_INTERACTIONS, newDashboardBody } from './dashboard-document';
import { problemsWith } from './markings/model';

/**
 * T078 / AC-072: WHEN a new dashboard is created, THE SYSTEM SHALL set its
 * interaction mode to Markings with one marking named "Marking" as the
 * default (direction.md rule 57).
 * `Fails when: a new dashboard opens in a mode other than Markings, or with
 * no default marking.`
 *
 * **Asserted at creation, not at read.** `interactionsOf` in the web package
 * applies the same default to dashboards that predate interactions, so a test
 * that opened a dashboard and found Markings would pass whether or not
 * anything was ever written — the criterion's failing state would be
 * unobservable by construction. T076's note recorded that; this is the test
 * it asked for.
 *
 * It lives in core because creation happens in the API, and the default has to
 * be the same one the browser reads back. Two literals in two packages would
 * drift, and a dashboard would be stored as one thing and read as another.
 */
describe('a newly created dashboard', () => {
  const made = () => newDashboardBody({ title: 'Untitled', folderId: 'root', owner: 'admin' });

  it('starts in Markings mode', () => {
    expect(made().settings.interactions.mode).toBe('markings');
  });

  it('carries exactly one marking, named as rule 57 names it, flagged default', () => {
    const markings = made().markings;

    expect(markings).toHaveLength(1);
    expect(markings[0]?.name).toBe('Marking');
    expect(markings[0]?.isDefault).toBe(true);
  });

  it('satisfies the marking invariants from the moment it exists', () => {
    // AC-084's rules hold at creation, not only after something repairs them.
    expect(problemsWith(made().markings)).toEqual([]);
  });

  it('carries what it was created with', () => {
    const body = newDashboardBody({ title: 'Revenue', folderId: 'finance', owner: 'admin' });

    expect(body.title).toBe('Revenue');
    expect(body.folderId).toBe('finance');
    expect(body.owner).toBe('admin');
  });

  it('opens as an empty dashboard rather than as nothing', () => {
    // A body with no `pages` reads as a dashboard with no tiles either way,
    // but writing the list means the first edit has somewhere to go.
    expect(made().pages).toEqual([]);
    expect(made().schemaVersion).toBe(1);
    expect(made().settings.width).toBe('fixed');
  });

  it('uses the same default the rest of the app reads back', () => {
    // The drift this exists to prevent: a creation-time literal and a
    // read-time literal that are equal today and diverge on the day someone
    // changes one of them.
    expect(made().settings.interactions).toEqual(DEFAULT_INTERACTIONS);
  });
});
