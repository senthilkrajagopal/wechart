import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

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
