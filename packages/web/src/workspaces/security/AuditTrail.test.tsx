import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

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
    expect(time.getAttribute('title')).toBe(`${RECORDS[1]!.at.slice(0, 19).replace('T', ' ')} UTC`);
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

  it('asks for the filters chosen, and shows each as a chip that removes it', async () => {
    const asked = serve();
    open();
    await screen.findByRole('table', { name: 'Audit trail' });

    await userEvent.selectOptions(screen.getByLabelText('User'), 'ada');
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
    const readWrite = within(inspector).getByRole('group', { name: 'Read-write groups' });
    expect(within(readWrite).getByText('Before').nextElementSibling?.textContent).toBe(
      'sales-emea-rw old-rw',
    );
    const after = within(readWrite).getByText('After').nextElementSibling!;
    expect(after.textContent).toBe('sales-emea-rw + emea-analysts old-rw');
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
    await userEvent.selectOptions(screen.getByLabelText('User'), 'ada');
    expect(lastQuery(asked).get('after')).toBeNull();
    await userEvent.selectOptions(screen.getByLabelText('User'), '');
    await waitFor(() =>
      expect(summaries()).toEqual([
        'Host changed; password replaced',
        'Added read-write group emea-analysts',
      ]),
    );
    expect(screen.getByRole('button', { name: 'Newer' })).toHaveProperty('disabled', true);
  });
});
