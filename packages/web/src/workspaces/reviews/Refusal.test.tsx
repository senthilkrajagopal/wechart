import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Refusal } from './Refusal';

/**
 * T451 (AC-322, AC-321; design 05, state L): an approval the publish check
 * refused. Each break in a folder the reviewer may see is named, with its
 * file, its folder, the line and column where given, and the error; the rest
 * are counted. Nothing changed, which the panel's disabled Approve says.
 */
describe('an approval refused by the publish check (T451; design 05, state L)', () => {
  it('names each break it may, and counts the rest', () => {
    render(
      <Refusal
        breaks={[
          {
            path: 'sales.yml',
            folderPath: ['Shared', 'Sales', 'EMEA'],
            line: 34,
            column: 9,
            message: 'measure orders.avg_value: unknown member orders.amount_net',
          },
          {
            path: 'cubes/returns.yml',
            folderPath: ['Shared'],
            message: 'join to "orders" names no cube on its path',
          },
        ]}
        hidden={1}
      />,
    );
    expect(screen.getByRole('alert').textContent).toBe('Can’t approve: 2 items would break');
    const breaks = screen.getAllByRole('listitem').map((each) => each.textContent);
    expect(breaks).toEqual([
      'sales.yml · Sales / EMEA · line 34, column 9measure orders.avg_value: unknown member orders.amount_net',
      'cubes/returns.yml · Sharedjoin to "orders" names no cube on its path',
    ]);
    expect(screen.getByText('1 item in a folder you can’t see would also break.')).toBeTruthy();
  });

  it('counts breaks it may not name, and says nothing more where there are none', () => {
    const { rerender } = render(<Refusal breaks={[]} hidden={2} />);
    expect(screen.getByRole('alert').textContent).toBe(
      'Can’t approve: 2 items in folders you can’t see would break',
    );
    expect(screen.queryAllByRole('listitem')).toEqual([]);

    rerender(
      <Refusal
        breaks={[{ path: 'a.yml', folderPath: ['Shared', 'A'], message: 'bad' }]}
        hidden={0}
      />,
    );
    expect(screen.getByRole('alert').textContent).toBe('Can’t approve: 1 item would break');
    expect(screen.queryByText(/can’t see/)).toBeNull();
  });
});
