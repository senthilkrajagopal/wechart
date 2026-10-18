import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { MakeFromButtons } from './ResultHead';

/**
 * T819 (AC-461): Make a cube… and Make a chart… in a result's head, enabled
 * where `makeFrom` allows, and otherwise disabled with the reason beside
 * them, which each names as its description.
 */
describe('MakeFromButtons (T819, AC-461)', () => {
  it('offers both, each choosing its own kind', async () => {
    const onMake = vi.fn();
    render(<MakeFromButtons make={{ enabled: true }} onMake={onMake} />);
    const cube = screen.getByRole('button', { name: 'Make a cube…' });
    const chart = screen.getByRole('button', { name: 'Make a chart…' });
    expect(cube.getAttribute('aria-disabled')).toBeNull();
    expect(chart.getAttribute('aria-disabled')).toBeNull();
    expect(screen.queryByTestId('sql-make-why')).toBeNull();
    await userEvent.click(cube);
    await userEvent.click(chart);
    expect(onMake.mock.calls).toEqual([['cube'], ['chart']]);
  });

  it('disables both with the reason, which each is described by, and neither does anything', async () => {
    const onMake = vi.fn();
    render(
      <MakeFromButtons
        make={{ enabled: false, reason: 'Run it to the end first.' }}
        onMake={onMake}
      />,
    );
    for (const name of ['Make a cube…', 'Make a chart…']) {
      const button = screen.getByRole('button', { name });
      expect(button.getAttribute('aria-disabled')).toBe('true');
      const describedBy = button.getAttribute('aria-describedby') ?? '';
      expect(document.getElementById(describedBy)?.textContent).toBe('Run it to the end first.');
      await userEvent.click(button);
    }
    expect(onMake).not.toHaveBeenCalled();
    expect(screen.getByTestId('sql-make-why').textContent).toBe('Run it to the end first.');
  });

  it('shows a column’s name in the reason in the code face, without its backticks', () => {
    render(
      <MakeFromButtons
        make={{
          enabled: false,
          reason: 'Two columns are named `a`: give each its own name with AS, and run it again.',
        }}
        onMake={vi.fn()}
      />,
    );
    const why = screen.getByTestId('sql-make-why');
    expect(why.textContent).toBe(
      'Two columns are named a: give each its own name with AS, and run it again.',
    );
    expect(why.querySelector('code')?.textContent).toBe('a');
  });
});
