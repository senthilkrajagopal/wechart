import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { FolderNode } from '../explore/FolderTree';
import { FileList, modelFilesQuery, ModelFilesNotFound } from './FileList';
import { FileTree } from './FileTree';
import { fileHref, modelAccessOf, modelHref, shownMemberOf } from './inFolder';
import { JoinEditor } from './JoinEditor';
import { ProblemsPanel } from './ProblemsPanel';
import { ReferencesWarning } from './ReferencesWarning';

/**
 * T342: a model opened in its folder, beside that folder's files, read-only
 * when shared.
 *
 * - AC-222: WHILE a model is open, THE SYSTEM SHALL show its folder's model
 *   files beside the editor, open the chosen file in place with its folder
 *   and name in the URL, offer New cube and New view in the user's
 *   workspace, and mark each file that has problems. Fails when: … New cube
 *   or New view is … offered in a shared folder …
 * - AC-329, the model page's part: a folder's cubes are never shown by their
 *   prefixed names.
 * - Rules 70 and 71: a model opens under its folder, read-only in a shared
 *   folder, where a read-write member's action is "Edit in my workspace"
 *   and a view-only member has none.
 */
const FOLDERS: FolderNode[] = [
  { id: 'sales', title: 'Sales', parentId: null, xcubeId: 'fsales' },
  { id: 'emea', title: 'EMEA', parentId: 'sales', xcubeId: 'femea' },
];

describe('a model’s addresses (AC-222)', () => {
  it('names the folder and the file, and keeps the Model workspace’s own for the root', () => {
    expect(fileHref('cubes/orders.yml', 'emea')).toBe(
      '/explore/folders/emea/models/cubes%2Forders.yml',
    );
    expect(modelHref('emea')).toBe('/explore/folders/emea/models');
    // The Model workspace, as it was (T234): the root's, by the file alone.
    expect(fileHref('cubes/orders.yml')).toBe('/model/files/cubes%2Forders.yml');
    expect(modelHref()).toBe('/model');
  });
});

describe('who may change a model where (rules 70 and 71, AC-222)', () => {
  const me = (security: 'off' | 'oidc', superAdmin = false, readWrite = false) => ({
    name: 'Someone',
    groups: [],
    security,
    superAdmin,
    readWrite,
  });

  it('lets the one user of sign-in off change it in place', () => {
    expect(modelAccessOf({ me: me('off'), right: 'unknown' })).toEqual({
      readOnly: false,
      editInWorkspace: false,
    });
  });

  it('keeps a shared model read-only with sign-in on, a Super-Admin’s too, offering Edit in my workspace', () => {
    expect(modelAccessOf({ me: me('oidc', true), right: 'write' })).toEqual({
      readOnly: true,
      editInWorkspace: true,
    });
    expect(modelAccessOf({ me: me('oidc', false, true), right: 'write' })).toEqual({
      readOnly: true,
      editInWorkspace: true,
    });
  });

  it('offers a view-only member nothing, nor anyone until their right is known', () => {
    expect(modelAccessOf({ me: me('oidc', false, true), right: 'read' })).toEqual({
      readOnly: true,
      editInWorkspace: false,
    });
    expect(modelAccessOf({ me: me('oidc', false, true), right: 'unknown' })).toEqual({
      readOnly: true,
      editInWorkspace: false,
    });
    // No workspace to copy into: a reader everywhere.
    expect(modelAccessOf({ me: me('oidc'), right: 'write' })).toEqual({
      readOnly: true,
      editInWorkspace: false,
    });
  });

  it('changes nothing in place while who is signed in isn’t known', () => {
    expect(modelAccessOf({ me: undefined, right: 'write' })).toEqual({
      readOnly: true,
      editInWorkspace: false,
    });
  });
});

describe('a member as the model page names it (AC-329)', () => {
  it('names the open folder’s own by its short name, never the prefixed one', () => {
    expect(shownMemberOf('femea__orders.count', 'emea', FOLDERS)).toBe('orders.count');
  });

  it('names another folder’s with that folder’s path', () => {
    expect(shownMemberOf('femea__summary.count', 'sales', FOLDERS)).toBe(
      'summary.count (Sales / EMEA)',
    );
    expect(shownMemberOf('fsales__summary.count', 'root', FOLDERS)).toBe('summary.count (Sales)');
  });

  it('names the root’s as they are, from the root, and with “Shared” from a folder', () => {
    expect(shownMemberOf('orders.count', 'root', FOLDERS)).toBe('orders.count');
    expect(shownMemberOf('orders.count', 'emea', FOLDERS)).toBe('orders.count (Shared)');
  });
});

const FILES = [
  { path: 'cubes/orders.yml', content: 'cubes:\n  - name: orders\n    sql_table: t\n' },
  { path: 'views/summary.yml', content: 'views:\n  - name: summary\n' },
];

describe('a folder’s files beside its model (AC-222)', () => {
  it('links each file to its place in the folder', () => {
    render(
      <FileTree
        files={FILES}
        current="cubes/orders.yml"
        hrefOf={(path) => fileHref(path, 'emea')}
        onOpen={vi.fn()}
        onNew={vi.fn()}
      />,
    );

    const nav = screen.getByRole('navigation', { name: 'Model files' });
    expect(
      within(nav)
        .getByRole('link', { name: /^summary\.yml/ })
        .getAttribute('href'),
    ).toBe('/explore/folders/emea/models/views%2Fsummary.yml');
  });

  it('draws neither New cube, New view nor Generate when the page gives the tree no way to make one', () => {
    render(<FileTree files={FILES} current="cubes/orders.yml" onOpen={vi.fn()} />);

    const nav = screen.getByRole('navigation', { name: 'Model files' });
    expect(within(nav).queryByRole('button', { name: /New cube/ })).toBeNull();
    expect(within(nav).queryByRole('button', { name: /New view/ })).toBeNull();
    expect(within(nav).queryByRole('button', { name: /Generate/ })).toBeNull();
  });

  it('lists every cube and view by the name its file gives it, each linked in its folder', async () => {
    const onOpen = vi.fn();
    render(
      <FileList
        files={FILES}
        unpublished={new Set()}
        hrefOf={(path) => fileHref(path, 'emea')}
        onOpen={onOpen}
      />,
    );

    const table = screen.getByRole('table', { name: 'Cubes and views' });
    const link = within(table).getByRole('link', { name: 'cubes/orders.yml' });
    expect(link.getAttribute('href')).toBe('/explore/folders/emea/models/cubes%2Forders.yml');
    expect(within(table).getByRole('cell', { name: 'orders' })).toBeTruthy();
    await userEvent.click(link);
    expect(onOpen).toHaveBeenCalledWith('cubes/orders.yml');
  });

  it('draws nothing to make in an empty list when the page gives it no way to make one', () => {
    render(<FileList files={[]} unpublished={new Set()} onOpen={vi.fn()} />);

    expect(screen.getByText('There are no model files.')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('a folder the user can’t see, or that isn’t there (rule 67)', () => {
  it('reads as no folder at all, not as a model that failed to load', async () => {
    const fetched = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{"error":"no"}', { status: 404 }));
    try {
      await expect(
        modelFilesQuery('hidden').queryFn({ signal: new AbortController().signal }),
      ).rejects.toBeInstanceOf(ModelFilesNotFound);
      expect(fetched).toHaveBeenCalledWith('/api/model/files?folder=hidden', expect.anything());
    } finally {
      fetched.mockRestore();
    }
  });
});

describe('the join diagram on a folder’s file (AC-222)', () => {
  it('links each other cube to its file in the folder, never the root’s file of the same path', () => {
    render(
      <JoinEditor
        graph={{
          cubes: [
            { name: 't342_orders', path: 'cubes/orders.yml', dimensions: 1, measures: 1 },
            { name: 't342_customers', path: 'cubes/customers.yml', dimensions: 1, measures: 1 },
          ],
          joins: [{ from: 't342_orders', to: 't342_customers', relationship: 'many_to_one' }],
          missing: [],
        }}
        cube="t342_customers"
        cubes={['t342_customers']}
        onAdd={vi.fn()}
        hrefOf={(path) => fileHref(path, 'emea')}
      />,
    );

    const list = screen.getByRole('list', { name: 'Joins' });
    expect(within(list).getByRole('link', { name: 't342_orders' }).getAttribute('href')).toBe(
      '/explore/folders/emea/models/cubes%2Forders.yml',
    );
  });
});

describe('Cube’s refusals on a folder’s page (AC-222)', () => {
  it('goes to another of the folder’s files in the folder, and says a root file is the root’s', () => {
    render(
      <ProblemsPanel
        path="cubes/orders.yml"
        problems={[]}
        folderId="emea"
        hrefOf={(path) => fileHref(path, 'emea')}
        cubeProblems={[
          { path: 'cubes/orders.yml', folderId: 'emea', message: 'Here.' },
          { path: 'cubes/customers.yml', folderId: 'emea', line: 3, message: 'Beside it.' },
          { path: 'cubes/orders.yml', message: 'The root’s.' },
        ]}
        folders={FOLDERS}
      />,
    );

    const panel = screen.getByRole('region', { name: 'Problems' });
    const [here, beside, root] = within(panel).getAllByRole('listitem');
    expect(within(here!).queryByRole('link')).toBeNull();
    expect(
      within(beside!).getByRole('link', { name: 'cubes/customers.yml:3' }).getAttribute('href'),
    ).toBe('/explore/folders/emea/models/cubes%2Fcustomers.yml');
    // The root's file of the same path is another folder's: never this one's.
    expect(
      within(root!).getByRole('link', { name: 'Shared · cubes/orders.yml' }).getAttribute('href'),
    ).toBe('/explore');
  });
});

describe('the charts a folder’s save changes, named as the page names members (AC-141, AC-329)', () => {
  it('says each member as the page names it, never by its prefixed name', () => {
    render(
      <ReferencesWarning
        found={{
          charts: [
            { id: 'c1', title: 'EMEA orders', dashboardId: null, members: ['femea__orders.count'] },
          ],
          dashboards: [],
        }}
        nameOf={(member) => shownMemberOf(member, 'emea', FOLDERS)}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    const warning = screen.getByRole('alert');
    expect(warning.textContent).toContain('EMEA orders — uses orders.count');
    expect(warning.textContent).not.toContain('femea__');
  });
});
