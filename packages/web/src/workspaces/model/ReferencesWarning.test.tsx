import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ReferencesWarning } from './ReferencesWarning';

/**
 * T147 / AC-141: WHEN the user edits a member that charts use, THE SYSTEM
 * SHALL list the charts and dashboards that reference it before saving.
 * Fails when: a referencing chart is missing from that list.
 */
const FOUND = {
  charts: [
    { id: 'c-count', title: 'Orders', dashboardId: null, members: ['orders.count'] },
    { id: 'c-local', title: 'Customers here', dashboardId: 'd-ops', members: ['orders.count'] },
  ],
  dashboards: [
    { id: 'd-ops', title: 'Operations', members: ['orders.count'], through: ['c-local'] },
  ],
};

describe('the warning before a save that edits members in use', () => {
  it('lists every chart and dashboard using them, each a link, with the members it uses', () => {
    render(<ReferencesWarning found={FOUND} onSave={vi.fn()} onCancel={vi.fn()} />);

    const warning = screen.getByRole('alert');
    expect(warning.textContent).toContain(
      'This save changes members that 2 charts and 1 dashboard use.',
    );
    const charts = within(screen.getByRole('list', { name: 'Charts' })).getAllByRole('link');
    expect(charts.map((link) => [link.textContent, link.getAttribute('href')])).toEqual([
      ['Orders', '/explore/charts/c-count'],
      // A chart kept on its dashboard opens there.
      ['Customers here', '/explore/dashboards/d-ops'],
    ]);
    const dashboards = within(screen.getByRole('list', { name: 'Dashboards' })).getAllByRole(
      'link',
    );
    expect(dashboards.map((link) => [link.textContent, link.getAttribute('href')])).toEqual([
      ['Operations', '/explore/dashboards/d-ops'],
    ]);
    expect(warning.textContent).toContain('orders.count');
  });

  it('saves only when told, and waits on the choice that changes nothing', async () => {
    const onSave = vi.fn();
    const onCancel = vi.fn();
    render(<ReferencesWarning found={FOUND} onSave={onSave} onCancel={onCancel} />);

    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancel' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: 'Save anyway' }));
    expect(onSave).toHaveBeenCalledTimes(1);
  });
});
