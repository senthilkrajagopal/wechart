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
 * The dashboard header's Bookmarks: Bookmark this view… (design-10-Q1, T742) asks for a name and sends
 * what the dashboard shows now under it. The e2e applies what was saved.
 */
const STATE: ViewState = {
  page: 'page-2',
  filters: { 'f-status orders.status': { kind: 'values', values: ['shipped'] } },
  marks: { 'marking-1': { items: [[{ member: 'orders.status', value: 'shipped' }]], ranges: [] } },
  markFilters: [],
  from: { 'marking-1': 'tile-status' },
};

interface Asked {
  url: string;
  method: string;
  body?: unknown;
}

/**
 * The API, in memory: GET lists `listed()`; everything else is answered by
 * `answer`. Every request asked is recorded.
 */
function api(
  answer: (body: unknown, asked: Asked) => Response,
  listed: () => unknown[] = () => [],
) {
  const asked: Asked[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const body = init?.body === undefined ? undefined : JSON.parse(String(init.body));
      const one = {
        url: String(input),
        method: init?.method ?? 'GET',
        ...(body === undefined ? {} : { body }),
      };
      asked.push(one);
      if (one.method !== 'GET') return answer(body, one);
      return new Response(JSON.stringify({ bookmarks: listed() }));
    }),
  );
  return asked;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

/** `text` said in the status line, where a screen reader hears it. */
const assertSaid = async (text: string) =>
  expect((await screen.findByText(text)).getAttribute('role')).toBe('status');

const open = async () => {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Bookmarks' }));
  return screen.getByRole('dialog', { name: 'Bookmarks' });
};

const saveAs = async (name: string) => {
  const user = userEvent.setup();
  await user.click(within(await open()).getByRole('button', { name: 'Bookmark this view…' }));
  const dialog = screen.getByRole('dialog', { name: 'Save a bookmark' });
  await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), name);
  await user.click(within(dialog).getByRole('button', { name: 'Save' }));
  return dialog;
};

/** One of mine, unshared, as the API lists it. */
const mine = (id: string, name: string, state: unknown = STATE) => ({
  id,
  dashboardId: 'd1',
  name,
  state,
  shared: false,
  mine: true,
  mayDelete: true,
});

describe('Bookmark this view…', () => {
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

    await user.click(within(await open()).getByRole('button', { name: 'Bookmark this view…' }));
    const dialog = screen.getByRole('dialog', { name: 'Save a bookmark' });

    expect(within(dialog).getByRole('button', { name: 'Save' })).toHaveProperty('disabled', true);
    expect(asked.filter((each) => each.method === 'POST')).toEqual([]);
  });

  /**
   * T405's follow-up (AC-176; rule 85): Esc and Cancel close the name
   * dialog at once while nothing is typed, and ask first over a typed name;
   * Esc over the question keeps editing.
   */
  it('asks before Esc or Cancel discards a typed name', async () => {
    const asked = api(() => new Response('{}', { status: 201 }));
    const user = userEvent.setup();
    render(<Bookmarks dashboardId="d1" current={STATE} onApply={() => undefined} />);
    const openDialog = async () => {
      await user.click(within(await open()).getByRole('button', { name: 'Bookmark this view…' }));
      return screen.getByRole('dialog', { name: 'Save a bookmark' });
    };

    // Nothing typed: Esc closes it at once.
    await openDialog();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Save a bookmark' })).toBeNull();

    // A name typed: Esc asks first, and Esc over the question keeps editing.
    let dialog = await openDialog();
    await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'Shipped');
    await user.keyboard('{Escape}');
    const question = screen.getByRole('alertdialog', { name: 'Discard your changes?' });
    expect(document.activeElement).toBe(
      within(question).getByRole('button', { name: 'Keep editing' }),
    );
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('alertdialog')).toBeNull();
    dialog = screen.getByRole('dialog', { name: 'Save a bookmark' });
    const name = within(dialog).getByRole('textbox', { name: 'Name' });
    expect((name as HTMLInputElement).value).toBe('Shipped');
    expect(document.activeElement).toBe(name);

    // Cancel asks too, and Tab keeps to the question (T405's review: the
    // dialog behind it took Tab, putting focus on the name under it).
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    const asking = screen.getByRole('alertdialog', { name: 'Discard your changes?' });
    await user.tab();
    expect(document.activeElement).toBe(
      within(asking).getByRole('button', { name: 'Discard changes' }),
    );
    await user.tab();
    expect(document.activeElement).toBe(
      within(asking).getByRole('button', { name: 'Keep editing' }),
    );
    // Discarded, the dialog closes, focus back on Bookmarks, and nothing is saved.
    await user.click(within(asking).getByRole('button', { name: 'Discard changes' }));
    expect(screen.queryByRole('dialog', { name: 'Save a bookmark' })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Bookmarks' }));
    expect(asked.filter((each) => each.method === 'POST')).toEqual([]);
  });
});

/**
 * T128 / AC-122: WHEN the user applies a bookmark, THE SYSTEM SHALL restore
 * that state without changing the dashboard's saved definition.
 * Fails when: applying a bookmark modifies the dashboard for other users.
 *
 * The popover lists the dashboard's bookmarks; choosing one hands its state,
 * as read back (`viewStateFrom`), to the dashboard to restore. It writes
 * nothing.
 */
describe('a bookmark in the list', () => {
  it('is listed by name, and choosing it hands its state on, writing nothing', async () => {
    const asked = api(
      () => new Response('{}', { status: 201 }),
      () => [
        mine('b1', 'Shipped'),
        // Read back as a view: its marks dropped, being no predicate.
        mine('b2', 'Odd', { ...STATE, marks: { m: 'x' } }),
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

    const popover = await open();
    const list = await within(popover).findByRole('list', { name: 'Mine' });
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((row) => within(row).getAllByRole('button')[0]?.textContent),
    ).toEqual(['Shipped', 'Odd']);
    await user.click(within(list).getByRole('button', { name: 'Odd' }));

    expect(applied).toEqual([['Odd', { ...STATE, marks: {} }]]);
    // The dashboard says it, once, with what it changed (T840, AC-493): not
    // this popover's region too.
    expect(screen.getByRole('status').textContent).toBe('');
    expect(asked.filter((each) => each.method !== 'GET')).toEqual([]);
  });

  it('lists one just saved', async () => {
    const saved: unknown[] = [];
    api(
      (body) => {
        saved.push(mine('b1', (body as { name: string }).name));
        return new Response(JSON.stringify(saved[0]), { status: 201 });
      },
      () => saved,
    );
    render(<Bookmarks dashboardId="d1" current={STATE} onApply={() => undefined} />);

    await saveAs('Shipped');
    await screen.findByText('Saved the bookmark “Shipped”.');

    expect((await within(await open()).findByRole('button', { name: 'Shipped' })).textContent).toBe(
      'Shipped',
    );
  });

  it('says so when there are none', async () => {
    api(() => new Response('{}', { status: 201 }));
    render(<Bookmarks dashboardId="d1" current={STATE} onApply={() => undefined} />);

    const popover = await open();

    expect((await within(popover).findByText('No bookmarks yet')).tagName).toBe('P');
    expect(within(popover).queryByRole('list')).toBeNull();
  });
});

/**
 * T367, AC-293: WHEN a user shares a bookmark, THE SYSTEM SHALL list it for
 * everyone who may see the dashboard, labelled with who shared it. Only its
 * owner SHALL be able to change or unshare it; only its owner or a
 * Super-Admin delete it (amended 2026-10-04, R61; T580).
 * `Fails when: someone who may see the dashboard doesn't see a shared
 * bookmark, someone other than its owner can change or unshare it, or
 * someone other than its owner or a Super-Admin can delete it.`
 *
 * Rule 81 (design 10, states B and C; amended by R61): Mine before Shared,
 * newest first within each — the order the API gives; a new one "Only me";
 * each row's visibility an icon and a label, a shared row naming who shared
 * it. Update, Rename and Stop sharing are its owner's alone, and Delete is
 * its owner's and, on another's shared one, a Super-Admin's (the API's
 * `mayDelete`); anyone else's "Save a copy to mine".
 */
describe('Mine and Shared (T367, AC-293)', () => {
  const ours = { ...mine('b2', 'Top 5'), shared: true };
  const theirs = {
    id: 'b3',
    dashboardId: 'd1',
    name: 'Board pack',
    state: { ...STATE, page: 'page-9' },
    shared: true,
    mine: false,
    mayDelete: false,
    sharedBy: 'Ada Admin',
  };
  const LISTED = [mine('b1', 'EMEA'), ours, theirs];
  const ok = (body: unknown, asked: Asked) =>
    new Response(
      asked.method === 'DELETE' ? null : JSON.stringify({ ...ours, ...(body as object) }),
      { status: asked.method === 'DELETE' ? 204 : 200 },
    );
  const rowOf = (popover: HTMLElement, section: 'Mine' | 'Shared', name: string) =>
    within(within(popover).getByRole('list', { name: section }))
      .getAllByRole('listitem')
      // A string name matches the whole name (Testing Library), so "Actions for …" doesn't.
      .find((row) => within(row).queryByRole('button', { name }) !== null)!;
  const actionsOf = async (popover: HTMLElement, section: 'Mine' | 'Shared', name: string) => {
    await userEvent
      .setup()
      .click(
        within(rowOf(popover, section, name)).getByRole('button', { name: `Actions for ${name}` }),
      );
    return screen.getByRole('menu', { name: `Actions for ${name}` });
  };
  const offered = (menu: HTMLElement) =>
    within(menu)
      .getAllByRole('menuitem')
      .map((item) => item.textContent);

  it('lists Mine before Shared, each in the order the API gives, with its visibility as an icon and a label', async () => {
    // Another's listed first: grouped all the same.
    api(ok, () => [theirs, mine('b1', 'EMEA'), ours]);
    render(<Bookmarks dashboardId="d1" current={STATE} onApply={() => undefined} />);

    const popover = await open();
    await within(popover).findByRole('list', { name: 'Mine' });

    expect(
      within(popover)
        .getAllByRole('heading')
        .map((each) => each.textContent),
    ).toEqual(['Mine', 'Shared']);
    // The icon, hidden from assistive technology beside its label, by what it
    // draws (design 10): one person for "Only me", two for Shared (T367's review).
    const visibility = (section: 'Mine' | 'Shared', name: string) => {
      const label = rowOf(popover, section, name).querySelector('.bookmarks__visibility');
      const icon = label?.querySelector('svg[aria-hidden="true"]');
      return [icon?.querySelectorAll('circle').length, label?.textContent];
    };
    expect(visibility('Mine', 'EMEA')).toEqual([1, 'Only me']);
    expect(visibility('Mine', 'Top 5')).toEqual([2, 'Shared']);
    expect(visibility('Shared', 'Board pack')).toEqual([2, 'Shared by Ada Admin']);
    expect(
      within(within(popover).getByRole('list', { name: 'Mine' }))
        .getAllByRole('listitem')
        .map((row) => within(row).getAllByRole('button')[0]?.textContent),
    ).toEqual(['EMEA', 'Top 5']);
  });

  it('offers its owner Apply, Update, Rename, Share and Delete, and Stop sharing once it is shared', async () => {
    api(ok, () => LISTED);
    render(<Bookmarks dashboardId="d1" current={STATE} onApply={() => undefined} />);
    let popover = await open();
    await within(popover).findByRole('list', { name: 'Mine' });

    expect(offered(await actionsOf(popover, 'Mine', 'EMEA'))).toEqual([
      'Apply',
      'Update',
      'Rename…',
      'Share with everyone who can see this dashboard…',
      'Delete',
    ]);
    await userEvent.setup().keyboard('{Escape}');
    popover = screen.getByRole('dialog', { name: 'Bookmarks' });
    expect(offered(await actionsOf(popover, 'Mine', 'Top 5'))).toEqual([
      'Apply',
      'Update',
      'Rename…',
      'Stop sharing',
      'Delete',
    ]);
  });

  it('offers anyone else’s only Apply and Save a copy to mine, where the API says it may not delete it', async () => {
    const applied: [string, unknown][] = [];
    api(ok, () => LISTED);
    render(
      <Bookmarks
        dashboardId="d1"
        current={STATE}
        onApply={(state, name) => applied.push([name, state])}
      />,
    );
    const popover = await open();
    await within(popover).findByRole('list', { name: 'Shared' });

    const menu = await actionsOf(popover, 'Shared', 'Board pack');
    expect(offered(menu)).toEqual(['Apply', 'Save a copy to mine…']);
    await userEvent.setup().click(within(menu).getByRole('menuitem', { name: 'Apply' }));

    expect(applied).toEqual([['Board pack', { ...STATE, page: 'page-9' }]]);
    expect(screen.queryByRole('dialog', { name: 'Bookmarks' })).toBeNull();
  });

  /**
   * T762 (AC-429): with sign-in on, a Super-Admin is listed phase 1's
   * unshared bookmarks too: under Shared, labelled "Saved before sign-in",
   * theirs to apply or copy and not to delete (the coordinator's call,
   * 2026-10-08, overturnable). The API says which they are.
   */
  it('lists one saved before sign-in under Shared, so labelled, to apply or copy only', async () => {
    const before = {
      id: 'b9',
      dashboardId: 'd1',
      name: 'Old view',
      state: STATE,
      shared: false,
      mine: false,
      mayDelete: false,
      sharedBy: '',
      savedBeforeSignIn: true,
    };
    api(ok, () => [mine('b1', 'EMEA'), before]);
    render(<Bookmarks dashboardId="d1" current={STATE} onApply={() => undefined} />);
    const popover = await open();
    await within(popover).findByRole('list', { name: 'Shared' });

    expect(
      rowOf(popover, 'Shared', 'Old view').querySelector('.bookmarks__visibility')?.textContent,
    ).toBe('Saved before sign-in');
    expect(offered(await actionsOf(popover, 'Shared', 'Old view'))).toEqual([
      'Apply',
      'Save a copy to mine…',
    ]);
  });

  /**
   * T580 (AC-293, amended 2026-10-04 by R61): a Super-Admin may delete any
   * shared bookmark. Whether they may is the API's to say, as `mayDelete`.
   */
  it('offers Delete on another’s shared one where the API says it may be deleted, and deletes it', async () => {
    const asked = api(ok, () => [mine('b1', 'EMEA'), { ...theirs, mayDelete: true }]);
    const user = userEvent.setup();
    render(<Bookmarks dashboardId="d1" current={STATE} onApply={() => undefined} />);
    const popover = await open();
    await within(popover).findByRole('list', { name: 'Shared' });

    const menu = await actionsOf(popover, 'Shared', 'Board pack');
    expect(offered(menu)).toEqual(['Apply', 'Save a copy to mine…', 'Delete']);
    await user.click(within(menu).getByRole('menuitem', { name: 'Delete' }));

    await assertSaid('Deleted the bookmark “Board pack”.');
    expect(asked.filter((each) => each.method !== 'GET')).toEqual([
      { url: '/api/dashboards/d1/bookmarks/b3', method: 'DELETE' },
    ]);
  });

  it('shares one only once asked, saying who will see it', async () => {
    const asked = api(ok, () => LISTED);
    const user = userEvent.setup();
    render(<Bookmarks dashboardId="d1" current={STATE} onApply={() => undefined} />);
    const share = async () => {
      const popover = await open();
      await within(popover).findByRole('list', { name: 'Mine' });
      await user.click(
        within(await actionsOf(popover, 'Mine', 'EMEA')).getByRole('menuitem', {
          name: 'Share with everyone who can see this dashboard…',
        }),
      );
      return screen.getByRole('dialog', { name: 'Share “EMEA”?' });
    };

    let dialog = await share();
    expect(dialog.textContent).toContain(
      'Everyone who can see this dashboard will see it under Shared, labelled with your name. You can stop sharing at any time.',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(asked.filter((each) => each.method !== 'GET')).toEqual([]);

    dialog = await share();
    await user.click(within(dialog).getByRole('button', { name: 'Share' }));

    expect(asked.filter((each) => each.method !== 'GET')).toEqual([
      { url: '/api/dashboards/d1/bookmarks/b1', method: 'PATCH', body: { shared: true } },
    ]);
    expect((await screen.findByRole('status')).textContent).toBe('Shared the bookmark “EMEA”.');
    expect(screen.queryByRole('dialog', { name: 'Share “EMEA”?' })).toBeNull();
  });

  it('stops sharing one, updates one to what the dashboard shows now, and deletes one', async () => {
    const asked = api(ok, () => LISTED);
    const user = userEvent.setup();
    render(<Bookmarks dashboardId="d1" current={STATE} onApply={() => undefined} />);
    const choose = async (name: string, action: string) => {
      const popover = await open();
      await within(popover).findByRole('list', { name: 'Mine' });
      await user.click(
        within(await actionsOf(popover, 'Mine', name)).getByRole('menuitem', { name: action }),
      );
    };

    await choose('Top 5', 'Stop sharing');
    await assertSaid('Stopped sharing the bookmark “Top 5”.');
    await choose('EMEA', 'Update');
    await assertSaid('Updated the bookmark “EMEA”.');
    await choose('EMEA', 'Delete');
    await assertSaid('Deleted the bookmark “EMEA”.');

    expect(asked.filter((each) => each.method !== 'GET')).toEqual([
      { url: '/api/dashboards/d1/bookmarks/b2', method: 'PATCH', body: { shared: false } },
      { url: '/api/dashboards/d1/bookmarks/b1', method: 'PATCH', body: { state: STATE } },
      { url: '/api/dashboards/d1/bookmarks/b1', method: 'DELETE' },
    ]);
  });

  it('renames one under the name given, and says why one was not', async () => {
    let refuse = true;
    const asked = api(
      (body, one) =>
        refuse
          ? new Response(
              JSON.stringify({
                error: 'You already have a bookmark of that name on this dashboard.',
              }),
              { status: 409 },
            )
          : ok(body, one),
      () => LISTED,
    );
    const user = userEvent.setup();
    render(<Bookmarks dashboardId="d1" current={STATE} onApply={() => undefined} />);
    const popover = await open();
    await within(popover).findByRole('list', { name: 'Mine' });
    await user.click(
      within(await actionsOf(popover, 'Mine', 'EMEA')).getByRole('menuitem', { name: 'Rename…' }),
    );

    // Untouched, its name as it opened: Esc closes it at once (T405's follow-up).
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Rename the bookmark' })).toBeNull();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    const again = await open();
    await within(again).findByRole('list', { name: 'Mine' });
    await user.click(
      within(await actionsOf(again, 'Mine', 'EMEA')).getByRole('menuitem', { name: 'Rename…' }),
    );

    const dialog = screen.getByRole('dialog', { name: 'Rename the bookmark' });
    const field = within(dialog).getByRole('textbox', { name: 'Name' });
    expect(field).toHaveProperty('value', 'EMEA');
    await user.clear(field);
    await user.type(field, 'Top 5');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect((await within(dialog).findByRole('alert')).textContent).toBe(
      'The bookmark was not renamed: You already have a bookmark of that name on this dashboard.',
    );

    refuse = false;
    await user.clear(field);
    await user.type(field, 'EMEA, last quarter');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await assertSaid('Renamed the bookmark “EMEA” to “EMEA, last quarter”.');
    expect(screen.queryByRole('dialog', { name: 'Rename the bookmark' })).toBeNull();
    expect(asked.filter((each) => each.method !== 'GET')).toEqual([
      { url: '/api/dashboards/d1/bookmarks/b1', method: 'PATCH', body: { name: 'Top 5' } },
      {
        url: '/api/dashboards/d1/bookmarks/b1',
        method: 'PATCH',
        body: { name: 'EMEA, last quarter' },
      },
    ]);
  });

  it('saves a copy of another’s to mine, under a name given, holding what theirs holds', async () => {
    const asked = api(
      (body) =>
        new Response(JSON.stringify(mine('b4', (body as { name: string }).name)), { status: 201 }),
      () => LISTED,
    );
    const user = userEvent.setup();
    render(<Bookmarks dashboardId="d1" current={STATE} onApply={() => undefined} />);
    const popover = await open();
    await within(popover).findByRole('list', { name: 'Shared' });
    await user.click(
      within(await actionsOf(popover, 'Shared', 'Board pack')).getByRole('menuitem', {
        name: 'Save a copy to mine…',
      }),
    );

    const dialog = screen.getByRole('dialog', { name: 'Save a copy to mine' });
    expect(within(dialog).getByRole('textbox', { name: 'Name' })).toHaveProperty(
      'value',
      'Board pack',
    );
    // Yours alone when new; one of yours of its name stays as shared as it was
    // (T367's review: it isn't always "for you alone").
    expect(dialog.textContent).toContain(
      'Keeps what “Board pack” holds. A new bookmark is yours alone until you share it; one of yours of the same name on this dashboard is replaced, and stays shared if it was.',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(asked.filter((each) => each.method !== 'GET')).toEqual([
      {
        url: '/api/dashboards/d1/bookmarks',
        method: 'POST',
        body: { name: 'Board pack', state: theirs.state },
      },
    ]);
    await assertSaid('Saved the bookmark “Board pack”.');
  });

  it('reads the list again each time it opens, so one shared since is listed (T367’s review)', async () => {
    let listed: unknown[] = [mine('b1', 'EMEA')];
    api(ok, () => listed);
    const user = userEvent.setup();
    render(<Bookmarks dashboardId="d1" current={STATE} onApply={() => undefined} />);
    let popover = await open();
    await within(popover).findByRole('list', { name: 'Mine' });
    expect(within(popover).queryByRole('list', { name: 'Shared' })).toBeNull();
    await user.keyboard('{Escape}');

    // Shared by someone else while the dashboard is open.
    listed = [mine('b1', 'EMEA'), theirs];
    popover = await open();

    const shared = await within(popover).findByRole('list', { name: 'Shared' });
    expect(
      within(shared)
        .getAllByRole('listitem')
        .map((row) => row.textContent),
      // Its ⋯ is design 10's dots icon now, read by its name (T742, D10-11).
    ).toEqual(['Board packShared by Ada Admin']);
  });

  it('takes focus as it opens, and gives it back to Bookmarks on Escape (rule 85)', async () => {
    api(ok, () => LISTED);
    const user = userEvent.setup();
    render(<Bookmarks dashboardId="d1" current={STATE} onApply={() => undefined} />);

    const popover = await open();
    expect(popover.contains(document.activeElement)).toBe(true);
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog', { name: 'Bookmarks' })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Bookmarks' }));
  });
});

/**
 * T742 (AC-343, AC-293; design 10, state B; D10-04 to D10-06, D10-11; R76:
 * design-10-Q1 to Q3): the Bookmarks button carries design 10's bookmark icon
 * and the designs' svg chevron; each row says when it was first saved, after
 * its visibility; its ⋯ is a 24 px icon button drawing design 10's dots; and
 * the footer is "＋ Bookmark this view…", design 10's accent link.
 */
describe('as design 10 draws it (T742)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('draws the button with the bookmark icon and an svg chevron, and no text glyph', () => {
    api(() => new Response('{}'));
    render(<Bookmarks dashboardId="d1" current={STATE} onApply={() => undefined} />);

    const button = screen.getByRole('button', { name: 'Bookmarks' });
    expect(button.textContent).toBe('Bookmarks');
    const icons = button.querySelectorAll('svg[aria-hidden="true"]');
    expect(icons).toHaveLength(2);
    expect(icons[0]?.getAttribute('data-icon')).toBe('bookmark');
    expect(icons[1]?.getAttribute('data-icon')).toBe('chevron');
    // The bookmark icon first, then the word, then the chevron.
    expect(button.firstElementChild).toBe(icons[0]);
    expect(button.lastElementChild).toBe(icons[1]);
  });

  it('says on each row when it was first saved, after its visibility', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 17, 15, 30));
    api(
      () => new Response('{}'),
      () => [
        { ...mine('b1', 'EMEA'), savedAt: new Date(2026, 9, 17, 9).toISOString() },
        { ...mine('b2', 'Top 5'), shared: true, savedAt: new Date(2026, 8, 22, 9).toISOString() },
        {
          id: 'b3',
          dashboardId: 'd1',
          name: 'Board pack',
          state: STATE,
          shared: true,
          mine: false,
          mayDelete: false,
          sharedBy: 'Ada Admin',
          savedAt: new Date(2026, 8, 20, 9).toISOString(),
        },
      ],
    );
    render(<Bookmarks dashboardId="d1" current={STATE} onApply={() => undefined} />);
    const popover = await open();
    await within(popover).findByRole('list', { name: 'Shared' });

    expect(
      [...popover.querySelectorAll('.bookmarks__visibility')].map((each) => each.textContent),
    ).toEqual(['Only me · today', 'Shared · 22 Sep', 'Shared by Ada Admin · 20 Sep']);
  });

  it('draws each row’s ⋯ as a 24 px icon button with the dots icon, named for its bookmark', async () => {
    api(
      () => new Response('{}'),
      () => [mine('b1', 'EMEA')],
    );
    render(<Bookmarks dashboardId="d1" current={STATE} onApply={() => undefined} />);
    const popover = await open();

    const actions = await within(popover).findByRole('button', { name: 'Actions for EMEA' });
    expect(actions.classList.contains('icon-button')).toBe(true);
    expect(actions.classList.contains('icon-button--sm')).toBe(true);
    expect(actions.textContent).toBe('');
    expect(actions.querySelector('svg[aria-hidden="true"]')?.getAttribute('data-icon')).toBe(
      'dots',
    );
  });

  it('ends with "Bookmark this view…" as design 10’s accent link, with its plus icon', async () => {
    api(() => new Response('{}'));
    render(<Bookmarks dashboardId="d1" current={STATE} onApply={() => undefined} />);
    const popover = await open();

    const foot = within(popover).getByRole('button', { name: 'Bookmark this view…' });
    expect(foot.className).toBe('btn link bookmarks__add');
    expect(foot.firstElementChild?.getAttribute('data-icon')).toBe('plus');
    expect(foot.textContent).toBe('Bookmark this view…');
  });
});
