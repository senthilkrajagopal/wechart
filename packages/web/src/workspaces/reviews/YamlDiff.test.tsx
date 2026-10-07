import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EditorView } from '@codemirror/view';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { changedLinesOf, YamlDiff } from './YamlDiff';

/**
 * T350 (AC-285; design 05, state G; rules 3 and 77): a proposed model is
 * reviewed as a unified diff of its YAML against the folder's current file —
 * the code face, line numbers, + and − beside the lines and a tint, never
 * colour alone — read-only, with nothing to accept or reject in it.
 */
const CURRENT = [
  'cubes:',
  '  - name: orders',
  '    sql_table: public.orders',
  '    measures:',
  '      - name: total',
  '        type: number_agg',
  '',
].join('\n');
const PROPOSED = [
  'cubes:',
  '  - name: orders',
  '    sql_table: public.orders',
  '    dimensions:',
  '      - name: country',
  '        sql: ship_country',
  '        type: string',
  '    measures:',
  '      - name: total',
  '        type: avg',
  '',
].join('\n');

describe('a model’s YAML diff (T350, design 05 state G)', () => {
  it('counts the lines the proposal adds and removes', () => {
    expect(changedLinesOf(CURRENT, PROPOSED)).toEqual({ added: 5, removed: 1 });
    expect(changedLinesOf('', PROPOSED)).toEqual({ added: 10, removed: 0 });
    expect(changedLinesOf(CURRENT, CURRENT)).toEqual({ added: 0, removed: 0 });
  });

  it('heads with the file, the version it replaces and what it changes', () => {
    render(<YamlDiff path="cubes/orders.yml" current={CURRENT} version={3} proposed={PROPOSED} />);
    expect(screen.getByTestId('yaml-diff-head').textContent).toBe(
      'cubes/orders.yml version 3 → proposed · +5 −1',
    );
  });

  it('heads a new file as new, with everything added', () => {
    render(<YamlDiff path="cubes/orders.yml" proposed={PROPOSED} />);
    expect(screen.getByTestId('yaml-diff-head').textContent).toBe(
      'cubes/orders.yml new in this folder · +10',
    );
  });

  // Design 05, state G: long unchanged stretches folded away, the changes in view.
  it('folds a long stretch of unchanged lines', () => {
    const long = (end: string) =>
      [
        'cubes:',
        '  - name: orders',
        ...Array.from({ length: 20 }, (_, at) => `    # note ${String(at)}`),
        `    sql_table: public.${end}`,
        '',
      ].join('\n');
    const { container } = render(
      <YamlDiff
        path="cubes/orders.yml"
        current={long('orders')}
        version={2}
        proposed={long('o2')}
      />,
    );
    expect(container.querySelector('.cm-collapsedLines')).not.toBeNull();
    expect(screen.getByTestId('yaml-diff-head').textContent).toBe(
      'cubes/orders.yml version 2 → proposed · +1 −1',
    );
  });

  it('shows a decided one as proposed, with nothing set against it', () => {
    const { container } = render(
      <YamlDiff path="cubes/orders.yml" proposed={PROPOSED} asProposed />,
    );
    expect(screen.getByTestId('yaml-diff-head').textContent).toBe('cubes/orders.yml as proposed');
    expect(
      screen.getByRole('textbox', { name: 'cubes/orders.yml, as proposed' }).textContent,
    ).toContain('name: country');
    expect(container.querySelector('.cm-changedLine')).toBeNull();
  });

  it('shows the proposed file read-only, the current one’s removed lines among it, and nothing to accept or reject', () => {
    const { container } = render(
      <YamlDiff path="cubes/orders.yml" current={CURRENT} version={3} proposed={PROPOSED} />,
    );
    const text = screen.getByRole('textbox', {
      name: 'cubes/orders.yml: the proposed YAML against the current',
    });
    expect(text.getAttribute('aria-readonly')).toBe('true');
    expect(text.textContent).toContain('name: country');
    // The removed line, from the current file, shown where it was.
    const removed = [...container.querySelectorAll('.cm-deletedLine')].map(
      (line) => line.textContent,
    );
    expect(removed.join('\n')).toContain('number_agg');
    expect(container.querySelector('.cm-chunkButtons')).toBeNull();
    // Each changed line marked beside it, not by its tint alone (rule 3).
    expect(container.querySelectorAll('.cm-changedLineGutter').length).toBeGreaterThan(0);
  });
});

/**
 * T637 (AC-176; R66, the user): the folded lines are reached from the
 * keyboard. "Show all lines", beside the diff, unfolds them all and folds
 * them again; and each "N unchanged lines" bar is a button, Enter or Space
 * on it unfolding its own.
 */
describe('a YAML diff’s folded lines, from the keyboard (T637)', () => {
  /**
   * Placing the caret asks CodeMirror to measure, on its next frame, the
   * text it scrolls to, through a Range's client rects. jsdom lays nothing
   * out and its Range has neither method, so each unfold threw after its
   * test. Given here as jsdom's elements give them: no boxes, and a box of
   * nothing. Only where jsdom lacks them, and taken away after.
   */
  const given: (keyof Range)[] = [];
  beforeAll(() => {
    const none = (): DOMRect => ({
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      toJSON: () => ({}),
    });
    const rects: Partial<Record<keyof Range, () => unknown>> = {
      getClientRects: () => document.createElement('span').getClientRects(),
      getBoundingClientRect: none,
    };
    for (const [name, value] of Object.entries(rects) as [keyof Range, () => unknown][]) {
      if (name in Range.prototype) continue;
      Object.defineProperty(Range.prototype, name, { value, configurable: true, writable: true });
      given.push(name);
    }
  });
  afterAll(() => {
    for (const name of given.splice(0)) Reflect.deleteProperty(Range.prototype, name);
  });

  const long = (end: string) =>
    [
      'cubes:',
      '  - name: orders',
      ...Array.from({ length: 20 }, (_, at) => `    # note ${String(at)}`),
      `    sql_table: public.${end}`,
      '',
    ].join('\n');
  const shown = () =>
    render(
      <YamlDiff
        path="cubes/orders.yml"
        current={long('orders')}
        version={2}
        proposed={long('o2')}
      />,
    );

  it('unfolds every line with Show all lines, and folds them again', async () => {
    const { container } = shown();
    const toggle = screen.getByRole('button', { name: 'Show all lines' });
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    await userEvent.click(toggle);
    expect(container.querySelector('.cm-collapsedLines')).toBeNull();
    expect(container.textContent).toContain('# note 10');
    expect(
      screen.getByRole('button', { name: 'Show all lines' }).getAttribute('aria-pressed'),
    ).toBe('true');
    await userEvent.click(screen.getByRole('button', { name: 'Show all lines' }));
    expect(container.querySelector('.cm-collapsedLines')).not.toBeNull();
  });

  it('makes each folded stretch a button that unfolds on Enter', async () => {
    const { container } = shown();
    const bar = await screen.findByRole('button', { name: /unchanged lines$/ });
    expect(bar.classList.contains('cm-collapsedLines')).toBe(true);
    expect(bar.getAttribute('tabindex')).toBe('0');
    bar.focus();
    await userEvent.keyboard('{Enter}');
    await vi.waitFor(() => {
      expect(container.querySelector('.cm-collapsedLines')).toBeNull();
    });
    expect(container.textContent).toContain('# note 10');
    // Its bar gone, focus is in the text it unfolded, not on the page.
    expect(document.activeElement).toBe(
      screen.getByRole('textbox', {
        name: 'cubes/orders.yml: the proposed YAML against the current',
      }),
    );
  });

  /**
   * T637's review: a stretch between two changes, unfolded by Space, puts
   * the caret on its first line, not the file's first; and one unfolded by
   * the pointer keeps focus in the text, not the page.
   */
  const between = (first: string, last: string) =>
    [
      `# head ${first}`,
      ...Array.from({ length: 20 }, (_, at) => `# note ${String(at)}`),
      `# tail ${last}`,
      '',
    ].join('\n');
  const midway = () =>
    render(
      <YamlDiff
        path="cubes/orders.yml"
        current={between('a', 'a')}
        version={2}
        proposed={between('b', 'b')}
      />,
    );
  const textbox = () =>
    screen.getByRole('textbox', {
      name: 'cubes/orders.yml: the proposed YAML against the current',
    });

  it('puts the caret on the first line it unfolds, by Space', async () => {
    midway();
    const bar = await screen.findByRole('button', { name: /unchanged lines$/ });
    bar.focus();
    await userEvent.keyboard(' ');
    await vi.waitFor(() => {
      expect(screen.queryByRole('button', { name: /unchanged lines$/ })).toBeNull();
    });
    expect(document.activeElement).toBe(textbox());
    const view = EditorView.findFromDOM(textbox());
    const line = view?.state.doc.lineAt(view.state.selection.main.head).number ?? 0;
    // The stretch begins past the head and the 3 lines kept round its change.
    expect(line).toBeGreaterThan(3);
  });

  it('keeps focus in the text when the pointer unfolds a stretch', async () => {
    midway();
    const bar = await screen.findByRole('button', { name: /unchanged lines$/ });
    await userEvent.click(bar);
    await vi.waitFor(() => {
      expect(screen.queryByRole('button', { name: /unchanged lines$/ })).toBeNull();
    });
    expect(document.activeElement).toBe(textbox());
  });

  it('offers Show all lines only where something folds against a current file', () => {
    const { unmount } = render(<YamlDiff path="cubes/orders.yml" proposed={between('b', 'b')} />);
    expect(screen.queryByRole('button', { name: 'Show all lines' })).toBeNull();
    unmount();
    render(<YamlDiff path="cubes/orders.yml" proposed={between('b', 'b')} asProposed />);
    expect(screen.queryByRole('button', { name: 'Show all lines' })).toBeNull();
  });
});
