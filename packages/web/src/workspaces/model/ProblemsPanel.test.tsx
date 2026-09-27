import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { problemsOf } from './problems';
import { ProblemsPanel } from './ProblemsPanel';

/**
 * T141 / AC-135: IF the YAML fails to parse, THEN THE SYSTEM SHALL name the
 * file and line in a problems list …
 * Fails when: … the problem names no line.
 */
describe('the problems panel', () => {
  const TEXT = 'cubes:\n  - name: a\n  - name: b\n   bad: 1\n';

  it('names the file and the line of each problem, and what is wrong', () => {
    const problems = problemsOf('cubes/x.yml', TEXT);
    render(<ProblemsPanel path="cubes/x.yml" problems={problems} />);

    const panel = screen.getByRole('region', { name: 'Problems' });
    expect(within(panel).getByRole('heading').textContent).toBe(
      `Problems · ${String(problems.length)} ${problems.length === 1 ? 'error' : 'errors'} · 0 warnings`,
    );
    const items = within(panel).getAllByRole('listitem');
    expect(items).toHaveLength(problems.length);
    const [first] = items;
    expect(first?.querySelector('.model-problems__where')?.textContent).toBe('cubes/x.yml:4');
    expect(first?.textContent).toContain(problems[0]?.message);
  });

  it('goes to a problem’s place when it is picked', async () => {
    const problems = problemsOf('cubes/x.yml', TEXT);
    const onPick = vi.fn();
    render(<ProblemsPanel path="cubes/x.yml" problems={problems} onPick={onPick} />);

    await userEvent.click(screen.getByRole('button', { name: /cubes\/x\.yml:4/ }));

    expect(onPick).toHaveBeenCalledWith(problems[0]);
  });

  it('lists Cube’s reasons for refusing the model too, each on its file (T142, AC-136)', () => {
    render(
      <ProblemsPanel
        path="cubes/orders.yml"
        problems={[]}
        cubeProblems={[
          { path: 'cubes/orders.yml', message: 'no_such_member is not defined' },
          { path: 'cubes/products.yml', line: 2, message: 'YAMLException: missed comma (2:3)' },
        ]}
      />,
    );

    const panel = screen.getByRole('region', { name: 'Problems' });
    expect(within(panel).getByRole('heading').textContent).toBe('Problems · 2 errors · 0 warnings');
    expect(
      within(panel)
        .getAllByRole('listitem')
        .map((item) => [
          item.querySelector('.model-problems__message')?.textContent,
          item.querySelector('.model-problems__where')?.textContent,
        ]),
    ).toEqual([
      ['Cube: no_such_member is not defined', 'cubes/orders.yml'],
      ['Cube: YAMLException: missed comma (2:3)', 'cubes/products.yml:2'],
    ]);
  });

  /**
   * T234 / AC-223: … the code with its Problems panel docked beneath it
   * counting errors and warnings …
   * `Fails when: … Problems gives no count of warnings …`
   */
  it('counts warnings apart from errors, each with its own icon', () => {
    const warning = {
      path: 'cubes/x.yml',
      line: 3,
      column: 5,
      message: 'A warning',
      from: 10,
      to: 12,
      severity: 'warning' as const,
    };
    render(<ProblemsPanel path="cubes/x.yml" problems={[warning]} />);

    const panel = screen.getByRole('region', { name: 'Problems' });
    expect(within(panel).getByRole('heading').textContent).toBe('Problems · 0 errors · 1 warning');
    const [item] = within(panel).getAllByRole('listitem');
    expect(item?.querySelector('svg')?.getAttribute('data-icon')).toBe('warn');
  });

  /**
   * T450's review, AC-189: a publish refused for another folder's rollup
   * says which folder, and goes to that folder, not to the root's file of
   * the same path.
   */
  it('names the folder of a refusal about another folder’s file, and goes there', () => {
    render(
      <ProblemsPanel
        path="cubes/summary.yml"
        problems={[]}
        cubeProblems={[
          {
            path: 'cubes/summary.yml',
            folderId: 's-1',
            line: 7,
            message: 'Pre-aggregation main names what the model doesn’t have: amount (measures).',
            preAggregation: {
              cube: 'summary',
              name: 'main',
              unknown: [{ list: 'measures', name: 'amount' }],
            },
          },
        ]}
        folders={[{ id: 's-1', title: 'Sales', parentId: 'root' }]}
      />,
    );

    const where = screen.getByRole('link', { name: 'Shared / Sales · cubes/summary.yml:7' });
    expect(where.getAttribute('href')).toBe('/explore?folder=s-1');
  });

  it('says there are none when the file parses', () => {
    render(<ProblemsPanel path="cubes/x.yml" problems={[]} />);

    const panel = screen.getByRole('region', { name: 'Problems' });
    expect(within(panel).queryAllByRole('listitem')).toHaveLength(0);
    expect(panel.textContent).toContain('No problems in cubes/x.yml');
  });
});
