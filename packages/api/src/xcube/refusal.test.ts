import { describe, expect, it } from 'vitest';

import { itemMessageOf, refusalOf } from './refusal';

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

/**
 * T701 (AC-421, AC-424): xcube `256d632371` refuses an item whose name another
 * holds, in any case, as an error of kind `name_in_use` placed on the
 * caller's own item (research `xcube-256d632371.md`, "The error kinds"). Its
 * user is told only that the name is in use: no folder id, path, workspace or
 * title of anything, the caller's own folders' ids included.
 */
describe('xcube’s name-in-use refusal of an item, as its user is told it (T701)', () => {
  const inUse = (name: string, message: string) => ({
    folderId: 'fsales',
    name,
    kind: 'name_in_use',
    message,
  });

  it('says only that the name is in use, however xcube words it', () => {
    for (const [error, said] of [
      [
        inUse('Orders', 'The name "Orders" is already in use'),
        'The name “Orders” is already in use.',
      ],
      [
        inUse(
          'Orders',
          'The name "Orders" is in use as "orders": a landed name can\'t change, not even its case',
        ),
        'The name “Orders” is already in use.',
      ],
      [
        inUse(
          'Stock',
          'The changeset holds two items named "Stock" (in fsales and fops); names are one per model',
        ),
        'The name “Stock” is already in use.',
      ],
      [
        inUse('overview', 'Its split view "overview_orders" would take a name already in use'),
        'Its split view “overview_orders” would take a name already in use.',
      ],
    ] as const) {
      expect(itemMessageOf(error), error.message).toBe(said);
      expect(itemMessageOf(error), error.message).not.toMatch(/fsales|fops|froot/);
    }
  });

  it('leaves the other kinds in xcube’s words: they name the caller’s item and what it refers to, never a folder', () => {
    for (const message of [
      'It uses the data source "lake", which isn\'t in its folder or one of its ancestors',
      'It refers to "customers", which isn\'t in its folder or one of its ancestors',
      'unknown member orders.net',
    ])
      expect(itemMessageOf({ name: 'orders', kind: 'reference_range', message })).toBe(message);
  });

  /**
   * T713 (AC-425, AC-322): a reference refusal is on the referring item, so
   * it is named where its user sees the referrer's folder and counted where
   * not; what it refers to is named by its name alone, never by its folder.
   */
  it('names a reference refusal on the referrer where its folder is seen, and counts the rest', () => {
    const offPath = (name: string) =>
      itemMessageOf({
        name: 'lines',
        kind: 'reference_range',
        message: `It refers to "${name}", which isn't in its folder or one of its ancestors`,
      });
    const refusal = refusalOf(
      [
        { path: 'cubes/lines.yml', folderId: 'east', message: offPath('side') },
        { path: 'cubes/other.yml', folderId: 'hidden', message: offPath('base') },
      ],
      (folderId) => folderId === 'east',
    );
    expect(refusal.answer).toEqual({
      errors: [
        {
          path: 'cubes/lines.yml',
          folderId: 'east',
          message: `It refers to "side", which isn't in its folder or one of its ancestors`,
        },
      ],
      hidden: 1,
      error: '1 item in folders you can’t see would break.',
    });
    expect(refusal.recorded.shown).toEqual({ named: 1, counted: 1 });
  });
});
