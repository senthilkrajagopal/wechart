import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { FileTree } from './FileTree';

/**
 * T234 / AC-222: WHILE the Model workspace is open, THE SYSTEM SHALL show a
 * tree of the model's files beside the editor, open the chosen file in place
 * with its path in the URL, offer New cube and New view from the tree, and
 * mark each file that has problems.
 * `Fails when: moving to another file requires leaving the editor, New cube or
 * New view is missing, or a file with an error carries no mark in the tree.`
 */
const FILES = [
  { path: 'cubes/orders.yml', content: 'cubes:\n  - name: orders\n    sql_table: t\n' },
  { path: 'cubes/broken.yml', content: 'cubes: [\n' },
  { path: 'views/summary.yml', content: 'views:\n  - name: summary\n' },
  { path: 'globals.py', content: 'x = 1\n' },
];

const tree = (props: Partial<Parameters<typeof FileTree>[0]> = {}) => {
  const handlers = { onOpen: vi.fn(), onNew: vi.fn() };
  render(<FileTree files={FILES} current="cubes/orders.yml" {...handlers} {...props} />);
  return { ...handlers, nav: screen.getByRole('navigation', { name: 'Model files' }) };
};

describe('the model’s file tree (AC-222)', () => {
  it('lists every file under its folder, each a link to it, the open one current', () => {
    const { nav } = tree();
    // In its folder, not merely beside it.
    const cubes = within(nav).getByRole('group', { name: 'cubes/' });
    expect(cubes.getAttribute('aria-label')).toBe('cubes/');
    const orders = within(cubes).getByRole('link', { name: /^orders\.yml/ });
    expect(orders.getAttribute('href')).toBe('/model/files/cubes%2Forders.yml');
    expect(orders.getAttribute('aria-current')).toBe('page');
    expect(
      within(nav)
        .getByRole('link', { name: /^summary\.yml/ })
        .getAttribute('aria-current'),
    ).toBeNull();
    // A file at the model's root too.
    expect(within(nav).getByRole('link', { name: /^globals\.py/ })).toBeTruthy();
  });

  it('opens a file in place, not by leaving the page', async () => {
    const { nav, onOpen } = tree();
    await userEvent.click(within(nav).getByRole('link', { name: /^summary\.yml/ }));
    expect(onOpen).toHaveBeenCalledWith('views/summary.yml');
  });

  it('marks a file that does not parse, in words as well as its icon', () => {
    const { nav } = tree();
    const broken = within(nav).getByRole('link', { name: /^broken\.yml/ });
    expect(broken.querySelector('.model-tree__mark')?.textContent).toBe('problems');
    expect(broken.querySelector('svg')?.getAttribute('data-icon')).toBe('err');
    expect(within(nav).getByRole('link', { name: /^orders\.yml/ }).textContent).not.toContain(
      'problems',
    );
  });

  it('marks the open file by the errors its editor has now', () => {
    const { nav } = tree({ reported: { 'cubes/orders.yml': 2 } });
    expect(within(nav).getByRole('link', { name: /^orders\.yml/ }).textContent).toContain(
      'problems',
    );
  });

  // T234's review: a refusal from Cube is on the file it is about, open or not.
  it('marks a file not open that the editor reports Cube refused', () => {
    const { nav } = tree({ reported: { 'cubes/orders.yml': 0, 'views/summary.yml': 1 } });
    expect(within(nav).getByRole('link', { name: /^summary\.yml/ }).textContent).toContain(
      'problems',
    );
    expect(within(nav).getByRole('link', { name: /^orders\.yml/ }).textContent).not.toContain(
      'problems',
    );
  });

  it('offers New cube and New view', async () => {
    const { nav, onNew } = tree();
    await userEvent.click(within(nav).getByRole('button', { name: 'New cube' }));
    await userEvent.click(within(nav).getByRole('button', { name: 'New view' }));
    expect(onNew.mock.calls).toEqual([['cube'], ['view']]);
  });

  it('says a file not yet published is new', () => {
    const { nav } = tree({ drafts: new Set(['cubes/orders.yml']) });
    const orders = within(nav).getByRole('link', { name: /^orders\.yml/ });
    expect(orders.querySelector('.model-tree__tag')?.textContent).toBe('unpublished');
    // Its icon beside its word (direction.md rule 3).
    expect(orders.querySelector('.model-tree__tag svg')).toBeTruthy();
  });
});
