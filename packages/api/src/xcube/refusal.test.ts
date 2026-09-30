import { describe, expect, it } from 'vitest';

import { refusalOf } from './refusal';

/**
 * T427 (AC-322): WHEN the publish check refuses a change, THE SYSTEM SHALL
 * name each break in the folders the user may see, with its error and its
 * item, and the line and column where xcube gives them, and give only a count
 * of the rest ("n items in folders you can't see would break"). A
 * Super-Admin sees every break named, and the audit trail records every one.
 */
const breaks = [
  {
    path: 'cubes/orders.yml',
    folderId: 'sales',
    message: 'unknown member orders.net',
    line: 34,
    column: 9,
  },
  { path: 'cubes/churn.yml', folderId: 'finance', message: 'cube sales not found' },
  // The root's: a break names its folder except there (CompileError, T452).
  { path: 'cubes/base.yml', message: 'bad indent', line: 3, column: 5 },
  { path: 'cubes/more.yml', folderId: 'finance', message: 'cube more broke' },
];

describe('a refused publish, as its user may see it (T427, AC-322)', () => {
  it('names each break in a folder they may see, and counts the rest', () => {
    const refusal = refusalOf(breaks, (folderId) => folderId !== 'finance');
    expect(refusal.answer).toEqual({
      errors: [breaks[0], breaks[2]],
      hidden: 2,
      error: '2 items in folders you can’t see would break.',
    });
  });

  it('says one hidden item as one', () => {
    expect(refusalOf(breaks.slice(0, 2), (folderId) => folderId === 'sales').answer).toEqual({
      errors: [breaks[0]],
      hidden: 1,
      error: '1 item in folders you can’t see would break.',
    });
  });

  it('names every break for one who sees every folder, a Super-Admin, and counts none', () => {
    // The 422 as it was before T427 when nothing is hidden: its errors alone.
    const answer = refusalOf(breaks, () => true).answer;
    expect(answer).toEqual({ errors: breaks });
    expect(Object.keys(answer)).toEqual(['errors']);
  });

  it('names nothing, and counts every break, when all are in folders they can’t see', () => {
    expect(refusalOf([breaks[1]!, breaks[3]!], () => false).answer).toEqual({
      errors: [],
      hidden: 2,
      error: '2 items in folders you can’t see would break.',
    });
  });

  it('asks about a break naming no folder as the root’s', () => {
    const asked: string[] = [];
    refusalOf([breaks[2]!], (folderId) => {
      asked.push(folderId);
      return false;
    });
    expect(asked).toEqual(['root']);
  });

  it('records every break, named or counted, and what its user was shown', () => {
    const refusal = refusalOf(breaks, (folderId) => folderId === 'sales');
    expect(refusal.recorded).toEqual({
      breaks: [
        {
          path: 'cubes/orders.yml',
          folderId: 'sales',
          message: 'unknown member orders.net',
          line: 34,
          column: 9,
        },
        { path: 'cubes/churn.yml', folderId: 'finance', message: 'cube sales not found' },
        { path: 'cubes/base.yml', folderId: 'root', message: 'bad indent', line: 3, column: 5 },
        { path: 'cubes/more.yml', folderId: 'finance', message: 'cube more broke' },
      ],
      shown: { named: 1, counted: 3 },
    });
    expect(refusal.summary).toBe('4 breaks: 1 named to its user, 3 counted');
  });
});
