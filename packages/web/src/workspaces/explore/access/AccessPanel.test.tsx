import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AccessPanel, type AccessAnswer } from './AccessPanel';

/**
 * T330: the Access panel (direction.md §7e and rules 62–66).
 *
 * AC-259: a Super-Admin or read-write member sets any number of read-only and
 * read-write AD groups, each optional, never a person.
 * AC-260: an unset setting takes the parent's, shown with the folder each
 * inherited group comes from.
 */
const TITLES: Record<string, string> = {
  root: 'Shared',
  sales: 'Sales',
  emea: 'EMEA',
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

const NONE = { readOnly: [], readWrite: [] };

let answer: AccessAnswer;
let puts: unknown[];
/** `GET /api/access/known-groups`: the groups set on folders the editor may see. */
let known: string[];

beforeEach(() => {
  answer = EMEA;
  puts = [];
  known = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/access/known-groups') {
        return new Response(JSON.stringify({ groups: known }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (init?.method === 'PUT') {
        const body = JSON.parse(String(init.body)) as AccessAnswer['setting'];
        puts.push(body);
        answer = { ...answer, setting: body };
      }
      expect(url).toBe(`/api/folders/${answer.folderId}/access`);
      return new Response(JSON.stringify(answer), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
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
} {
  const onOpenFolder = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <AccessPanel
        folderId={answer.folderId}
        folderTitle={TITLES[answer.folderId] ?? answer.folderId}
        parentTitle="Sales"
        titleOf={(id) => TITLES[id] ?? id}
        myGroups={['sales-rw']}
        superAdmin={false}
        onOpenFolder={onOpenFolder}
        onClose={vi.fn()}
        {...overrides}
      />
    </QueryClientProvider>,
  );
  return { onOpenFolder };
}

const section = (name: RegExp) => screen.getByRole('region', { name });

describe('the Access panel (T330, AC-259, AC-260; rules 62–66)', () => {
  it('lists read-write groups before read-only ones, each split into set here and from ancestors', async () => {
    show();
    const readWrite = await screen.findByRole('region', { name: /read-write groups/i });
    const readOnly = section(/read-only groups/i);
    // Read-write first in the panel (rule 62).
    expect(
      readWrite.compareDocumentPosition(readOnly) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    for (const region of [readWrite, readOnly]) {
      expect(within(region).getByText('Set here')).toBeTruthy();
      expect(within(region).getByText('From ancestors')).toBeTruthy();
    }
  });

  it('shows each inherited group locked, with its source folder as a link and no remove', async () => {
    const { onOpenFolder } = show();
    const readOnly = await screen.findByRole('region', { name: /read-only groups/i });
    const inherited = within(readOnly).getByRole('listitem', { name: /all-staff/ });
    expect(within(inherited).getByLabelText('Inherited')).toBeTruthy();
    expect(within(inherited).queryByRole('button', { name: /remove/i })).toBeNull();
    await userEvent.click(within(inherited).getByRole('button', { name: 'Shared' }));
    expect(onOpenFolder).toHaveBeenCalledWith('root');

    const readWrite = section(/read-write groups/i);
    const fromSales = within(readWrite).getByRole('listitem', { name: /sales-rw/ });
    expect(within(fromSales).getByRole('button', { name: 'Sales' })).toBeTruthy();
    // A group set here can be removed.
    const own = within(readOnly).getByRole('listitem', { name: /emea-viewers/ });
    expect(within(own).getByRole('button', { name: 'Remove emea-viewers' })).toBeTruthy();
  });

  it('says an unset list inherits from the parent folder', async () => {
    show();
    const readWrite = await screen.findByRole('region', { name: /read-write groups/i });
    expect(within(readWrite).getByText('Not set here. Inherits from Sales.')).toBeTruthy();
  });

  it('says when only Super-Admins can see the folder', async () => {
    answer = {
      folderId: 'emea',
      setting: { readOnly: null, readWrite: null },
      effective: { readOnly: [], readWrite: [] },
      inherited: NONE,
      onlySuperAdmins: true,
    };
    show({ superAdmin: true });
    expect(await screen.findByText('Only Super-Admins can see this folder')).toBeTruthy();
  });

  it('adds a group through the AD group picker, counts changes on Save, and saves only then', async () => {
    show();
    await screen.findByRole('region', { name: /read-write groups/i });
    const save = screen.getByRole('button', { name: /^save/i });
    expect((save as HTMLButtonElement).disabled).toBe(true);

    await userEvent.type(screen.getByLabelText('AD group'), 'emea-writers');
    await userEvent.selectOptions(screen.getByLabelText('Access'), 'Read-write');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByRole('button', { name: 'Save 1 change' })).toBeTruthy();

    await userEvent.click(
      within(section(/read-only groups/i)).getByRole('button', { name: 'Remove emea-viewers' }),
    );
    expect(screen.getByRole('button', { name: 'Save 2 changes' })).toBeTruthy();
    // Nothing is sent until Save (rule 65).
    expect(puts).toEqual([]);

    await userEvent.click(screen.getByRole('button', { name: 'Save 2 changes' }));
    await screen.findByText('Access saved.');
    expect(puts).toEqual([{ readOnly: null, readWrite: ['emea-writers'] }]);
  });

  it('asks before a save that removes the editor’s own read-write access', async () => {
    answer = {
      folderId: 'emea',
      setting: { readOnly: null, readWrite: ['sales-rw'] },
      effective: { readOnly: [], readWrite: [{ group: 'sales-rw', from: 'emea', setHere: true }] },
      inherited: NONE,
      onlySuperAdmins: false,
    };
    show();
    const readWrite = await screen.findByRole('region', { name: /read-write groups/i });
    await userEvent.click(within(readWrite).getByRole('button', { name: 'Remove sales-rw' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save 1 change' }));

    const asking = screen.getByRole('alertdialog', { name: /remove your own read-write access/i });
    expect(puts).toEqual([]);
    await userEvent.click(within(asking).getByRole('button', { name: 'Keep my access' }));
    expect(puts).toEqual([]);

    await userEvent.click(screen.getByRole('button', { name: 'Save 1 change' }));
    await userEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Remove my access' }),
    );
    await screen.findByText('Access saved.');
    expect(puts).toEqual([{ readOnly: null, readWrite: null }]);
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
    show();
    const readOnly = await screen.findByRole('region', { name: /read-only groups/i });
    expect(within(readOnly).getByText('Outranked: read-write from Sales.')).toBeTruthy();
  });

  /**
   * T330's review: a group set here and above too is in the effective lists
   * once, as set here; the ancestor's grant is still shown, and removing the
   * group here takes nothing away that the ancestor keeps giving.
   */
  it('shows an ancestor’s grant of a group set here too, and doesn’t warn of losing it', async () => {
    answer = {
      folderId: 'emea',
      setting: { readOnly: null, readWrite: ['sales-rw'] },
      effective: { readOnly: [], readWrite: [{ group: 'sales-rw', from: 'emea', setHere: true }] },
      inherited: {
        readOnly: [],
        readWrite: [{ group: 'sales-rw', from: 'sales', setHere: false }],
      },
      onlySuperAdmins: false,
    };
    show();
    const readWrite = await screen.findByRole('region', { name: /read-write groups/i });
    // Set here, and from Sales.
    const rows = within(readWrite).getAllByRole('listitem', { name: /sales-rw/ });
    expect(rows).toHaveLength(2);
    expect(within(rows[1]!).getByRole('button', { name: 'Sales' })).toBeTruthy();

    await userEvent.click(within(readWrite).getByRole('button', { name: 'Remove sales-rw' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save 1 change' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    await screen.findByText('Access saved.');
    expect(puts).toEqual([{ readOnly: null, readWrite: null }]);
  });

  // T330's review (rule 64): the picker suggests groups set on folders the editor may see.
  it('suggests the editor’s own groups and those set on folders they may see', async () => {
    known = ['finance-ro', 'emea-viewers'];
    show();
    await screen.findByRole('region', { name: /read-write groups/i });
    const picker = screen.getByLabelText('AD group');
    const list = document.getElementById(picker.getAttribute('list') ?? '');
    await vi.waitFor(() => {
      const offered = [...(list?.querySelectorAll('option') ?? [])].map((option) => option.value);
      expect(offered).toEqual(['emea-viewers', 'finance-ro', 'sales-rw']);
    });
  });

  // T330's review: a save changes what the folders beneath inherit.
  it('refreshes every folder’s cached access after a save, not only this one’s', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(['folder-access', 'beneath'], { ...EMEA, folderId: 'beneath' });
    show({}, client);
    await screen.findByRole('region', { name: /read-write groups/i });
    await userEvent.click(
      within(section(/read-only groups/i)).getByRole('button', { name: 'Remove emea-viewers' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save 1 change' }));
    await screen.findByText('Access saved.');
    expect(client.getQueryState(['folder-access', 'beneath'])?.isInvalidated).toBe(true);
  });

  // T330's review: the ask takes focus, and Escape keeps the editor's access.
  it('moves focus into the ask, and Escape keeps the access and returns to Save', async () => {
    answer = {
      folderId: 'emea',
      setting: { readOnly: null, readWrite: ['sales-rw'] },
      effective: { readOnly: [], readWrite: [{ group: 'sales-rw', from: 'emea', setHere: true }] },
      inherited: NONE,
      onlySuperAdmins: false,
    };
    show();
    const readWrite = await screen.findByRole('region', { name: /read-write groups/i });
    await userEvent.click(within(readWrite).getByRole('button', { name: 'Remove sales-rw' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save 1 change' }));
    const asking = screen.getByRole('alertdialog');
    expect(document.activeElement).toBe(
      within(asking).getByRole('button', { name: 'Keep my access' }),
    );
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Save 1 change' }));
    expect(puts).toEqual([]);
  });

  it('takes focus when it opens', async () => {
    show();
    await screen.findByRole('region', { name: /read-write groups/i });
    expect(document.activeElement).toBe(
      screen.getByRole('complementary', { name: 'Folder access' }),
    );
  });

  // Rule 65: a save can be undone, unless it took away the editor's own access.
  it('undoes the last save, but not one that removed the editor’s own access', async () => {
    show();
    await screen.findByRole('region', { name: /read-write groups/i });
    await userEvent.click(
      within(section(/read-only groups/i)).getByRole('button', { name: 'Remove emea-viewers' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save 1 change' }));
    await screen.findByText('Access saved.');
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await vi.waitFor(() =>
      expect(puts).toEqual([
        { readOnly: null, readWrite: null },
        { readOnly: ['emea-viewers'], readWrite: null },
      ]),
    );
  });

  it('offers no Undo after the editor removes their own access', async () => {
    answer = {
      folderId: 'emea',
      setting: { readOnly: null, readWrite: ['sales-rw'] },
      effective: { readOnly: [], readWrite: [{ group: 'sales-rw', from: 'emea', setHere: true }] },
      inherited: NONE,
      onlySuperAdmins: false,
    };
    show();
    const readWrite = await screen.findByRole('region', { name: /read-write groups/i });
    await userEvent.click(within(readWrite).getByRole('button', { name: 'Remove sales-rw' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save 1 change' }));
    await userEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Remove my access' }),
    );
    await screen.findByText('Access saved.');
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
  });
});
