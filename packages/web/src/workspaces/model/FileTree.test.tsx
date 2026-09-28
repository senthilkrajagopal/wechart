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
    const cubes = within(nav).getByRole('group', { name: 'model/cubes/' });
    expect(cubes.getAttribute('aria-label')).toBe('model/cubes/');
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

  it('marks a file with a value Cube would refuse, as it marks one that does not parse (AC-227)', () => {
    const refused = {
      path: 'cubes/refused.yml',
      content:
        'cubes:\n  - name: refused\n    sql_table: t\n    measures:\n      - name: n\n        type: summ\n',
    };
    const { nav } = tree({ files: [...FILES, refused] });
    expect(within(nav).getByRole('link', { name: /^refused\.yml/ }).textContent).toContain(
      'problems',
    );
    expect(within(nav).getByRole('link', { name: /^orders\.yml/ }).textContent).not.toContain(
      'problems',
    );
  });

  describe('drawn as design 03 note 1 (T479, AC-344)', () => {
    it('heads the tree "Model" with the model’s state, in words beside its icon', () => {
      tree();
      const head = screen.getByRole('heading', { level: 2, name: 'Model' });
      const state = head.parentElement?.querySelector('.model-tree__state');
      expect(state?.textContent).toBe('All published');
      expect(state?.querySelector('svg')?.getAttribute('data-icon')).toBe('ok');
      // In the status colour, as design 03's .status.ok (T479's review).
      expect(state?.classList.contains('model-tree__state--ok')).toBe(true);
    });

    it('counts the files not yet published in the head', () => {
      tree({ unpublished: new Set(['cubes/orders.yml', 'views/summary.yml']) });
      const state = screen
        .getByRole('heading', { level: 2, name: 'Model' })
        .parentElement?.querySelector('.model-tree__state');
      expect(state?.textContent).toBe('2 unpublished');
      expect(state?.querySelector('svg')?.getAttribute('data-icon')).toBe('idle');
    });

    it('draws each folder as a row under model/ that folds its files away', async () => {
      const { nav } = tree();
      const folder = within(nav).getByRole('button', { name: 'model/cubes/' });
      expect(folder.getAttribute('aria-expanded')).toBe('true');
      const cubes = within(nav).getByRole('group', { name: 'model/cubes/' });
      expect(folder.getAttribute('aria-controls')).toBe(cubes.id);
      expect(within(cubes).getByRole('link', { name: /^orders\.yml/ }).isConnected).toBe(true);
      // The model's own root is model/.
      expect(
        within(nav).getByRole('button', { name: 'model/' }).getAttribute('aria-expanded'),
      ).toBe('true');

      // Folded: the open file is in cubes/, so fold views/ to see one go.
      const views = within(nav).getByRole('button', { name: 'model/views/' });
      await userEvent.click(views);
      expect(views.getAttribute('aria-expanded')).toBe('false');
      expect(within(nav).queryByRole('link', { name: /^summary\.yml/ })).toBeNull();
      // The others stay open.
      expect(within(nav).getByRole('link', { name: /^orders\.yml/ }).isConnected).toBe(true);
      await userEvent.click(views);
      expect(within(nav).getByRole('link', { name: /^summary\.yml/ }).isConnected).toBe(true);
    });

    it('folds the open file’s folder too, and opens a folder again when a file in it opens', async () => {
      const props = { files: FILES, onOpen: vi.fn(), onNew: vi.fn() };
      const { rerender } = render(<FileTree {...props} current="cubes/orders.yml" />);
      const nav = screen.getByRole('navigation', { name: 'Model files' });
      // Any folder folds, the open file's too (T479's review): no press does nothing.
      const cubes = within(nav).getByRole('button', { name: 'model/cubes/' });
      await userEvent.click(cubes);
      expect(cubes.getAttribute('aria-expanded')).toBe('false');
      expect(within(nav).queryByRole('link', { name: /^orders\.yml/ })).toBeNull();
      await userEvent.click(within(nav).getByRole('button', { name: 'model/views/' }));
      // Opening a file in a folded folder — from a link, the overview — shows its row.
      rerender(<FileTree {...props} current="views/summary.yml" />);
      expect(
        within(nav).getByRole('button', { name: 'model/views/' }).getAttribute('aria-expanded'),
      ).toBe('true');
      expect(
        within(nav)
          .getByRole('link', { name: /^summary\.yml/ })
          .getAttribute('aria-current'),
      ).toBe('page');
      // The other stays as it was left.
      expect(cubes.getAttribute('aria-expanded')).toBe('false');
    });

    it('keeps each folder’s files a list, named as a group around it', () => {
      const { nav } = tree();
      const cubes = within(nav).getByRole('group', { name: 'model/cubes/' });
      expect(within(cubes).getByRole('list').children).toHaveLength(2);
      expect(within(cubes).getAllByRole('listitem')).toHaveLength(2);
    });

    it('tags a file the form can’t open with its kind, read-only', () => {
      const jinja = {
        path: 'cubes/templated.yml',
        content: 'cubes:\n  {% for n in [1] %}\n  - name: t{{ n }}\n  {% endfor %}\n',
      };
      const { nav } = tree({ files: [...FILES, jinja] });
      const tag = within(nav)
        .getByRole('link', { name: /^templated\.yml/ })
        .querySelector('.model-tree__kind');
      // Read-only said as well as shown on a hover (T479's review).
      expect(tag?.textContent).toBe('Jinja, read-only');
      expect(tag?.querySelector('.visually-hidden')?.textContent).toBe(', read-only');
      expect(tag?.getAttribute('title')).toBe('Jinja template · read-only here');
      // With the lock design 12 draws it with (pin 3, MW-03), out of its name.
      const lock = tag?.querySelector('.secret-pasted__lock');
      expect(lock?.getAttribute('aria-hidden')).toBe('true');
      expect(
        within(nav)
          .getByRole('link', { name: /^templated\.yml/ })
          .querySelector('.model-tree__name')
          ?.getAttribute('title'),
      ).toBe('templated.yml');
      expect(
        within(nav)
          .getByRole('link', { name: /^globals\.py/ })
          .querySelector('.model-tree__kind')?.textContent,
      ).toBe('Python, read-only');
      expect(
        within(nav)
          .getByRole('link', { name: /^orders\.yml/ })
          .querySelector('.model-tree__kind'),
      ).toBeNull();
    });

    it('offers New cube, New view and Generate cubes under the tree, after its files', async () => {
      const onGenerate = vi.fn();
      const { nav, onNew } = tree({ onGenerate });
      const actions = nav.querySelector('.model-tree__actions');
      expect(
        [...(actions?.querySelectorAll('button') ?? [])].map((button) => button.textContent),
        // Generate named as designs 11 and 12 name it (T485).
      ).toEqual(['+ New cube', '+ New view', '+ Generate from a data source…']);
      // After the files, not over them.
      const lastFile = within(nav).getAllByRole('link').at(-1);
      expect(
        (lastFile?.compareDocumentPosition(actions as Node) ?? 0) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
      const generate = within(nav).getByRole('button', { name: 'Generate from a data source…' });
      expect(generate.classList.contains('is-open')).toBe(false);
      await userEvent.click(generate);
      expect(onGenerate).toHaveBeenCalledTimes(1);
      expect(onNew).not.toHaveBeenCalled();
    });

    /** T495: design 12's states B and F in the tree. */
    it('says there are no files yet, with no state in its head and its foot as ever', () => {
      const { nav } = tree({ files: [], current: undefined });
      expect(nav.querySelector('.model-tree__body > .model-tree__empty')?.textContent).toBe(
        'No files yet.',
      );
      expect(nav.querySelector('.model-tree__folder')).toBeNull();
      expect(nav.querySelector('.model-tree__state')).toBeNull();
      expect(within(nav).getByRole('button', { name: 'New cube' })).toBeTruthy();
    });

    it('says it is reading the model while it does, with no state in its head', () => {
      const { nav } = tree({ files: [], current: undefined, reading: true });
      const line = nav.querySelector('.model-tree__body [role="status"]');
      expect(line?.textContent).toBe('Reading the model…');
      expect(line?.querySelector('svg')?.getAttribute('data-icon')).toBe('run');
      expect(nav.querySelector('.model-tree__state')).toBeNull();
      expect(within(nav).queryByText('No files yet.')).toBeNull();
    });

    it('draws Generate pressed while its pane is open (design 11 pin 9)', () => {
      const { nav } = tree({ onGenerate: vi.fn(), generating: true });
      const generate = within(nav).getByRole('button', { name: 'Generate from a data source…' });
      expect(generate.classList.contains('is-open')).toBe(true);
      // It opens a pane, not a disclosure: nothing says it expands (T485's review).
      expect(generate.hasAttribute('aria-expanded')).toBe(false);
    });
  });

  it('says a file not yet published is new', () => {
    const { nav } = tree({ unpublished: new Set(['cubes/orders.yml']) });
    const orders = within(nav).getByRole('link', { name: /^orders\.yml/ });
    expect(orders.querySelector('.model-tree__tag')?.textContent).toBe('unpublished');
    // Its icon beside its word (direction.md rule 3).
    expect(orders.querySelector('.model-tree__tag svg')).toBeTruthy();
  });
});
