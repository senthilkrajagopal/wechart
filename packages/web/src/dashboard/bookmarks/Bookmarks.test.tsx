import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Bookmarks } from './Bookmarks';
import type { ViewState } from './viewState';

/**
 * T127 / AC-121: WHEN the user saves a bookmark, THE SYSTEM SHALL store the
 * page tab, the filter values and the current marks under a name the user
 * gives.
 * Fails when: applying the bookmark restores a different tab, filter value or
 * mark set.
 *
 * The dashboard header's Bookmarks: Save bookmark… asks for a name and sends
 * what the dashboard shows now under it. The e2e applies what was saved.
 */
const STATE: ViewState = {
  page: 'page-2',
  filters: { 'f-status orders.status': { kind: 'values', values: ['shipped'] } },
  marks: { 'marking-1': { items: [[{ member: 'orders.status', value: 'shipped' }]], ranges: [] } },
  markFilters: [],
  from: { 'marking-1': 'tile-status' },
};

function api(answer: (body: unknown) => Response) {
  const asked: { url: string; method: string; body?: unknown }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const body = init?.body === undefined ? undefined : JSON.parse(String(init.body));
      asked.push({
        url: String(input),
        method: init?.method ?? 'GET',
        ...(body === undefined ? {} : { body }),
      });
      if (init?.method === 'POST') return answer(body);
      return new Response(JSON.stringify({ bookmarks: [] }));
    }),
  );
  return asked;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const saveAs = async (name: string) => {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Bookmarks' }));
  await user.click(screen.getByRole('menuitem', { name: 'Save bookmark…' }));
  const dialog = screen.getByRole('dialog', { name: 'Save a bookmark' });
  await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), name);
  await user.click(within(dialog).getByRole('button', { name: 'Save' }));
  return dialog;
};

describe('Save bookmark…', () => {
  it('sends the page tab, the filters’ values and the marks under the name given', async () => {
    const asked = api(
      (body) =>
        new Response(JSON.stringify({ id: 'b1', dashboardId: 'd1', ...(body as object) }), {
          status: 201,
        }),
    );
    render(<Bookmarks dashboardId="d1" current={STATE} />);

    await saveAs('Shipped');

    expect(asked).toContainEqual({
      url: '/api/dashboards/d1/bookmarks',
      method: 'POST',
      body: { name: 'Shipped', state: STATE },
    });
    expect((await screen.findByRole('status')).textContent).toBe('Saved the bookmark “Shipped”.');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('says why a bookmark was not saved, and keeps the dialog open', async () => {
    api(() => new Response(JSON.stringify({ error: 'No such dashboard.' }), { status: 404 }));
    render(<Bookmarks dashboardId="d1" current={STATE} />);

    const dialog = await saveAs('Shipped');

    expect((await within(dialog).findByText(/^The bookmark was not saved/)).textContent).toBe(
      'The bookmark was not saved: No such dashboard.',
    );
    expect(screen.getByRole('dialog', { name: 'Save a bookmark' })).toBe(dialog);
  });

  it('asks for a name before saving', async () => {
    const asked = api(() => new Response('{}', { status: 201 }));
    const user = userEvent.setup();
    render(<Bookmarks dashboardId="d1" current={STATE} />);

    await user.click(screen.getByRole('button', { name: 'Bookmarks' }));
    await user.click(screen.getByRole('menuitem', { name: 'Save bookmark…' }));
    const dialog = screen.getByRole('dialog', { name: 'Save a bookmark' });

    expect(within(dialog).getByRole('button', { name: 'Save' })).toHaveProperty('disabled', true);
    expect(asked.filter((each) => each.method === 'POST')).toEqual([]);
  });
});
