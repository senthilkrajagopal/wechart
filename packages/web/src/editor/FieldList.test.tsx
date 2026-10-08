import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { WorkspaceItemContext } from '../query/meta';
import { FieldList } from './FieldList';

/**
 * T475's review (2026-09-27 design 10, state D), as T718 has it (AC-428;
 * AC-342 retired): a workspace item's field list is its overlay's
 * (`/api/meta?for=`), which holds the item's copy of a cube in place of the
 * one it copies, under the same name. The picker lists the copy in the
 * landed cube's place, in its folder (read from the folders' own meta,
 * `/api/meta`), marked "Your copy"; nothing is dimmed.
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

describe('a workspace item’s cube picker (T475’s review, T718, AC-428)', () => {
  it('lists its copy in the landed cube’s place, marked “Your copy”, and the landed one not at all', async () => {
    answering({
      '/api/meta?for=chart%3Ac1': {
        cubes: [
          xcubeCube('orders', 'Orders (mine)', 'froot', true),
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
      ).toEqual(['COrders (mine)Your copyShared', 'CCustomersShared']),
    );
    for (const option of within(list).getAllByRole('option'))
      expect(option.getAttribute('aria-disabled')).toBeNull();
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
