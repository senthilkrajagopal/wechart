import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { exactOf } from '../../shell/formatTime';

import {
  AuditTrail,
  auditFiltersFrom,
  auditSearchOf,
  NO_FILTERS,
  type AuditFilters,
} from './AuditTrail';

/**
 * T369 (AC-295; design 08 of 2026-09-27, pins 2–9 and states A–C): the audit
 * trail as the Super-Admin's page: four filters, the active ones as chips
 * with Clear filters and the count, local time with seconds and UTC on
 * hover, each event as icon and label, a one-line summary, the full record
 * in the inspector, the retention said, newest first, a page at a time.
 */
const now = new Date();
const today = (h: number, m: number, s: number) => {
  const at = new Date(now);
  at.setHours(h, m, s, 0);
  return at.toISOString();
};
const EMEA = [
  { id: 'sales', title: 'Sales' },
  { id: 'emea', title: 'EMEA' },
];
const RECORDS = [
  {
    id: 'r1',
    at: today(14, 22, 40),
    actor: { key: 'wren', name: 'Wren Writer', identity: 'wren@corp.example' },
    event: 'data-source-change',
    folderId: 'emea',
    folderPath: EMEA,
    item: { kind: 'data-source', id: 'ds-1', title: 'emea_replica' },
    summary: 'Host changed; password replaced',
    details: {
      changes: [
        { setting: 'Host', before: 'pg-replica-1', after: 'pg-replica-2' },
        { setting: 'Password', before: null, after: 'replaced' },
      ],
      testId: 't-1',
      testedAt: today(14, 21, 7),
    },
  },
  {
    id: 'r2',
    at: today(11, 48, 3),
    actor: { key: 'ada', name: 'Ada Admin', identity: 'ada@corp.example' },
    event: 'access-change',
    folderId: 'emea',
    folderPath: EMEA,
    item: { kind: 'folder', id: 'emea', title: 'EMEA' },
    summary: 'Added read-write group emea-analysts',
    details: {
      role: 'Super-Admin',
      readWrite: {
        before: ['sales-emea-rw', 'old-rw'],
        after: ['sales-emea-rw', 'emea-analysts'],
      },
      readOnly: { before: ['emea-viewers'], after: ['emea-viewers'] },
    },
  },
  {
    id: 'r3',
    at: today(9, 0, 0),
    actor: { key: 'wren', name: 'Wren Writer', identity: 'wren@corp.example' },
    event: 'sign-in',
    folderId: null,
    folderPath: null,
    item: null,
    summary: 'Signed in',
    details: null,
  },
];

function serve(pages: Record<string, unknown> = {}) {
  const asked: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      asked.push(url);
      if (url === '/api/audit/people')
        return Response.json([
          { key: 'ada', name: 'Ada Admin', identity: 'ada@corp.example' },
          { key: 'wren', name: 'Wren Writer', identity: 'wren@corp.example' },
        ]);
      if (url === '/api/folders')
        return Response.json([
          { id: 'sales', title: 'Sales', parentId: 'root' },
          { id: 'emea', title: 'EMEA', parentId: 'sales' },
        ]);
      if (url.startsWith('/api/audit?')) {
        const after = new URL(url, 'http://x').searchParams.get('after');
        return Response.json(
          (after === null ? pages['first'] : pages[after]) ?? {
            records: RECORDS,
            total: 3,
            retentionDays: 365,
          },
        );
      }
      return new Response(null, { status: 404 });
    }),
  );
  return asked;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

function Trail({ start = NO_FILTERS }: { start?: AuditFilters }) {
  const [filters, setFilters] = useState<AuditFilters>(start);
  return <AuditTrail filters={filters} onFilters={setFilters} />;
}
function open(start?: AuditFilters) {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <Trail {...(start === undefined ? {} : { start })} />
    </QueryClientProvider>,
  );
}
const table = () => screen.getByRole('table', { name: 'Audit trail' });
const lastQuery = (asked: string[]) =>
  new URL(asked.filter((url) => url.startsWith('/api/audit?')).at(-1)!, 'http://x').searchParams;

describe('the trail’s filters in its address (T369; design 08, pin 1)', () => {
  it('reads back what it writes, and nothing it doesn’t know', () => {
    const filters: AuditFilters = {
      user: 'ada',
      events: ['access-change', 'approval'],
      folder: 'emea',
      subfolders: true,
      time: 'custom',
      since: '2026-09-20T00:00',
      until: '2026-09-27T12:00:30',
    };
    const search = auditSearchOf(filters);
    expect(search).toBe(
      'user=ada&event=access-change%2Capproval&folder=emea&subfolders=1&time=custom&since=2026-09-20T00%3A00&until=2026-09-27T12%3A00%3A30',
    );
    expect(auditFiltersFrom(new URLSearchParams(search))).toEqual(filters);
    expect(auditSearchOf(NO_FILTERS)).toBe('');
    expect(
      auditFiltersFrom(new URLSearchParams('event=approval,nonsense&time=forever&subfolders=1')),
    ).toEqual({ ...NO_FILTERS, events: ['approval'] });
    // Each kind once, in the picker's order; a custom end that isn't a time left out (T369's review).
    expect(
      auditFiltersFrom(
        new URLSearchParams(
          'event=approval,sign-in,approval&time=custom&since=abc&until=2026-09-27T12:00',
        ),
      ),
    ).toEqual({
      ...NO_FILTERS,
      events: ['sign-in', 'approval'],
      time: 'custom',
      until: '2026-09-27T12:00',
    });
  });
});

describe('the audit trail (T369, AC-295)', () => {
  it('lists the records newest first, each in a row, with the count and the retention', async () => {
    serve();
    open();

    const rows = await within(
      await screen.findByRole('table', { name: 'Audit trail' }),
    ).findAllByRole('row');
    expect(
      within(rows[0]!)
        .getAllByRole('columnheader')
        .map((cell) => cell.textContent),
    ).toEqual(['Time', 'User', 'Event', 'Folder', 'Item', 'Details']);
    const cells = within(rows[2]!)
      .getAllByRole('cell')
      .map((cell) => cell.textContent);
    expect(cells).toEqual([
      'Today 11:48:03',
      'ada@corp.example',
      'Access change',
      'Sales / EMEA',
      'Folder · EMEA',
      'Added read-write group emea-analysts',
    ]);
    // Local time with seconds, UTC on hover (pin 4).
    const time = within(rows[2]!).getByText('Today 11:48:03');
    // The exact local time with UTC beside it (T477; the coordinator's Q9).
    expect(time.getAttribute('title')).toBe(exactOf(new Date(RECORDS[1]!.at)));
    // An event as icon and label (pin 5).
    expect(within(rows[2]!).getByText('Access change').previousElementSibling?.tagName).toBe('svg');
    expect(within(rows[3]!).getAllByRole('cell')[3]?.textContent).toBe('—');
    expect(screen.getByText('3 records · newest first')).toBeTruthy();
    expect(screen.getByText(/Records older than 1 year are removed\./)).toBeTruthy();
    // Newest first always: the headers don't sort, and say so (pin 9).
    expect(within(rows[0]!).getAllByRole('columnheader')[0]?.getAttribute('title')).toBe(
      'Always newest first',
    );
  });

  /** T699 (AC-295, AC-343; design 08 pins 3–6, the critique's SEC-05 to SEC-09). */
  it('draws its rows, filters and count as design 08 does', async () => {
    serve({ first: { records: RECORDS, total: 6787, retentionDays: 365 } });
    open();
    const rows = await within(
      await screen.findByRole('table', { name: 'Audit trail' }),
    ).findAllByRole('row');

    // Identities in the code face (pin 6), and a group named in a summary too (pin 4).
    expect(within(rows[2]!).getAllByRole('cell')[1]?.querySelector('code')?.textContent).toBe(
      'ada@corp.example',
    );
    expect(
      within(rows[2]!)
        .getByRole('button', { name: 'Added read-write group emea-analysts' })
        .querySelector('code')?.textContent,
    ).toBe('emea-analysts');
    // Design 08's glyphs (pin 5): a database, a padlock, a sign-in arrow.
    expect(
      rows
        .slice(1)
        .map((row) => row.querySelector('.audit-trail__event svg')?.getAttribute('data-icon')),
    ).toEqual(['db', 'lock', 'login']);
    // The count at the chips row's end, written with a comma (pin 3).
    const count = screen.getByText('6,787 records · newest first');
    expect(count.closest('.audit-trail__chips')).not.toBeNull();
    // The Time choices in the design's order (pin 2).
    expect(
      [...(screen.getByLabelText('Time') as HTMLSelectElement).options].map((each) => each.text),
    ).toEqual(['Last 24 hours', 'Last 7 days', 'Last 30 days', 'All', 'Custom']);
    // User a combobox of the identities in the records (pin 2).
    const user = screen.getByRole('combobox', { name: 'User' }) as HTMLInputElement;
    expect(user.placeholder).toBe('Anyone');
    const list = document.getElementById(user.getAttribute('list') ?? '');
    expect([...(list?.querySelectorAll('option') ?? [])].map((each) => each.value)).toEqual([
      'ada@corp.example',
      'wren@corp.example',
    ]);
  });

  it('draws the other icons as design 08 does: a proposal sent, a rejection, a restore (pin 5)', async () => {
    const one = (id: string, event: string) => ({ ...RECORDS[2], id, event, summary: event });
    serve({
      first: {
        records: [
          one('a', 'proposal'),
          one('b', 'rejection'),
          one('c', 'restore'),
          one('d', 'approval'),
        ],
        total: 4,
        retentionDays: 365,
      },
    });
    open();
    const rows = await within(
      await screen.findByRole('table', { name: 'Audit trail' }),
    ).findAllByRole('row');
    expect(
      rows
        .slice(1)
        .map((row) => row.querySelector('.audit-trail__event svg')?.getAttribute('data-icon')),
    ).toEqual(['send', 'xo', 'hist', 'check']);
  });

  it('names the user chosen in its address once the people are read, as on a reload (T699’s review)', async () => {
    serve();
    open({ ...NO_FILTERS, user: 'ada' });
    await screen.findByRole('table', { name: 'Audit trail' });
    // The people list answers after the first render: the field still follows the filter.
    await waitFor(() => {
      expect((screen.getByRole('combobox', { name: 'User' }) as HTMLInputElement).value).toBe(
        'ada@corp.example',
      );
    });
  });

  it('takes an identity typed before the people are read as the filter once they are', async () => {
    const asked = serve();
    let answer: (people: Response) => void = () => undefined;
    const people = new Promise<Response>((resolve) => {
      answer = resolve;
    });
    const served = globalThis.fetch;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) =>
        String(input) === '/api/audit/people' ? people : served(input),
      ),
    );
    open();
    await screen.findByRole('table', { name: 'Audit trail' });
    await userEvent.type(screen.getByRole('combobox', { name: 'User' }), 'ada@corp.example');
    answer(Response.json([{ key: 'ada', name: 'Ada Admin', identity: 'ada@corp.example' }]));
    await waitFor(() => {
      expect(lastQuery(asked).get('users')).toBe('ada');
    });
  });

  it('asks for the filters chosen, and shows each as a chip that removes it', async () => {
    const asked = serve();
    open();
    await screen.findByRole('table', { name: 'Audit trail' });

    // User is a combobox now: an identity typed or picked from its list (T699, pin 2).
    await userEvent.type(screen.getByRole('combobox', { name: 'User' }), 'ada@corp.example');
    const eventButton = screen.getByRole('button', { name: /^Event/ });
    await userEvent.click(eventButton);
    await userEvent.click(screen.getByRole('checkbox', { name: 'Access change' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Approval' }));
    await userEvent.keyboard('{Escape}');
    // Escape closes the kinds and returns to Event.
    expect(screen.queryByRole('checkbox', { name: 'Approval' })).toBeNull();
    expect(document.activeElement).toBe(eventButton);
    await userEvent.selectOptions(screen.getByLabelText('Folder'), 'sales');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Include subfolders' }));
    await userEvent.selectOptions(screen.getByLabelText('Time'), 'week');

    const query = lastQuery(asked);
    expect(query.get('users')).toBe('ada');
    expect(query.get('events')).toBe('access-change,approval');
    expect(query.get('folder')).toBe('sales');
    expect(query.get('subfolders')).toBe('true');
    // From when the filter was set: 7 days back, give or take the test's own minute.
    const back = Date.now() - new Date(query.get('since')!).getTime();
    expect(back).toBeGreaterThan(7 * 86_400_000 - 60_000);
    expect(back).toBeLessThan(7 * 86_400_000 + 60_000);

    const chips = screen.getByRole('list', { name: 'Active filters' });
    expect(
      within(chips)
        .getAllByRole('listitem')
        .map((chip) => chip.textContent),
    ).toEqual([
      'User: ada@corp.example',
      'Event: Access change, Approval',
      'Folder: Sales and subfolders',
      'Time: Last 7 days',
    ]);
    await userEvent.click(within(chips).getByRole('button', { name: 'Remove Event' }));
    expect(lastQuery(asked).get('events')).toBeNull();
    // Focus to the chip that took its place (T369's review).
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Remove Folder' }));
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect([...lastQuery(asked).keys()].filter((key) => key !== 'limit')).toEqual([]);
    expect(document.activeElement).toBe(screen.getByLabelText('User'));
  });

  it('says when no record matches, with a way to clear the filters (state C)', async () => {
    serve({ first: { records: [], total: 0, retentionDays: 365 } });
    open({ ...NO_FILTERS, events: ['restore'] });

    const none = (await screen.findByText(/^No records match these filters\./)).closest('p')!;
    await userEvent.click(within(none).getByRole('button', { name: 'Clear filters' }));
    expect(screen.queryByRole('list', { name: 'Active filters' })).toBeNull();
  });

  it('never shows another filter’s rows while the new ones are read (T369’s review)', async () => {
    let answer: (value: Response) => void = () => undefined;
    serve();
    const served = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementation(async (input) =>
      String(input).includes('events=restore')
        ? new Promise<Response>((resolve) => {
            answer = resolve;
          })
        : served(input),
    );
    open();
    await screen.findByRole('table', { name: 'Audit trail' });

    await userEvent.click(screen.getByRole('button', { name: /^Event/ }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Restore' }));
    expect(screen.queryByRole('table', { name: 'Audit trail' })).toBeNull();
    expect(screen.queryByText('3 records · newest first')).toBeNull();
    answer(Response.json({ records: [], total: 0, retentionDays: 365 }));
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe('0 records · newest first'),
    );
  });

  it('says a workspace’s folder is in a workspace, never in Shared (T369’s review)', async () => {
    serve({
      first: {
        records: [{ ...RECORDS[0]!, folderId: 'drafts', folderPath: null, inWorkspace: true }],
        total: 1,
        retentionDays: 365,
      },
    });
    open();
    const row = (
      await within(await screen.findByRole('table', { name: 'Audit trail' })).findAllByRole('row')
    )[1]!;
    expect(within(row).getAllByRole('cell')[3]?.textContent).toBe('A workspace');
  });

  it('opens a record in the inspector: an access change’s groups before and after', async () => {
    serve();
    open();
    await screen.findByRole('table', { name: 'Audit trail' });

    const summary = within(table()).getByRole('button', {
      name: 'Added read-write group emea-analysts',
    });
    await userEvent.click(summary);
    const inspector = screen.getByRole('region', { name: /^Access change/ });
    // Focus to the record as it opens, which follows the whole table (T369's review).
    expect(document.activeElement).toBe(within(inspector).getByRole('heading', { level: 3 }));
    expect(summary.getAttribute('aria-controls')).toBe(inspector.id);
    expect(inspector.textContent).toContain('ada@corp.example');
    expect(inspector.textContent).toContain('Super-Admin');
    expect(inspector.textContent).toContain('Shared / Sales / EMEA');
    // Local time with seconds, then UTC's clock, as design 08's inspector
    // writes it: "Today 11:48:03 (09:48:03 UTC)" (T477).
    const at = new Date(RECORDS[1]!.at);
    const pad = (n: number) => String(n).padStart(2, '0');
    expect(inspector.querySelector('.audit-trail__inspector-where')?.textContent).toMatch(
      new RegExp(
        `Today 11:48:03 \\((\\d{1,2} [A-Z][a-z]{2} )?${pad(at.getUTCHours())}:48:03 UTC\\)$`,
      ),
    );
    // By, in the code face (design 08's inspector; T699, SEC-03).
    expect(
      within(inspector).getByText('By').nextElementSibling?.querySelector('code')?.textContent,
    ).toBe('ada@corp.example');
    const readWrite = within(inspector).getByRole('group', { name: 'Read-write groups' });
    // Before and After as two columns, a group to a line (T699, SEC-12).
    const listOf = (column: string) =>
      [...(within(readWrite).getByText(column).nextElementSibling?.children ?? [])].map(
        (line) => line.textContent,
      );
    expect(listOf('Before')).toEqual(['sales-emea-rw', 'old-rw']);
    expect(listOf('After')).toEqual(['sales-emea-rw', '+ emea-analysts', 'old-rw']);
    const after = within(readWrite).getByText('After').nextElementSibling!;
    // A group taken away, struck through (design 08, state B).
    expect(after.querySelector('del')?.textContent).toBe('old-rw');
    expect(inspector.textContent).toContain('Records can’t be edited or deleted here.');

    // Closed, focus goes back to the row it was opened from.
    await userEvent.click(within(inspector).getByRole('button', { name: 'Close the record' }));
    expect(screen.queryByRole('region', { name: /^Access change/ })).toBeNull();
    expect(document.activeElement).toBe(summary);
  });

  it('shows a data-source change’s settings before and after, a secret only replaced (state A)', async () => {
    serve();
    open();
    await screen.findByRole('table', { name: 'Audit trail' });

    await userEvent.click(
      within(table()).getByRole('button', { name: 'Host changed; password replaced' }),
    );
    const inspector = screen.getByRole('region', { name: /^Data-source change/ });
    const settings = within(inspector).getByRole('table', { name: 'Changed settings' });
    expect(
      within(settings)
        .getAllByRole('row')
        .map((row) =>
          within(row)
            .queryAllByRole('cell')
            .map((cell) => cell.textContent),
        ),
    ).toEqual([[], ['Host', 'pg-replica-1', 'pg-replica-2'], ['Password', '—', 'Replaced']]);
    expect(inspector.textContent).toContain('Saved after a passing test');
    // "Replaced" as a badge with its padlock, and the test's time with its icon
    // (state A; T699, SEC-11 and security-Q6).
    const replaced = within(settings).getByText('Replaced');
    expect(replaced.classList.contains('badge')).toBe(true);
    expect(replaced.querySelector('svg')?.getAttribute('data-icon')).toBe('lock');
    const tested = within(inspector).getByText(/^Saved after a passing test/);
    expect(tested.textContent).toBe('Saved after a passing test · 14:21:07');
    expect(tested.closest('.state-line')?.querySelector('svg')?.getAttribute('data-icon')).toBe(
      'ok',
    );
  });

  it('shows a refused publish’s every break, named, and what its user was shown (T427, AC-322; state B)', async () => {
    serve({
      first: {
        records: [
          {
            id: 'r9',
            at: today(10, 2, 18),
            actor: { key: 'mo', name: 'Mo', identity: 'mo@corp.example' },
            event: 'publish-refused',
            folderId: 'emea',
            folderPath: EMEA,
            item: { kind: 'model', id: 'sales.yml', title: 'sales.yml' },
            summary: '3 breaks: 1 named to its user, 2 counted',
            details: {
              breaks: [
                {
                  path: 'sales.yml',
                  folderId: 'emea',
                  folderPath: EMEA,
                  message: 'unknown member orders.amount_net',
                  line: 34,
                  column: 9,
                },
                {
                  path: 'churn.yml',
                  folderId: 'root',
                  folderPath: [],
                  message: 'cube sales not found',
                },
                {
                  path: 'mine.yml',
                  folderId: 'ws:mo',
                  folderPath: null,
                  inWorkspace: true,
                  message: 'bad',
                },
              ],
              shown: { named: 1, counted: 2 },
              files: ['sales.yml'],
            },
          },
        ],
        total: 1,
        retentionDays: 365,
      },
    });
    open();
    await screen.findByRole('table', { name: 'Audit trail' });

    // Pickable as a kind of its own, with its icon and label.
    const row = within(table()).getAllByRole('row')[1]!;
    expect(within(row).getByText('Publish refused').previousElementSibling?.tagName).toBe('svg');
    await userEvent.click(screen.getByRole('button', { name: /^Event/ }));
    expect(screen.getByRole('checkbox', { name: 'Publish refused' })).toBeTruthy();
    await userEvent.keyboard('{Escape}');

    await userEvent.click(
      within(table()).getByRole('button', { name: '3 breaks: 1 named to its user, 2 counted' }),
    );
    const inspector = screen.getByRole('region', { name: /^Publish refused/ });
    // Every break named, even those its user saw only counted.
    expect(
      within(within(inspector).getByRole('list', { name: 'Breaks' }))
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual([
      'sales.yml (Sales / EMEA) line 34:9, unknown member orders.amount_net',
      'churn.yml (Shared) cube sales not found',
      'mine.yml (A workspace) bad',
    ]);
    expect(within(inspector).getByText('Shown to Mo').nextElementSibling?.textContent).toBe(
      '1 break named, 2 counted',
    );
  });

  it('shows a SQL run as a kind of its own, with its outcome, rows, time and SQL, its literals replaced (T534, AC-382; design 15, state J)', async () => {
    serve({
      first: {
        records: [
          {
            id: 'q2',
            at: today(14, 47, 30),
            actor: { key: 'wren', name: 'Wren', identity: 'wren@corp.example' },
            event: 'sql-run',
            folderId: 'emea',
            folderPath: EMEA,
            item: { kind: 'data-source', id: 'ds-1', title: 'emea_replica' },
            summary: 'Not run · couldn’t be read as SQL',
            details: {
              outcome: 'refused',
              rowCount: null,
              durationMs: null,
              sql: null,
              inWorkspace: false,
            },
          },
          {
            id: 'q1',
            at: today(14, 32, 5),
            actor: { key: 'wren', name: 'Wren', identity: 'wren@corp.example' },
            event: 'sql-run',
            folderId: 'emea',
            folderPath: EMEA,
            item: { kind: 'data-source', id: 'ds-1', title: 'emea_replica' },
            summary: 'Finished · 1,284 rows · 0.84 s',
            details: {
              outcome: 'finished',
              rowCount: 1284,
              durationMs: 840,
              truncated: null,
              statement: 'select',
              sql: 'SELECT o.order_id FROM sales.orders o WHERE o.region = ?',
              inWorkspace: false,
            },
          },
        ],
        total: 2,
        retentionDays: 365,
      },
    });
    open();
    await screen.findByRole('table', { name: 'Audit trail' });

    const row = within(table()).getAllByRole('row')[2]!;
    expect(within(row).getByText('SQL run').previousElementSibling?.tagName).toBe('svg');
    await userEvent.click(screen.getByRole('button', { name: /^Event/ }));
    expect(screen.getByRole('checkbox', { name: 'SQL run' })).toBeTruthy();
    await userEvent.keyboard('{Escape}');

    await userEvent.click(
      within(table()).getByRole('button', { name: 'Finished · 1,284 rows · 0.84 s' }),
    );
    const inspector = screen.getByRole('region', { name: /^SQL run/ });
    const rows = within(inspector)
      .getAllByRole('definition')
      .map((each) => each.textContent);
    expect(rows).toEqual(expect.arrayContaining(['Finished', '1,284', '0.84 s']));
    expect(within(inspector).getByTestId('audit-sql').textContent).toBe(
      'SELECT o.order_id FROM sales.orders o WHERE o.region = ?',
    );

    await userEvent.click(
      within(table()).getByRole('button', { name: 'Not run · couldn’t be read as SQL' }),
    );
    const unread = screen.getByRole('region', { name: /^SQL run/ });
    expect(within(unread).getByTestId('audit-sql').textContent).toBe(
      'Not kept: it couldn’t be read, so its literals couldn’t be found and replaced.',
    );
  });

  it('names a run on a copy in My workspace as the copy’s (T534’s review; design 15, state J)', async () => {
    serve({
      first: {
        records: [
          {
            id: 'q3',
            at: today(11, 5, 47),
            actor: { key: 'wren', name: 'Wren', identity: 'wren@corp.example' },
            event: 'sql-run',
            folderId: 'emea',
            folderPath: EMEA,
            item: { kind: 'data-source', id: 'ds-2', title: 'emea_replica' },
            summary: 'Finished · 38 rows · 0.09 s',
            details: {
              outcome: 'finished',
              rowCount: 38,
              durationMs: 90,
              sql: 'SELECT ?',
              inWorkspace: true,
            },
          },
        ],
        total: 1,
        retentionDays: 365,
      },
    });
    open();
    await screen.findByRole('table', { name: 'Audit trail' });
    const row = within(table()).getAllByRole('row')[1]!;
    expect(within(row).getAllByRole('cell')[4]?.textContent).toBe(
      'Data source · emea_replica · copy in My workspace',
    );
  });

  it('names a run on Cube Store, at the root, as Cube Store (T536; design 15, state J)', async () => {
    serve({
      first: {
        records: [
          {
            id: 'q4',
            at: today(14, 51, 18),
            actor: { key: 'wren', name: 'Wren', identity: 'wren@corp.example' },
            event: 'sql-run',
            folderId: 'root',
            folderPath: [],
            item: { kind: 'cube-store', id: 'cubestore', title: 'Cube Store' },
            summary: 'Finished · 214 rows · 0.31 s',
            details: {
              outcome: 'finished',
              rowCount: 214,
              durationMs: 310,
              sql: 'SELECT table_schema FROM information_schema.tables LIMIT ?',
              inWorkspace: false,
            },
          },
        ],
        total: 1,
        retentionDays: 365,
      },
    });
    open();
    await screen.findByRole('table', { name: 'Audit trail' });
    const row = within(table()).getAllByRole('row')[1]!;
    expect(within(row).getAllByRole('cell')[4]?.textContent).toBe('Cube Store');
  });

  describe('builds, cancels and schedule changes (T505, AC-294; design 16, state I)', () => {
    const WREN = { key: 'wren', name: 'Wren', identity: 'wren@corp.example' };
    const SCHEDULE = { kind: 'schedule', id: 's-1', title: 'Month-end close' };
    const BY_MONTH = {
      kind: 'pre-aggregation',
      id: 'f9a1__orders_emea.by_month',
      title: 'orders_emea.by_month',
    };
    const settings = (cron: string) => ({
      name: 'Month-end close',
      preAggregation: BY_MONTH.id,
      cron,
      timezone: 'Europe/Berlin',
      missed: 'once',
      suspendAfter: 3,
    });
    const rows = (before: string | null, after: string | null) => {
      const shown = (cron: string | null) =>
        cron === null
          ? [null, null, null, null, null, null]
          : ['Month-end close', 'orders_emea.by_month', cron, 'Europe/Berlin', 'Run once', '3'];
      const [was, is] = [shown(before), shown(after)];
      return ['Name', 'Pre-aggregation', 'Cron', 'Time zone', 'A missed run', 'Suspend after'].map(
        (setting, at) => ({ setting, before: was[at], after: is[at] }),
      );
    };
    const what = { preAggregation: BY_MONTH.id, shownName: 'orders_emea.by_month' };
    const STATE_I = [
      {
        id: 'i1',
        at: today(14, 41, 20),
        actor: WREN,
        event: 'schedule-change',
        folderId: 'emea',
        folderPath: EMEA,
        item: SCHEDULE,
        summary: 'Made · 0 6 1 * *',
        details: {
          change: 'made',
          ...what,
          before: null,
          after: settings('0 6 1 * *'),
          settings: rows(null, '0 6 1 * *'),
        },
      },
      {
        id: 'i2',
        at: today(14, 39, 2),
        actor: WREN,
        event: 'build-cancelled',
        folderId: 'emea',
        folderPath: EMEA,
        item: BY_MONTH,
        summary: 'Queued · Aug 2026',
        details: {
          preAggregation: BY_MONTH.id,
          partition: '2026-08-01T00:00:00.000',
          state: 'queued',
          runId: 'run-1',
        },
      },
      {
        id: 'i3',
        at: today(14, 38, 41),
        actor: WREN,
        event: 'build-started',
        folderId: 'emea',
        folderPath: EMEA,
        item: BY_MONTH,
        summary: 'Rebuild selected · Sep, Aug 2026',
        details: {
          preAggregation: BY_MONTH.id,
          via: 'rebuild-selected',
          partitions: ['2026-09-01T00:00:00.000', '2026-08-01T00:00:00.000'],
          granularity: 'month',
          runId: 'run-1',
        },
      },
      {
        id: 'i4',
        at: today(11, 0, 41),
        actor: { key: 'wechart:scheduler', name: 'wechart’s scheduler' },
        event: 'schedule-change',
        folderId: 'emea',
        folderPath: EMEA,
        item: SCHEDULE,
        summary: 'Suspended after 3 failures',
        details: {
          change: 'suspended',
          ...what,
          failures: 3,
          error: 'Cube refused it.',
        },
      },
      {
        id: 'i5',
        at: today(10, 10, 12),
        actor: WREN,
        event: 'schedule-change',
        folderId: 'emea',
        folderPath: EMEA,
        item: SCHEDULE,
        summary: 'Changed · cron',
        details: {
          change: 'changed',
          ...what,
          before: settings('0 6 1 * *'),
          after: settings('0 5 1 * *'),
          settings: rows('0 6 1 * *', '0 5 1 * *'),
        },
      },
    ];
    const cells = (row: HTMLElement) =>
      within(row)
        .queryAllByRole('cell')
        .map((cell) => cell.textContent);

    it('shows each as its kind, with its icon, by whom, and the pre-aggregation or schedule', async () => {
      serve({ first: { records: STATE_I, total: 5, retentionDays: 365 } });
      open();
      await screen.findByRole('table', { name: 'Audit trail' });

      const body = within(table()).getAllByRole('row').slice(1);
      expect(body.map((row) => cells(row).slice(1))).toEqual([
        [
          'wren@corp.example',
          'Schedule change',
          'Sales / EMEA',
          'Schedule · Month-end close',
          'Made · 0 6 1 * *',
        ],
        [
          'wren@corp.example',
          'Build cancelled',
          'Sales / EMEA',
          'Pre-aggregation · orders_emea.by_month',
          'Queued · Aug 2026',
        ],
        [
          'wren@corp.example',
          'Build started',
          'Sales / EMEA',
          'Pre-aggregation · orders_emea.by_month',
          'Rebuild selected · Sep, Aug 2026',
        ],
        [
          'wechart’s scheduler',
          'Schedule change',
          'Sales / EMEA',
          'Schedule · Month-end close',
          'Suspended after 3 failures',
        ],
        [
          'wren@corp.example',
          'Schedule change',
          'Sales / EMEA',
          'Schedule · Month-end close',
          'Changed · cron',
        ],
      ]);
      // Each kind with its own icon beside its label (rule 3).
      const iconOf = (row: HTMLElement, label: string) =>
        within(row)
          .getByText(label)
          .previousElementSibling?.querySelector('path')
          ?.getAttribute('d') ?? null;
      const icons = [
        iconOf(body[0]!, 'Schedule change'),
        iconOf(body[1]!, 'Build cancelled'),
        iconOf(body[2]!, 'Build started'),
      ];
      expect(icons.every((path) => path !== null && path !== '')).toBe(true);
      expect(new Set(icons).size).toBe(3);
    });

    it('offers the three kinds in the Event filter, and asks for them', async () => {
      const asked = serve({ first: { records: STATE_I, total: 5, retentionDays: 365 } });
      open();
      await screen.findByRole('table', { name: 'Audit trail' });

      await userEvent.click(screen.getByRole('button', { name: /^Event/ }));
      for (const label of ['Build started', 'Build cancelled', 'Schedule change'])
        await userEvent.click(screen.getByRole('checkbox', { name: label }));
      await waitFor(() =>
        expect(lastQuery(asked).get('events')).toBe(
          'build-started,build-cancelled,schedule-change',
        ),
      );
      expect(screen.getByRole('list', { name: 'Active filters' }).textContent).toContain(
        'Event: Build started, Build cancelled, Schedule change',
      );
    });

    it('opens a schedule change with what it builds and what changed, before and after (I1)', async () => {
      serve({ first: { records: STATE_I, total: 5, retentionDays: 365 } });
      open();
      await screen.findByRole('table', { name: 'Audit trail' });

      await userEvent.click(within(table()).getByRole('button', { name: 'Changed · cron' }));
      const inspector = screen.getByRole('region', { name: /^Schedule change · Changed/ });
      expect(within(inspector).getByRole('heading', { level: 3 }).textContent).toBe(
        ' Schedule change · Changed',
      );
      const terms = within(inspector)
        .getAllByRole('term')
        .map((term) => [term.textContent, term.nextElementSibling?.textContent]);
      expect(terms).toEqual([
        ['By', 'wren@corp.example'],
        ['Schedule', 'Month-end close · wechart'],
        ['Builds', 'orders_emea.by_month'],
        ['Folder', 'Shared / Sales / EMEA'],
      ]);
      const changed = within(inspector).getByRole('table', { name: 'What changed' });
      expect(within(changed).getAllByRole('row').map(cells)).toEqual([
        [],
        ['Name', 'Month-end close, unchanged'],
        ['Pre-aggregation', 'orders_emea.by_month, unchanged'],
        ['Cron', '0 6 1 * *', '0 5 1 * *'],
        ['Time zone', 'Europe/Berlin, unchanged'],
        ['A missed run', 'Run once, unchanged'],
        ['Suspend after', '3, unchanged'],
      ]);

      // Made: every setting as it was set.
      await userEvent.click(within(table()).getByRole('button', { name: 'Made · 0 6 1 * *' }));
      const made = screen.getByRole('region', { name: /^Schedule change · Made/ });
      expect(
        within(within(made).getByRole('table', { name: 'What changed' }))
          .getAllByRole('row')
          .map(cells)[3],
      ).toEqual(['Cron', '—', '0 6 1 * *']);
    });

    it('opens a suspension by wechart’s scheduler with after how many failures, and Cube’s last error (Q12)', async () => {
      serve({ first: { records: STATE_I, total: 5, retentionDays: 365 } });
      open();
      await screen.findByRole('table', { name: 'Audit trail' });

      await userEvent.click(
        within(table()).getByRole('button', { name: 'Suspended after 3 failures' }),
      );
      const inspector = screen.getByRole('region', { name: /^Schedule change · Suspended/ });
      const terms = within(inspector)
        .getAllByRole('term')
        .map((term) => [term.textContent, term.nextElementSibling?.textContent]);
      expect(terms).toEqual([
        ['By', 'wechart’s scheduler'],
        ['Schedule', 'Month-end close · wechart'],
        ['Builds', 'orders_emea.by_month'],
        ['Folder', 'Shared / Sales / EMEA'],
        ['Failures in a row', '3'],
        ['Last error', 'Cube refused it.'],
      ]);
    });

    it('opens a resume with since when it was suspended, and Cube’s error then (T505’s review)', async () => {
      const suspendedAt = today(11, 0, 41);
      serve({
        first: {
          records: [
            {
              id: 'i6',
              at: today(15, 2, 0),
              actor: WREN,
              event: 'schedule-change',
              folderId: 'emea',
              folderPath: EMEA,
              item: SCHEDULE,
              summary: 'Resumed',
              details: { change: 'resumed', ...what, suspendedAt, error: 'Cube refused it.' },
            },
          ],
          total: 1,
          retentionDays: 365,
        },
      });
      open();
      await screen.findByRole('table', { name: 'Audit trail' });

      await userEvent.click(within(table()).getByRole('button', { name: 'Resumed' }));
      const inspector = screen.getByRole('region', { name: /^Schedule change · Resumed/ });
      const terms = within(inspector)
        .getAllByRole('term')
        .map((term) => [term.textContent, term.nextElementSibling?.textContent]);
      expect(terms.slice(-2)).toEqual([
        ['Suspended since', 'Today 11:00:41'],
        ['Last error then', 'Cube refused it.'],
      ]);
    });

    it('names a pause, and a resume from one with since when and by whom (T556, AC-294)', async () => {
      serve({
        first: {
          records: [
            {
              id: 'i8',
              at: today(15, 10, 0),
              actor: WREN,
              event: 'schedule-change',
              folderId: 'emea',
              folderPath: EMEA,
              item: SCHEDULE,
              summary: 'Resumed',
              details: {
                change: 'resumed',
                ...what,
                pausedAt: today(14, 0, 0),
                pausedBy: { key: 'ada', name: 'Ada Admin' },
              },
            },
            {
              id: 'i7',
              at: today(14, 0, 0),
              actor: WREN,
              event: 'schedule-change',
              folderId: 'emea',
              folderPath: EMEA,
              item: SCHEDULE,
              summary: 'Paused',
              details: { change: 'paused', ...what },
            },
          ],
          total: 2,
          retentionDays: 365,
        },
      });
      open();
      await screen.findByRole('table', { name: 'Audit trail' });

      await userEvent.click(within(table()).getByRole('button', { name: 'Paused' }));
      expect(
        within(screen.getByRole('region', { name: /^Schedule change · Paused/ })).getByRole(
          'heading',
          { level: 3 },
        ).textContent,
      ).toBe(' Schedule change · Paused');
      await userEvent.click(within(table()).getByRole('button', { name: 'Resumed' }));
      const inspector = screen.getByRole('region', { name: /^Schedule change · Resumed/ });
      const terms = within(inspector)
        .getAllByRole('term')
        .map((term) => [term.textContent, term.nextElementSibling?.textContent]);
      expect(terms.slice(-2)).toEqual([
        ['Paused since', 'Today 14:00:00'],
        ['Paused by', 'Ada Admin'],
      ]);
    });
  });

  it('pages to older records and back (pin 9)', async () => {
    const asked = serve({
      first: { records: RECORDS.slice(0, 2), next: 'c1', total: 3, retentionDays: 365 },
      c1: { records: RECORDS.slice(2), total: 3, retentionDays: 365 },
    });
    open();
    await screen.findByRole('table', { name: 'Audit trail' });

    await userEvent.click(screen.getByRole('button', { name: 'Older' }));
    expect(await within(table()).findByText('Signed in')).toBeTruthy();
    expect(lastQuery(asked).get('after')).toBe('c1');
    expect(screen.getByRole('button', { name: 'Older' })).toHaveProperty('disabled', true);
    await userEvent.click(screen.getByRole('button', { name: 'Newer' }));
    expect(await within(table()).findByText('Host changed; password replaced')).toBeTruthy();
  });

  it('asks each page for the first page’s range, and starts again at the first for other filters (T369’s review)', async () => {
    const asked = serve({
      first: { records: RECORDS.slice(0, 2), next: 'c1', total: 3, retentionDays: 365 },
      c1: { records: RECORDS.slice(2), total: 3, retentionDays: 365 },
    });
    open({ ...NO_FILTERS, time: 'week' });
    await screen.findByRole('table', { name: 'Audit trail' });
    const since = lastQuery(asked).get('since')!;
    expect(Number.isNaN(Date.parse(since))).toBe(false);
    const summaries = () =>
      within(table())
        .getAllByRole('button')
        .map((button) => button.textContent);

    await userEvent.click(screen.getByRole('button', { name: 'Older' }));
    await waitFor(() => expect(summaries()).toEqual(['Signed in']));
    expect(lastQuery(asked).get('since')).toBe(since);

    // Another filter, then back: the first page each time.
    // User a combobox (T699): an identity typed, then cleared.
    const user = screen.getByRole('combobox', { name: 'User' });
    await userEvent.type(user, 'ada@corp.example');
    expect(lastQuery(asked).get('after')).toBeNull();
    await userEvent.clear(user);
    await waitFor(() =>
      expect(summaries()).toEqual([
        'Host changed; password replaced',
        'Added read-write group emea-analysts',
      ]),
    );
    expect(screen.getByRole('button', { name: 'Newer' })).toHaveProperty('disabled', true);
  });
});

/** T767 (AC-442; design 18, state I): a personal access token made, by whom, its name and expiry. */
describe('a token made (T767, AC-442; design 18, state I)', () => {
  const WREN = { key: 'wren', name: 'Wren Writer', identity: 'wren@corp.example' };
  const MADE = {
    id: 't1',
    at: today(14, 44, 2),
    actor: WREN,
    event: 'token-made',
    folderId: null,
    folderPath: null,
    item: { kind: 'access-token', id: 'pat-1', title: 'Claude Code · desktop' },
    summary: 'Claude Code · desktop · 30 days',
    details: { name: 'Claude Code · desktop', scopes: ['read'], days: 30 },
  };

  it('shows “Token made” with the key icon, by whom, the token and its expiry', async () => {
    serve({ first: { records: [MADE], total: 1, retentionDays: 365 } });
    open();
    await screen.findByRole('table', { name: 'Audit trail' });
    const [row] = within(table()).getAllByRole('row').slice(1);
    expect(
      within(row!)
        .queryAllByRole('cell')
        .slice(1)
        .map((cell) => cell.textContent),
    ).toEqual([
      'wren@corp.example',
      'Token made',
      '—',
      'Access token · Claude Code · desktop',
      'Claude Code · desktop · 30 days',
    ]);
    expect(within(row!).getByText('Token made').previousElementSibling).toHaveProperty(
      'dataset.icon',
      'key',
    );
  });

  it('is offered in the Event filter', async () => {
    const asked = serve({ first: { records: [MADE], total: 1, retentionDays: 365 } });
    open();
    await screen.findByRole('table', { name: 'Audit trail' });
    await userEvent.click(screen.getByRole('button', { name: /^Event/ }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Token made' }));
    await waitFor(() => expect(lastQuery(asked).get('events')).toBe('token-made'));
  });
});

/** T405 (AC-176; direction.md rule 85): the inspector and the Event picker from the keyboard. */
describe('the audit trail from the keyboard (T405, rule 85)', () => {
  it('closes the inspector on Escape, giving focus back to its row', async () => {
    serve();
    open();
    await screen.findByRole('table', { name: 'Audit trail' });
    const summary = within(table()).getByRole('button', {
      name: 'Added read-write group emea-analysts',
    });
    await userEvent.click(summary);
    expect(screen.getByRole('region', { name: /^Access change/ }).tagName).toBe('SECTION');
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('region', { name: /^Access change/ })).toBeNull();
    expect(document.activeElement).toBe(summary);
  });

  it('takes focus into the Event picker as it opens, and back to its button on Escape', async () => {
    serve();
    open();
    await screen.findByRole('table', { name: 'Audit trail' });
    const button = screen.getByRole('button', { name: /^Event/ });
    await userEvent.click(button);
    expect(document.activeElement).toBe(screen.getByRole('checkbox', { name: 'Sign-in' }));
    await userEvent.keyboard('{Escape}');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(button);
  });
});

/** T474's review (design 08, state C; direction.md rule 18): an error has Retry and Details. */
describe('the audit trail, unread', () => {
  it('says it couldn’t be read, with Retry and Details', async () => {
    serve();
    const served = globalThis.fetch;
    let refuse = true;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) =>
        refuse && String(input).startsWith('/api/audit?')
          ? new Response(null, { status: 503 })
          : served(input),
      ),
    );
    open();
    const failed = await screen.findByRole('alert');
    expect(failed.textContent).toContain('Couldn’t read the audit trail.');
    const details = within(failed.closest('.audit-trail__error') as HTMLElement).getByText(
      'Details',
    );
    expect(details.tagName).toBe('SUMMARY');
    expect(details.closest('details')?.textContent).toContain(
      'The audit trail could not be read (503).',
    );
    refuse = false;
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect((await screen.findByRole('table', { name: 'Audit trail' })).tagName).toBe('TABLE');
  });
});
