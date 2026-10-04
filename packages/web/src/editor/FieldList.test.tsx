import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { WorkspaceItemContext } from '../query/meta';
import { FieldList } from './FieldList';

/**
 * T475's review (AC-342; 2026-09-27 design 10, state D): a workspace item's
 * field list is its overlay's (`/api/meta?for=`), which holds the item's copy
 * of a cube in place of the one it copies, under the same name. The picker
 * still lists the published one in its folder, dimmed, "hidden by your copy",
 * read from the folders' own meta (`/api/meta`).
 */
const xcubeCube = (name: string, title: string, folderId: string, workspace = false) => ({
  name,
  title,
  type: 'cube',
  meta: {
    xcube: { folderId, shortName: name },
    ...(workspace ? { wechart: { workspace: true } } : {}),
  },
  measures: [],
  dimensions: [],
  segments: [],
});

function answering(routes: Record<string, unknown>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const said = routes[String(input)];
      return said === undefined ? new Response('not found', { status: 404 }) : Response.json(said);
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('a workspace item’s cube picker (T475’s review, AC-342)', () => {
  it('lists the published cube its copy replaced in its folder, hidden by your copy', async () => {
    answering({
      '/api/meta?for=chart%3Ac1': {
        cubes: [
          xcubeCube('orders', 'Orders', 'froot', true),
          xcubeCube('customers', 'Customers', 'froot'),
        ],
      },
      '/api/meta': {
        cubes: [
          xcubeCube('orders', 'Orders', 'froot'),
          xcubeCube('customers', 'Customers', 'froot'),
        ],
      },
      '/api/folders': [
        { id: 'w', title: 'project-2026-10-04', parentId: 'mine', itemCount: 1, xcubeId: null },
      ],
    });
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <WorkspaceItemContext.Provider value={{ item: { kind: 'chart', id: 'c1' } }}>
          <FieldList folderId="w" />
        </WorkspaceItemContext.Provider>
      </QueryClientProvider>,
    );

    await userEvent.click(await screen.findByRole('button', { name: /^Cube or view/ }));
    const list = screen.getByRole('listbox', { name: 'Cubes and views' });
    // The folders' meta may come a moment after the overlay's.
    await waitFor(() =>
      expect(
        within(list)
          .getAllByRole('option')
          .map((option) => option.textContent),
      ).toEqual(['COrdersMy workspace', 'COrdersShared · hidden by your copy', 'CCustomersShared']),
    );
    expect(within(list).getAllByRole('option')[1]?.getAttribute('aria-disabled')).toBe('true');
  });

  // AC-329: never a prefixed name, not even for a cube the model no longer has.
  it('names a chosen cube the model doesn’t list by its short name in words, never its prefix', async () => {
    answering({ '/api/meta': { cubes: [xcubeCube('orders', 'Orders', 'froot')] } });
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <FieldList cubeName="fsales__open_returns" />
      </QueryClientProvider>,
    );

    const button = await screen.findByRole('button', { name: /^Cube or view/ });
    expect(button.textContent).toContain('Open returns');
    expect(button.textContent).not.toContain('sales');
  });
});
