import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SourceVersion } from './SourceVersion';

/**
 * T515 (AC-289; design 06, state D; rule 83): a data source's kept version,
 * set against its settings now, each credential only "unchanged" or
 * "replaced", never shown.
 */
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('a data source’s version against now (T515)', () => {
  it('sets each setting as it was against as it is, and a credential only as replaced', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url === '/api/history/data-source/s1/versions/1')
          return Promise.resolve(
            new Response(
              JSON.stringify({
                version: 1,
                content: {
                  body: {
                    name: 'ledger',
                    driver: 'postgres',
                    authMethod: 'password',
                    fields: {
                      host: 'db-then',
                      port: 5432,
                      database: 'sales',
                      user: 'cube',
                      ssl: false,
                    },
                    secrets: ['password'],
                    // Were an envelope ever sent, the page shows none of it.
                    sealed: {
                      password: { v: 1, kid: 'kid-1', enc: 'enc-SEALED', ct: 'ct-SEALED' },
                    },
                  },
                  secretChanges: { password: 'replaced' },
                },
              }),
            ),
          );
        if (url === '/api/data-sources/s1')
          return Promise.resolve(
            new Response(
              JSON.stringify({
                id: 's1',
                name: 'ledger',
                driver: 'postgres',
                authMethod: 'password',
                fields: { host: 'db', port: 5432, database: 'sales', user: 'cube', ssl: false },
                secrets: { password: { stored: true } },
                version: 3,
              }),
            ),
          );
        return Promise.resolve(new Response('{}', { status: 404 }));
      }),
    );
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <SourceVersion
          source={{ id: 's1', name: 'ledger', version: 3 }}
          version={1}
          onClose={vi.fn()}
        />
      </QueryClientProvider>,
    );
    expect(screen.getByRole('status', { name: 'Version shown' }).textContent).toContain(
      'Version 1 of ledger · read-only, set against version 3, as it is now',
    );
    const table = await screen.findByRole('table', { name: 'Settings, current and version 1' });
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((cell) => cell.textContent),
    ).toEqual(['Setting', 'Version 1', 'Current (version 3)']);
    const cells = (label: string) =>
      [
        ...(within(table)
          .getAllByRole('row')
          .find((row) => row.querySelector('th')?.textContent === label)
          ?.querySelectorAll('td') ?? []),
      ].map((cell) => cell.textContent);
    await vi.waitFor(() => {
      expect(cells('Host and port')).toEqual(['db-then:5432', 'db:5432']);
    });
    // What didn't change reads the same on both sides.
    expect(cells('Signs in with')[0]).toBe(cells('Signs in with')[1]);
    // A credential only said against now, under Current (design 06, state D).
    expect(cells('Password')).toEqual(['Stored · encrypted', 'Replaced']);
    expect(document.body.textContent).not.toContain('SEALED');
  });
});
