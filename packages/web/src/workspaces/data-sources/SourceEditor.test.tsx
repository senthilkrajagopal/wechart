import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { SealedV1 } from '@wechart/core';

import type { ListedSource } from './DataSourcesList';
import { EditableConnection, EditableGeneral, EditFoot, useSourceEdit } from './SourceEditor';
import type { StoredSource } from './SourceSettings';

/**
 * T497 (AC-158, AC-164, AC-312; design 03 of 2026-09-27, pins 6–10 and states
 * B–D): changing a stored data source on its page. What the page asks for
 * again, tests and saves follows the API's own rules (T497's review): the
 * target is the fields sent, a stored secret of any kind is asked for again
 * after the target changes, and a save leaves nothing typed behind.
 */
const envelope: SealedV1 = { v: 1, kid: 'kid-1', enc: 'enc', ct: 'sealed-ct' };
const passed = (testId?: string) => ({
  ok: true,
  ...(testId === undefined ? {} : { testId }),
  checks: [
    { id: 'secrets', status: 'passed', durationMs: 2 },
    { id: 'config', status: 'passed', durationMs: 1 },
    { id: 'connect', status: 'passed', durationMs: 30 },
    { id: 'schemas', status: 'passed', durationMs: 12 },
  ],
});

const stored = (over: Partial<StoredSource> = {}): StoredSource => ({
  id: 'ds-1',
  folderId: 'mine',
  name: 'emea_replica',
  driver: 'postgres',
  authMethod: 'password',
  fields: { host: 'db-1', port: 5432, database: 'sales', user: 'cube', ssl: false },
  secrets: { password: { stored: true } },
  targetFolderId: 'sales',
  origin: null,
  version: 3,
  updatedAt: '2026-09-27T10:00:00.000Z',
  folderPath: [],
  canWrite: true,
  inWorkspace: true,
  ...over,
});

/** Answers the page's routes in turn, keeping each request as sent. */
function serve(answers: Record<string, { status?: number; body: unknown }[]>) {
  const sent: { url: string; method: string; body: unknown }[] = [];
  const turns = new Map<string, number>();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      const key = `${method} ${url}`;
      sent.push({
        url,
        method,
        body: typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined,
      });
      const list = answers[key];
      if (list === undefined) return new Response(null, { status: 404 });
      const at = turns.get(key) ?? 0;
      turns.set(key, at + 1);
      const answer = list[Math.min(at, list.length - 1)]!;
      return Response.json(answer.body, { status: answer.status ?? 200 });
    }),
  );
  return sent;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

function Page({ source, listed }: { source: StoredSource; listed?: ListedSource }) {
  const edit = useSourceEdit(source, { seal: async () => envelope });
  return (
    <>
      <EditableGeneral source={source} edit={edit} listed={listed} />
      <EditableConnection source={source} edit={edit} />
      <EditFoot edit={edit} />
    </>
  );
}

function open(source: StoredSource, listed?: ListedSource) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={client}>
      <Page source={source} {...(listed === undefined ? {} : { listed })} />
    </QueryClientProvider>,
  );
  return {
    rerender: (next: StoredSource) => {
      view.rerender(
        <QueryClientProvider client={client}>
          <Page source={next} />
        </QueryClientProvider>,
      );
    },
  };
}

const beside = () => screen.getByRole('region', { name: 'Test to save' });
const testButton = () => screen.getByRole('button', { name: 'Test connection' });
const saveButton = () => screen.getByRole('button', { name: /^Save/ });
const count = () => document.querySelector('.source-settings__count');

describe('what is asked for again, as the API asks (T497’s review)', () => {
  it('asks for the password once a target field is filled in where nothing was stored', async () => {
    // The seeded default stores no port: 5432 typed in is a change of target to the API.
    open(stored({ fields: { host: 'db-1', database: 'sales', user: 'cube', ssl: false } }));
    await userEvent.type(screen.getByLabelText(/^Port/), '5432');

    expect(within(beside()).getByText('Password: needed again')).toBeTruthy();
    expect(testButton()).toHaveProperty('disabled', true);
  });

  it('keeps the password when a switch nothing stored is turned off and on again', async () => {
    open(stored({ fields: { host: 'db-1', database: 'sales', user: 'cube', ssl: true } }));
    const verify = screen.getByRole('switch', { name: /Verify the server/ });
    await userEvent.click(verify);
    expect(within(beside()).getByText('Password: needed again')).toBeTruthy();
    await userEvent.click(verify);

    expect(within(beside()).queryByText(/needed again/)).toBeNull();
    expect(count()?.textContent).toBe('No unsaved changes');
  });

  it('asks again for an optional stored secret too, naming it', async () => {
    open(
      stored({
        authMethod: 'client-certificate',
        fields: { host: 'db-1', database: 'sales', user: 'cube', sslCert: 'PEM', ssl: true },
        secrets: { sslKey: { stored: true }, sslPassphrase: { stored: true } },
      }),
    );
    const host = screen.getByLabelText(/^Host/);
    await userEvent.clear(host);
    await userEvent.type(host, 'db-2');

    expect(within(beside()).getByText('Client key (PEM): needed again')).toBeTruthy();
    expect(within(beside()).getByText('Key passphrase: needed again')).toBeTruthy();
    expect(within(beside()).getByText(/^Enter client key \(pem\), key passphrase to test\.$/));
    expect(testButton()).toHaveProperty('disabled', true);
  });
});

describe('testing and saving (T497’s review)', () => {
  it('tests the stored settings when nothing changed, and saves nothing', async () => {
    const sent = serve({ 'POST /api/data-sources/ds-1/test': [{ body: passed('t-1') }] });
    open(stored());
    expect(within(beside()).getByText(/a test now is of the stored settings/)).toBeTruthy();

    await userEvent.click(testButton());
    await screen.findByText('Every check passed');
    expect(sent.at(-1)?.body).toEqual({
      authMethod: 'password',
      fields: { host: 'db-1', port: 5432, database: 'sales', user: 'cube', ssl: false },
      sealed: {},
    });
    expect(saveButton()).toHaveProperty('disabled', true);
  });

  it('says the outcome as it comes, in a line kept mounted', async () => {
    serve({ 'POST /api/data-sources/ds-1/test': [{ body: passed('t-1') }] });
    open(stored());
    const outcome = beside().querySelector('.source-settings__outcome');
    expect(outcome?.getAttribute('role')).toBe('status');
    expect(outcome?.textContent).toBe('');

    await userEvent.click(testButton());
    await screen.findByText('Every check passed');
    expect(beside().querySelector('.source-settings__outcome')).toBe(outcome);
    expect(outcome?.textContent).toMatch(/^Every check passed · /);
  });

  it('says a pass wechart couldn’t keep can’t be saved from, and to run it again', async () => {
    serve({ 'POST /api/data-sources/ds-1/test': [{ body: passed() }] });
    open(stored());
    const database = screen.getByLabelText(/^Database/);
    await userEvent.clear(database);
    await userEvent.type(database, 'sales2');
    await userEvent.click(testButton());

    expect(
      await within(beside()).findByText(
        'The test passed, but wechart couldn’t keep it, and a change is saved only from a test it keeps: run it again.',
      ),
    ).toBeTruthy();
    expect(saveButton()).toHaveProperty('disabled', true);
  });

  it('leaves nothing typed once saved: the secret is stored, and no change is left', async () => {
    const sent = serve({
      'POST /api/data-sources/ds-1/test': [{ body: passed('t-1') }],
      'PUT /api/data-sources/ds-1': [{ body: { id: 'ds-1' } }],
    });
    const page = open(stored());
    const host = screen.getByLabelText(/^Host/);
    await userEvent.clear(host);
    await userEvent.type(host, 'db-2');
    await userEvent.type(screen.getByLabelText(/^Password/), 'typed-secret');
    await userEvent.click(testButton());
    await screen.findByText('Every check passed');
    await userEvent.click(saveButton());
    await screen.findByText('Saved 2 changes.');

    expect(sent.at(-1)).toMatchObject({
      method: 'PUT',
      body: { fields: { host: 'db-2' }, sealed: { password: envelope }, testId: 't-1' },
    });
    // As the page reads it again after the save.
    page.rerender(
      stored({
        fields: { host: 'db-2', port: 5432, database: 'sales', user: 'cube', ssl: false },
        version: 4,
      }),
    );
    expect(count()?.textContent).toBe('No unsaved changes');
    expect(document.querySelector('input[type="password"]')).toBeNull();
    expect(screen.getByText('Stored · encrypted')).toBeTruthy();
    // Focus isn't dropped to the page as the buttons disable (T497's review).
    expect(document.activeElement).toBe(count());
  });

  it('keeps its failure line mounted, and marks a name refused as taken on the field', async () => {
    serve({
      'PUT /api/data-sources/ds-1': [
        {
          status: 409,
          body: { error: 'Sales / EMEA already has a data source named eu_replica.' },
        },
      ],
    });
    open(stored());
    const failure = document.querySelector('.source-settings__foot [role="alert"]');
    expect(failure?.textContent).toBe('');
    const name = screen.getByLabelText(/^Name/);
    await userEvent.clear(name);
    await userEvent.type(name, 'eu_replica');
    await userEvent.click(saveButton());

    expect(await screen.findByText(/already has a data source named eu_replica/)).toBeTruthy();
    expect(name.getAttribute('aria-invalid')).toBe('true');
    expect(document.querySelector('.source-settings__foot [role="alert"]')).toBe(failure);
  });
});

describe('a rename (state B)', () => {
  it('keeps the wizard’s rule for a name', async () => {
    open(stored());
    const name = screen.getByLabelText(/^Name/);
    await userEvent.clear(name);
    await userEvent.type(name, 'EU Replica');

    expect(name.getAttribute('aria-invalid')).toBe('true');
    expect(
      screen.getByText(
        'Not a name Cube takes: use lower-case letters and digits, words joined by single underscores, at most 64 characters.',
      ),
    ).toBeTruthy();
    expect(saveButton()).toHaveProperty('disabled', true);
  });

  it('says up front which published cubes still name it (AC-275)', async () => {
    const sales = [
      { id: 'sales', title: 'Sales' },
      { id: 'emea', title: 'EMEA' },
    ];
    open(stored({ inWorkspace: false }), {
      id: 'ds-1',
      name: 'emea_replica',
      folderId: 'emea',
      folderPath: sales,
      driver: 'postgres',
      authMethod: 'password',
      updatedAt: '2026-09-27T10:00:00.000Z',
      lastTest: null,
      usedBy: [
        { name: 'orders', folderId: 'emea', folderPath: sales },
        { name: 'returns', folderId: 'emea', folderPath: sales },
      ],
    });
    const name = screen.getByLabelText(/^Name/);
    await userEvent.clear(name);
    await userEvent.type(name, 'emea_replica_eu');

    expect(
      screen.getByText(
        '2 published cubes in Sales / EMEA name emea_replica. Saving this rename is refused until they’re changed too; the refusal names them.',
      ),
    ).toBeTruthy();
  });
});

describe('discarding (T497’s review)', () => {
  it('puts every change back and leaves focus on the foot', async () => {
    open(stored());
    const database = screen.getByLabelText(/^Database/);
    await userEvent.clear(database);
    await userEvent.type(database, 'sales2');
    await userEvent.click(screen.getByRole('button', { name: 'Discard changes' }));

    expect((screen.getByLabelText(/^Database/) as HTMLInputElement).value).toBe('sales');
    expect(count()?.textContent).toBe('No unsaved changes');
    expect(document.activeElement).toBe(count());
  });
});
