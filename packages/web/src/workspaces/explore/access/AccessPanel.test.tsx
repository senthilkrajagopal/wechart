import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AccessPanel, type AccessAnswer } from './AccessPanel';

/**
 * T330: the Access panel (direction.md §7e and rules 62–66), redrawn by T473
 * as the 2026-09-27 design 07 draws it (AC-343).
 *
 * AC-259: a Super-Admin or read-write member sets any number of read-only and
 * read-write AD groups, each optional, never a person.
 * AC-260: an unset setting takes the parent's, shown with the folder each
 * inherited group comes from.
 * AC-399: the read-write help line reads as design 16's state J rewords it.
 */
const TITLES: Record<string, string> = {
  root: 'Shared',
  sales: 'Sales',
  emea: 'EMEA',
  finance: 'Finance',
};
const PATHS: Record<string, string> = {
  root: 'Shared',
  sales: 'Sales',
  emea: 'Sales / EMEA',
  finance: 'Finance',
};

const EMEA: AccessAnswer = {
  folderId: 'emea',
  setting: { readOnly: ['emea-viewers'], readWrite: null },
  effective: {
    readOnly: [
      { group: 'emea-viewers', from: 'emea', setHere: true },
      { group: 'all-staff', from: 'root', setHere: false },
    ],
    readWrite: [{ group: 'sales-rw', from: 'sales', setHere: false }],
  },
  inherited: {
    readOnly: [{ group: 'all-staff', from: 'root', setHere: false }],
    readWrite: [{ group: 'sales-rw', from: 'sales', setHere: false }],
  },
  onlySuperAdmins: false,
};

/** The writer's own read-write group, set here and nowhere above. */
const OWN: AccessAnswer = {
  folderId: 'emea',
  setting: { readOnly: null, readWrite: ['sales-rw'] },
  effective: { readOnly: [], readWrite: [{ group: 'sales-rw', from: 'emea', setHere: true }] },
  inherited: { readOnly: [], readWrite: [] },
  onlySuperAdmins: false,
};

const NONE = { readOnly: [], readWrite: [] };

let answer: AccessAnswer;
let puts: unknown[];
/** `GET /api/access/known-groups`: the groups set on folders the editor may see, and where. */
let known: Record<string, string[]>;
/** How the next PUT is answered, when not as asked. */
let refuseNextPut: { status: number; error: string } | undefined;
/** How GETs of the folder's access are answered, when not with `answer`. */
let refuseGets: { status: number; error: string } | undefined;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

beforeEach(() => {
  answer = EMEA;
  puts = [];
  known = {};
  refuseNextPut = undefined;
  refuseGets = undefined;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/access/known-groups') {
        return json({ groups: Object.keys(known).sort(), usedOn: known });
      }
      expect(url).toBe(`/api/folders/${answer.folderId}/access`);
      if (init?.method === 'PUT') {
        const body = JSON.parse(String(init.body)) as AccessAnswer['setting'];
        puts.push(body);
        if (refuseNextPut !== undefined) {
          const refused = refuseNextPut;
          refuseNextPut = undefined;
          return json({ error: refused.error }, refused.status);
        }
        answer = { ...answer, setting: body };
      } else if (refuseGets !== undefined) {
        return json({ error: refuseGets.error }, refuseGets.status);
      }
      return json(answer);
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function show(
  overrides: Partial<Parameters<typeof AccessPanel>[0]> = {},
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
): {
  onOpenFolder: ReturnType<typeof vi.fn>;
  onClose: ReturnType<typeof vi.fn>;
} {
  const onOpenFolder = vi.fn();
  const onClose = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <AccessPanel
        folderId={answer.folderId}
        folderPath={PATHS[answer.folderId] ?? answer.folderId}
        parent={{ id: 'sales', title: 'Sales' }}
        titleOf={(id) => TITLES[id] ?? id}
        pathOf={(id) => PATHS[id] ?? id}
        myGroups={['sales-rw']}
        superAdmin={false}
        onOpenFolder={onOpenFolder}
        onClose={onClose}
        {...overrides}
      />
    </QueryClientProvider>,
  );
  return { onOpenFolder, onClose };
}

const section = (name: RegExp) => screen.getByRole('region', { name });
const shown = () => screen.findByRole('region', { name: /read-write groups/i });
const saveButton = () => screen.getByRole('button', { name: /^save/i });

describe('the Access panel (T330, AC-259, AC-260; rules 62–66)', () => {
  it('lists read-write groups before read-only ones, each split into set here and from ancestors', async () => {
    show();
    const readWrite = await shown();
    const readOnly = section(/read-only groups/i);
    // Read-write first in the panel (rule 62).
    expect(readWrite.compareDocumentPosition(readOnly) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    for (const region of [readWrite, readOnly]) {
      expect(within(region).getByText('Set here').tagName).toBe('H4');
      expect(within(region).getByText('From ancestors').tagName).toBe('H4');
    }
  });

  it('shows each inherited group locked, from its source folder as a link, and no remove', async () => {
    const { onOpenFolder } = show();
    const readOnly = await screen.findByRole('region', { name: /read-only groups/i });
    const inherited = within(readOnly).getByRole('listitem', { name: /all-staff/ });
    expect(within(inherited).getByLabelText('Inherited').tagName).toBe('svg');
    expect(within(inherited).queryByRole('button', { name: /remove/i })).toBe(null);
    // "from Shared", its tooltip saying how a grant reaches down (design 07, pin 5).
    expect(inherited.textContent).toContain('from Shared');
    expect(inherited.getAttribute('title')).toBe(
      'Set on Shared. A grant reaches every folder below it.',
    );
    await userEvent.click(within(inherited).getByRole('button', { name: 'Shared' }));
    expect(onOpenFolder).toHaveBeenCalledWith('root');

    const readWrite = section(/read-write groups/i);
    const fromSales = within(readWrite).getByRole('listitem', { name: /sales-rw/ });
    expect(within(fromSales).getByRole('button', { name: 'Sales' }).textContent).toBe('Sales');
    // A group set here can be removed, the list named in its label (pin 4).
    const own = within(readOnly).getByRole('listitem', { name: /emea-viewers/ });
    expect(
      within(own).getByRole('button', { name: 'Remove emea-viewers from read-only' }).tagName,
    ).toBe('BUTTON');
  });

  it('says an unset list inherits from the parent folder, as a link to it', async () => {
    const { onOpenFolder } = show();
    const readWrite = await shown();
    const unset = within(readWrite).getByText(/^Not set here\. Inherits from/);
    expect(unset.textContent).toBe('Not set here. Inherits from Sales.');
    await userEvent.click(within(unset).getByRole('button', { name: 'Sales' }));
    expect(onOpenFolder).toHaveBeenCalledWith('sales');
  });

  // Design 07, state C (rule 63, AC-267).
  it('says when only Super-Admins can see the folder, and that no folder above sets any', async () => {
    answer = {
      folderId: 'emea',
      setting: { readOnly: null, readWrite: null },
      effective: { readOnly: [], readWrite: [] },
      inherited: NONE,
      onlySuperAdmins: true,
    };
    show({ superAdmin: true });
    const alone = await screen.findByText('Only Super-Admins can see this folder.');
    expect(alone.closest('[role="note"]')?.textContent).toBe(
      'Only Super-Admins can see this folder. Add a group to either list to give people access.',
    );
    for (const region of [section(/read-write groups/i), section(/read-only groups/i)]) {
      expect(within(region).getByText('Not set here, and no folder above sets any.').tagName).toBe(
        'P',
      );
      expect(within(region).queryByText('From ancestors')).toBe(null);
      expect(within(region).getByRole('button', { name: 'Add group' }).tagName).toBe('BUTTON');
    }
  });

  it('says which grant outranks a read-only group an ancestor gives read-write', async () => {
    answer = {
      folderId: 'emea',
      setting: { readOnly: ['sales-rw'], readWrite: null },
      effective: {
        readOnly: [{ group: 'sales-rw', from: 'emea', setHere: true }],
        readWrite: [{ group: 'sales-rw', from: 'sales', setHere: false }],
      },
      inherited: {
        readOnly: [],
        readWrite: [{ group: 'sales-rw', from: 'sales', setHere: false }],
      },
      onlySuperAdmins: false,
    };
    const { onOpenFolder } = show();
    const readOnly = await screen.findByRole('region', { name: /read-only groups/i });
    const note = within(readOnly).getByText(/outranks this/);
    expect(note.textContent).toBe('Read-write from Sales outranks this.');
    await userEvent.click(within(note).getByRole('button', { name: 'Sales' }));
    expect(onOpenFolder).toHaveBeenCalledWith('sales');
  });
});

describe('the Access panel as design 07 draws it (T473, AC-343)', () => {
  it('is titled with the folder’s path, and says under each list what its level allows', async () => {
    show();
    const readWrite = await shown();
    const panel = screen.getByRole('complementary', { name: 'Access Sales / EMEA' });
    expect(within(panel).getByRole('heading', { level: 2 }).textContent).toBe('Access');
    // Design 16's state J rewording of the read-write help (R56, AC-399).
    expect(within(readWrite).getByTestId('access-help').textContent).toBe(
      'Propose changes, create subfolders, set access, and build and schedule this folder’s pre-aggregations. They also see every folder above, view-only, but not its pre-aggregations in Jobs.',
    );
    expect(within(section(/read-only groups/i)).getByTestId('access-help').textContent).toBe(
      'See dashboards here, in every folder below and in every folder above. Nothing else.',
    );
  });

  it('adds a group inside each list, marked Adding, and saves only on Save', async () => {
    show();
    const readWrite = await shown();
    expect((saveButton() as HTMLButtonElement).disabled).toBe(true);

    await userEvent.click(within(readWrite).getByRole('button', { name: 'Add group' }));
    const picker = within(readWrite).getByRole('combobox', { name: 'AD group' });
    expect(document.activeElement).toBe(picker);
    expect(picker.getAttribute('placeholder')).toBe('Group, as your identity provider sends it');
    await userEvent.type(picker, 'emea-writers{Enter}');

    const added = within(readWrite).getByRole('listitem', { name: /emea-writers/ });
    expect(within(added).getByText('Adding').textContent).toBe('Adding');
    expect(screen.getByRole('button', { name: 'Save 1 change' }).tagName).toBe('BUTTON');
    // Nothing is sent until Save (rule 65).
    expect(puts).toEqual([]);

    await userEvent.click(screen.getByRole('button', { name: 'Save 1 change' }));
    await screen.findByText('Access saved for Sales / EMEA · 1 change');
    expect(puts).toEqual([{ readOnly: ['emea-viewers'], readWrite: ['emea-writers'] }]);
  });

  it('marks a removal Removing, with Keep to take it back before Save', async () => {
    show();
    const readOnly = await screen.findByRole('region', { name: /read-only groups/i });
    await userEvent.click(
      within(readOnly).getByRole('button', { name: 'Remove emea-viewers from read-only' }),
    );
    const removing = within(readOnly).getByRole('listitem', { name: /emea-viewers/ });
    expect(within(removing).getByText('Removing').textContent).toBe('Removing');
    expect(screen.getByRole('button', { name: 'Save 1 change' }).tagName).toBe('BUTTON');
    // Focus goes to the Keep that took the Remove's place, not to the page.
    expect(document.activeElement).toBe(
      within(removing).getByRole('button', { name: 'Keep emea-viewers' }),
    );

    await userEvent.click(within(removing).getByRole('button', { name: 'Keep emea-viewers' }));
    expect(within(readOnly).queryByText('Removing')).toBe(null);
    expect(document.activeElement).toBe(
      within(readOnly).getByRole('button', { name: 'Remove emea-viewers from read-only' }),
    );
    expect((saveButton() as HTMLButtonElement).disabled).toBe(true);

    await userEvent.click(
      within(readOnly).getByRole('button', { name: 'Remove emea-viewers from read-only' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save 1 change' }));
    await screen.findByText('Access saved for Sales / EMEA · 1 change');
    expect(puts).toEqual([{ readOnly: null, readWrite: null }]);
  });

  // Design 07, state A (rule 64): the combobox's two groups of suggestions, and free entry.
  it('suggests the editor’s groups and those used on other folders, with where, and as typed', async () => {
    known = { 'emea-viewers': ['emea'], 'finance-ro': ['finance', 'root'], 'sales-rw': ['sales'] };
    const { onClose } = show({ myGroups: ['sales-rw', 'emea-analysts'] });
    const readWrite = await shown();
    await userEvent.click(within(readWrite).getByRole('button', { name: 'Add group' }));
    const picker = within(readWrite).getByRole('combobox', { name: 'AD group' });
    // Offered as soon as the box is focused.
    const list = await screen.findByRole('listbox');
    expect(picker.getAttribute('aria-expanded')).toBe('true');
    expect(picker.getAttribute('aria-controls')).toBe(list.id);
    const yours = within(list).getByRole('group', { name: 'Your groups' });
    expect(
      within(yours)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['emea-analystsyours', 'sales-rwyours']);
    const used = within(list).getByRole('group', { name: 'Used on other folders' });
    expect(
      within(used)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['emea-viewersSales / EMEA', 'finance-roFinance +1']);

    await userEvent.type(picker, 'emea');
    expect(
      within(list)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['emea-analystsyours', 'emea-viewersSales / EMEA', 'Add “emea” as typed']);
    // APG keys: Down moves to an option, Enter takes it.
    await userEvent.keyboard('{ArrowDown}');
    const first = within(list).getByRole('option', { name: /^emea-analysts/ });
    expect(picker.getAttribute('aria-activedescendant')).toBe(first.id);
    expect(first.getAttribute('aria-selected')).toBe('true');
    await userEvent.keyboard('{Enter}');
    expect(
      within(within(readWrite).getByRole('listitem', { name: /emea-analysts/ })).getByText('Adding')
        .textContent,
    ).toBe('Adding');
    // A group set here is not offered for it again.
    await userEvent.type(picker, 'emea');
    expect(
      within(screen.getByRole('listbox'))
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['emea-viewersSales / EMEA', 'Add “emea” as typed']);
    // Escape closes the suggestions, then the box, back to its Add group.
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).toBe(null);
    expect(picker.getAttribute('aria-expanded')).toBe('false');
    await userEvent.keyboard('{Escape}');
    expect(within(readWrite).queryByRole('combobox')).toBe(null);
    expect(document.activeElement).toBe(
      within(readWrite).getByRole('button', { name: 'Add group' }),
    );
    // The box's Escapes are its own: the panel stays.
    expect(onClose).not.toHaveBeenCalled();
  });

  // Design 07, state D: anchored to Save, focus on Cancel (rule 65).
  it('asks before a save that removes the editor’s own read-write access', async () => {
    answer = OWN;
    show();
    const readWrite = await shown();
    await userEvent.click(
      within(readWrite).getByRole('button', { name: 'Remove sales-rw from read-write' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save 1 change' }));

    const asking = screen.getByRole('alertdialog', {
      name: 'You’ll lose read-write access to Sales / EMEA.',
    });
    expect(asking.textContent).toContain(
      'Removing sales-rw leaves you with none of this folder’s read-write groups. Save anyway?',
    );
    expect(document.activeElement).toBe(within(asking).getByRole('button', { name: 'Cancel' }));
    await userEvent.click(within(asking).getByRole('button', { name: 'Cancel' }));
    expect(puts).toEqual([]);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Save 1 change' }));

    await userEvent.click(screen.getByRole('button', { name: 'Save 1 change' }));
    await userEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Save anyway' }),
    );
    await screen.findByText('Access saved for Sales / EMEA · 1 change');
    expect(puts).toEqual([{ readOnly: null, readWrite: null }]);
  });

  it('moves focus into the ask, and Escape keeps the access and returns to Save', async () => {
    answer = OWN;
    show();
    const readWrite = await shown();
    await userEvent.click(
      within(readWrite).getByRole('button', { name: 'Remove sales-rw from read-write' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save 1 change' }));
    const asking = screen.getByRole('alertdialog');
    expect(document.activeElement).toBe(within(asking).getByRole('button', { name: 'Cancel' }));
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('alertdialog')).toBe(null);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Save 1 change' }));
    expect(puts).toEqual([]);
  });

  /**
   * T330's review: a group set here and above too is in the effective lists
   * once, as set here; the ancestor's grant is still shown, and removing the
   * group here takes nothing away that the ancestor keeps giving.
   */
  it('shows an ancestor’s grant of a group set here too, and doesn’t warn of losing it', async () => {
    answer = {
      ...OWN,
      inherited: {
        readOnly: [],
        readWrite: [{ group: 'sales-rw', from: 'sales', setHere: false }],
      },
    };
    show();
    const readWrite = await shown();
    // Set here, and from Sales.
    const rows = within(readWrite).getAllByRole('listitem', { name: /sales-rw/ });
    expect(rows).toHaveLength(2);
    expect(within(rows[1]!).getByRole('button', { name: 'Sales' }).textContent).toBe('Sales');

    await userEvent.click(
      within(readWrite).getByRole('button', { name: 'Remove sales-rw from read-write' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save 1 change' }));
    expect(screen.queryByRole('alertdialog')).toBe(null);
    await screen.findByText('Access saved for Sales / EMEA · 1 change');
    expect(puts).toEqual([{ readOnly: null, readWrite: null }]);
  });

  // Design 07, state E (rule 65): Undo in a toast, recorded as another change.
  it('undoes the last save from its toast', async () => {
    show();
    const readOnly = await screen.findByRole('region', { name: /read-only groups/i });
    await userEvent.click(
      within(readOnly).getByRole('button', { name: 'Remove emea-viewers from read-only' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save 1 change' }));
    const toast = (await screen.findByText('Access saved for Sales / EMEA · 1 change')).closest(
      '[role="status"]',
    );
    expect(toast).not.toBe(null);
    await userEvent.click(within(toast as HTMLElement).getByRole('button', { name: 'Undo' }));
    await vi.waitFor(() =>
      expect(puts).toEqual([
        { readOnly: null, readWrite: null },
        { readOnly: ['emea-viewers'], readWrite: null },
      ]),
    );
  });

  it('offers no Undo after the editor removes their own access', async () => {
    answer = OWN;
    show();
    const readWrite = await shown();
    await userEvent.click(
      within(readWrite).getByRole('button', { name: 'Remove sales-rw from read-write' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save 1 change' }));
    await userEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Save anyway' }),
    );
    await screen.findByText('Access saved for Sales / EMEA · 1 change');
    expect(screen.queryByRole('button', { name: 'Undo' })).toBe(null);
  });

  // Pin 9 and rule 85: Cancel, and Escape, ask first when there are changes.
  it('closes on Cancel, asking first when there are changes', async () => {
    const { onClose } = show();
    const readOnly = await screen.findByRole('region', { name: /read-only groups/i });
    expect(
      screen.getByText('Changes apply when saved, and every one is recorded in the audit trail.')
        .tagName,
    ).toBe('P');

    await userEvent.click(
      within(readOnly).getByRole('button', { name: 'Remove emea-viewers from read-only' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    const asking = screen.getByRole('alertdialog', { name: 'Discard your changes?' });
    expect(asking.textContent).toContain(
      'Your 1 change to the access of Sales / EMEA isn’t saved.',
    );
    expect(document.activeElement).toBe(
      within(asking).getByRole('button', { name: 'Keep editing' }),
    );
    await userEvent.click(within(asking).getByRole('button', { name: 'Keep editing' }));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Save 1 change' }).tagName).toBe('BUTTON');

    await userEvent.keyboard('{Escape}');
    await userEvent.click(
      within(screen.getByRole('alertdialog', { name: 'Discard your changes?' })).getByRole(
        'button',
        { name: 'Discard changes' },
      ),
    );
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(puts).toEqual([]);
  });

  it('closes on Cancel or Escape at once when nothing is changed', async () => {
    const { onClose } = show();
    await shown();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alertdialog')).toBe(null);
  });

  // Design 07, state G: a save error keeps the edits, with Retry and Details.
  it('keeps the changes when a save fails, with Retry and Details', async () => {
    show();
    const readOnly = await screen.findByRole('region', { name: /read-only groups/i });
    await userEvent.click(
      within(readOnly).getByRole('button', { name: 'Remove emea-viewers from read-only' }),
    );
    refuseNextPut = { status: 500, error: 'The store is down.' };
    await userEvent.click(screen.getByRole('button', { name: 'Save 1 change' }));
    const failed = await screen.findByRole('alert');
    expect(within(failed).getByText('Couldn’t save. Your 1 change is kept.').tagName).toBe('SPAN');
    expect(within(failed).getByText('The store is down.').tagName).toBe('P');
    expect(within(readOnly).getByText('Removing').textContent).toBe('Removing');

    await userEvent.click(within(failed).getByRole('button', { name: 'Retry' }));
    await screen.findByText('Access saved for Sales / EMEA · 1 change');
    expect(puts).toEqual([
      { readOnly: null, readWrite: null },
      { readOnly: null, readWrite: null },
    ]);
  });

  // Design 07, state G: access lost while open turns the panel read-only.
  it('turns read-only, saying so, when the editor’s access goes while it is open', async () => {
    show();
    const readOnly = await screen.findByRole('region', { name: /read-only groups/i });
    await userEvent.click(
      within(readOnly).getByRole('button', { name: 'Remove emea-viewers from read-only' }),
    );
    refuseNextPut = {
      status: 403,
      error: 'Only a Super-Admin or a read-write member of this folder can change its groups.',
    };
    await userEvent.click(screen.getByRole('button', { name: 'Save 1 change' }));
    expect(
      (
        await screen.findByText(
          'You can no longer change access here. The lists below are read-only.',
        )
      ).tagName,
    ).toBe('SPAN');
    expect(screen.queryByRole('button', { name: 'Add group' })).toBe(null);
    expect(screen.queryByRole('button', { name: /^Remove / })).toBe(null);
    expect(screen.queryByRole('button', { name: /^save/i })).toBe(null);
  });

  // Design 07, state G: a load error has Retry and Details.
  it('says when the folder’s access couldn’t be loaded, with Retry and Details', async () => {
    refuseGets = { status: 500, error: 'The store is down.' };
    show();
    const failed = await screen.findByRole('alert');
    expect(within(failed).getByText('Couldn’t load access for this folder.').tagName).toBe('SPAN');
    expect(within(failed).getByText('The store is down.').tagName).toBe('P');
    refuseGets = undefined;
    await userEvent.click(within(failed).getByRole('button', { name: 'Retry' }));
    expect((await shown()).tagName).toBe('SECTION');
  });

  // T330's review: a save changes what the folders beneath inherit.
  it('refreshes every folder’s cached access after a save, not only this one’s', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(['folder-access', 'beneath'], { ...EMEA, folderId: 'beneath' });
    show({}, client);
    const readOnly = await screen.findByRole('region', { name: /read-only groups/i });
    await userEvent.click(
      within(readOnly).getByRole('button', { name: 'Remove emea-viewers from read-only' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save 1 change' }));
    await screen.findByText('Access saved for Sales / EMEA · 1 change');
    expect(client.getQueryState(['folder-access', 'beneath'])?.isInvalidated).toBe(true);
  });

  it('takes focus when it opens', async () => {
    show();
    await shown();
    expect(document.activeElement).toBe(
      screen.getByRole('complementary', { name: 'Access Sales / EMEA' }),
    );
  });

  // T473's review: Retry is a save like Save's, which asks first (state D).
  it('asks before a Retry that would remove the editor’s own read-write access', async () => {
    answer = OWN;
    show();
    const readOnly = await screen.findByRole('region', { name: /read-only groups/i });
    await userEvent.click(within(readOnly).getByRole('button', { name: 'Add group' }));
    await userEvent.type(
      within(readOnly).getByRole('combobox', { name: 'AD group' }),
      'extra{Enter}',
    );
    refuseNextPut = { status: 500, error: 'The store is down.' };
    await userEvent.click(screen.getByRole('button', { name: 'Save 1 change' }));
    const failed = await screen.findByRole('alert');
    await userEvent.click(
      within(section(/read-write groups/i)).getByRole('button', {
        name: 'Remove sales-rw from read-write',
      }),
    );
    await userEvent.click(within(failed).getByRole('button', { name: 'Retry' }));
    expect(
      screen.getByRole('alertdialog', { name: 'You’ll lose read-write access to Sales / EMEA.' })
        .tagName,
    ).toBe('DIV');
    expect(puts).toHaveLength(1);
  });

  // Design 07, state D: "Not asked of a Super-Admin, who keeps access everywhere."
  it('doesn’t ask a Super-Admin before a save that removes their group', async () => {
    answer = OWN;
    show({ superAdmin: true });
    const readWrite = await shown();
    await userEvent.click(
      within(readWrite).getByRole('button', { name: 'Remove sales-rw from read-write' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save 1 change' }));
    await screen.findByText('Access saved for Sales / EMEA · 1 change');
    expect(screen.queryByRole('alertdialog')).toBe(null);
    expect(puts).toEqual([{ readOnly: null, readWrite: null }]);
  });

  // State G, when the folder's access is asked again after a save and refused.
  it('turns read-only when the folder’s access is refused as it is read again', async () => {
    answer = OWN;
    show();
    const readWrite = await shown();
    await userEvent.click(
      within(readWrite).getByRole('button', { name: 'Remove sales-rw from read-write' }),
    );
    // The save goes through; the reads after it are refused.
    refuseGets = {
      status: 403,
      error: 'Only a Super-Admin or a read-write member of this folder can see its groups.',
    };
    await userEvent.click(screen.getByRole('button', { name: 'Save 1 change' }));
    await userEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Save anyway' }),
    );
    expect(
      (
        await screen.findByText(
          'You can no longer change access here. The lists below are read-only.',
        )
      ).tagName,
    ).toBe('SPAN');
    expect(screen.queryByRole('button', { name: 'Add group' })).toBe(null);
  });

  // T473's review: taking back an addition leaves focus in its list, not the page.
  it('keeps focus in the list when an addition is taken back', async () => {
    show();
    const readOnly = await screen.findByRole('region', { name: /read-only groups/i });
    await userEvent.click(within(readOnly).getByRole('button', { name: 'Add group' }));
    const picker = within(readOnly).getByRole('combobox', { name: 'AD group' });
    await userEvent.type(picker, 'extra{Enter}');
    await userEvent.keyboard('{Escape}');
    await userEvent.click(
      within(readOnly).getByRole('button', { name: 'Remove extra from read-only' }),
    );
    expect(within(readOnly).queryByRole('listitem', { name: /extra/ })).toBe(null);
    await vi.waitFor(() =>
      expect(document.activeElement).toBe(
        within(readOnly).getByRole('button', { name: 'Add group' }),
      ),
    );
  });

  // Rule 63: until a group is saved, only Super-Admins see the folder still.
  it('keeps saying only Super-Admins see the folder while a group is only pending', async () => {
    answer = {
      folderId: 'emea',
      setting: { readOnly: null, readWrite: null },
      effective: { readOnly: [], readWrite: [] },
      inherited: NONE,
      onlySuperAdmins: true,
    };
    show({ superAdmin: true });
    const readWrite = await shown();
    await userEvent.click(within(readWrite).getByRole('button', { name: 'Add group' }));
    await userEvent.type(
      within(readWrite).getByRole('combobox', { name: 'AD group' }),
      'emea-writers{Enter}',
    );
    expect(screen.getByRole('button', { name: 'Save 1 change' }).tagName).toBe('BUTTON');
    expect(screen.getByText('Only Super-Admins can see this folder.').tagName).toBe('STRONG');
  });

  // T473's review: the panel follows the folder; what was pending for one
  // folder is not carried, nor brought back on returning to it.
  it('drops pending changes when it follows another folder, for good', async () => {
    const answers: Record<string, AccessAnswer> = {
      emea: EMEA,
      sales: { ...EMEA, folderId: 'sales', setting: { readOnly: ['sales-ro'], readWrite: null } },
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === '/api/access/known-groups') return json({ groups: [], usedOn: {} });
        const id = /\/api\/folders\/([^/]+)\/access/.exec(url)?.[1] ?? '';
        return json(answers[id]);
      }),
    );
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const panel = (folderId: string) => (
      <QueryClientProvider client={client}>
        <AccessPanel
          folderId={folderId}
          folderPath={PATHS[folderId] ?? folderId}
          parent={{ id: 'sales', title: 'Sales' }}
          titleOf={(id) => TITLES[id] ?? id}
          pathOf={(id) => PATHS[id] ?? id}
          myGroups={['sales-rw']}
          superAdmin={false}
          onOpenFolder={vi.fn()}
          onClose={vi.fn()}
        />
      </QueryClientProvider>
    );
    const { rerender } = render(panel('emea'));
    const readOnly = await screen.findByRole('region', { name: /read-only groups/i });
    await userEvent.click(
      within(readOnly).getByRole('button', { name: 'Remove emea-viewers from read-only' }),
    );
    expect(screen.getByRole('button', { name: 'Save 1 change' }).tagName).toBe('BUTTON');

    rerender(panel('sales'));
    await screen.findByRole('complementary', { name: 'Access Sales' });
    await screen.findByRole('listitem', { name: 'sales-ro' });
    expect((saveButton() as HTMLButtonElement).disabled).toBe(true);

    rerender(panel('emea'));
    await screen.findByRole('listitem', { name: 'emea-viewers' });
    expect(screen.queryByText('Removing')).toBe(null);
    expect((saveButton() as HTMLButtonElement).disabled).toBe(true);
  });
});
