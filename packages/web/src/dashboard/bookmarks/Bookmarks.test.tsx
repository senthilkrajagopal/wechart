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

function api(answer: (body: unknown) => Response, listed: () => unknown[] = () => []) {
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
      return new Response(JSON.stringify({ bookmarks: listed() }));
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
    render(<Bookmarks dashboardId="d1" current={STATE} onApply={() => undefined} />);

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
    render(<Bookmarks dashboardId="d1" current={STATE} onApply={() => undefined} />);

    const dialog = await saveAs('Shipped');

    expect((await within(dialog).findByText(/^The bookmark was not saved/)).textContent).toBe(
      'The bookmark was not saved: No such dashboard.',
    );
    expect(screen.getByRole('dialog', { name: 'Save a bookmark' })).toBe(dialog);
  });

  it('asks for a name before saving', async () => {
    const asked = api(() => new Response('{}', { status: 201 }));
    const user = userEvent.setup();
    render(<Bookmarks dashboardId="d1" current={STATE} onApply={() => undefined} />);

    await user.click(screen.getByRole('button', { name: 'Bookmarks' }));
    await user.click(screen.getByRole('menuitem', { name: 'Save bookmark…' }));
    const dialog = screen.getByRole('dialog', { name: 'Save a bookmark' });

    expect(within(dialog).getByRole('button', { name: 'Save' })).toHaveProperty('disabled', true);
    expect(asked.filter((each) => each.method === 'POST')).toEqual([]);
  });
});

/**
 * T128 / AC-122: WHEN the user applies a bookmark, THE SYSTEM SHALL restore
 * that state without changing the dashboard's saved definition.
 * Fails when: applying a bookmark modifies the dashboard for other users.
 *
 * The menu lists the dashboard's bookmarks; choosing one hands its state, as
 * read back (`viewStateFrom`), to the dashboard to restore. It writes nothing.
 */
describe('a bookmark in the menu', () => {
  it('is listed by name, and choosing it hands its state on, writing nothing', async () => {
    const asked = api(
      () => new Response('{}', { status: 201 }),
      () => [
        { id: 'b1', dashboardId: 'd1', name: 'Shipped', state: STATE },
        // Read back as a view: its marks dropped, being no predicate.
        { id: 'b2', dashboardId: 'd1', name: 'Odd', state: { ...STATE, marks: { m: 'x' } } },
      ],
    );
    const applied: [string, unknown][] = [];
    const user = userEvent.setup();
    render(
      <Bookmarks
        dashboardId="d1"
        current={STATE}
        onApply={(state, name) => applied.push([name, state])}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Bookmarks' }));
    const menu = screen.getByRole('menu', { name: 'Bookmarks' });
    expect((await within(menu).findAllByRole('menuitem')).map((item) => item.textContent)).toEqual([
      'Shipped',
      'Odd',
      'Save bookmark…',
    ]);
    await user.click(within(menu).getByRole('menuitem', { name: 'Odd' }));

    expect(applied).toEqual([['Odd', { ...STATE, marks: {} }]]);
    expect((await screen.findByRole('status')).textContent).toBe('Applied the bookmark “Odd”.');
    expect(asked.filter((each) => each.method !== 'GET')).toEqual([]);
  });

  it('lists one just saved', async () => {
    const saved: unknown[] = [];
    api(
      (body) => {
        saved.push({ id: 'b1', dashboardId: 'd1', ...(body as object) });
        return new Response(JSON.stringify(saved[0]), { status: 201 });
      },
      () => saved,
    );
    const user = userEvent.setup();
    render(<Bookmarks dashboardId="d1" current={STATE} onApply={() => undefined} />);

    await saveAs('Shipped');
    await screen.findByText('Saved the bookmark “Shipped”.');
    await user.click(screen.getByRole('button', { name: 'Bookmarks' }));

    expect(
      await within(screen.getByRole('menu', { name: 'Bookmarks' })).findByRole('menuitem', {
        name: 'Shipped',
      }),
    ).toBeTruthy();
  });

  it('says so when there are none', async () => {
    api(() => new Response('{}', { status: 201 }));
    const user = userEvent.setup();
    render(<Bookmarks dashboardId="d1" current={STATE} onApply={() => undefined} />);

    await user.click(screen.getByRole('button', { name: 'Bookmarks' }));

    const none = await screen.findByRole('menuitem', { name: 'No bookmarks yet' });
    expect(none.getAttribute('aria-disabled')).toBe('true');
  });
});
