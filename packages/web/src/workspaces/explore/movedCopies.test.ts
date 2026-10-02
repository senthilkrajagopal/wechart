import { describe, expect, it } from 'vitest';

import { movedCopiesText } from './movedCopies';

/**
 * T537 (AC-371): a move that leaves a dashboard showing a library chart kept
 * off its folder's path gives that dashboard its own copy, and the user who
 * moved it is told which: each dashboard they may see by name, with the
 * charts it now has its own copies of, and the rest counted.
 */
const chart = (title: string) => ({ from: `from-${title}`, id: `copy-${title}`, title });

describe('what a move says it copied (T537, AC-371)', () => {
  it('says nothing of a move that copied nothing', () => {
    expect(movedCopiesText({})).toBeUndefined();
    expect(movedCopiesText({ copiedOn: [], copiedHidden: 0 })).toBeUndefined();
  });

  it('names each dashboard and the charts it now has its own copies of', () => {
    expect(
      movedCopiesText({
        copiedOn: [
          { id: 'd1', title: 'Revenue', charts: [chart('Orders')] },
          { id: 'd2', title: 'Pipeline', charts: [chart('Deals'), chart('Wins')] },
        ],
        copiedHidden: 0,
      }),
    ).toBe(
      '“Revenue” now shows its own copy of “Orders”: after this move, that chart isn’t kept in the dashboard’s folder or one above it. ' +
        '“Pipeline” now shows its own copies of “Deals” and “Wins”: after this move, those charts aren’t kept in the dashboard’s folder or one above it.',
    );
  });

  it('counts the dashboards in folders the user can’t see', () => {
    expect(movedCopiesText({ copiedOn: [], copiedHidden: 1 })).toBe(
      '1 dashboard in a folder you can’t see now shows its own copy of a chart this move took off its folder’s path.',
    );
    expect(
      movedCopiesText({
        copiedOn: [{ id: 'd1', title: 'Revenue', charts: [chart('Orders')] }],
        copiedHidden: 3,
      }),
    ).toBe(
      '“Revenue” now shows its own copy of “Orders”: after this move, that chart isn’t kept in the dashboard’s folder or one above it. ' +
        '3 dashboards in folders you can’t see now show their own copies of charts this move took off their folders’ paths.',
    );
  });

  it('lists three or more charts with commas', () => {
    expect(
      movedCopiesText({
        copiedOn: [{ id: 'd1', title: 'Board', charts: [chart('A'), chart('B'), chart('C')] }],
      }),
    ).toBe(
      '“Board” now shows its own copies of “A”, “B” and “C”: after this move, those charts aren’t kept in the dashboard’s folder or one above it.',
    );
  });
});
