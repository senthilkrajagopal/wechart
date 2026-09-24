import { describe, expect, it } from 'vitest';

import type { DashboardDocument } from '../model/document';
import {
  chartTileMarkings,
  deleteMarking,
  makeDefault,
  markingNameProblem,
  setTileLimit,
  setTileMarking,
  usageOf,
} from './markingsDraft';

/**
 * T218 / AC-198: … list the dashboard's markings with … how many tiles mark
 * with or are limited by it, let the user … delete … and show a table of every
 * chart tile with the marking it marks with and the markings that limit it.
 *
 * The draft changes behind Settings › Markings, as functions of the document.
 */
const doc = {
  schemaVersion: 1,
  title: 'D',
  settings: { width: 'fixed' },
  markings: [
    { id: 'm1', name: 'Marking', slot: 'mk1', isDefault: true },
    { id: 'm2', name: 'Region', slot: 'mk2', isDefault: false },
  ],
  pages: [
    {
      id: 'p',
      title: 'P',
      items: [
        { id: 'follows', kind: 'chart', w: 6, h: 40, chartId: 'c1' },
        { id: 'region', kind: 'chart', w: 6, h: 40, chartId: 'c2', marksWith: 'm2' },
        {
          id: 'tabs',
          kind: 'tabs',
          tabs: [
            {
              id: 't',
              title: 'T',
              items: [
                {
                  id: 'details',
                  kind: 'chart',
                  w: 12,
                  h: 40,
                  chartId: 'c3',
                  marksWith: '',
                  limitedBy: ['m1', 'm2'],
                },
              ],
            },
          ],
        },
        { id: 'note', kind: 'markdown', w: 6, h: 10, text: 'x' },
      ],
    },
  ],
} as unknown as DashboardDocument;

describe('Settings › Markings (AC-198)', () => {
  it('lists every chart tile, inside tab groups too, with what it marks with and what limits it', () => {
    expect(chartTileMarkings(doc)).toEqual([
      { tileId: 'follows', chartId: 'c1', marksWith: 'm1', limitedBy: [] },
      { tileId: 'region', chartId: 'c2', marksWith: 'm2', limitedBy: [] },
      { tileId: 'details', chartId: 'c3', marksWith: '', limitedBy: ['m1', 'm2'] },
    ]);
  });

  it('counts the tiles that mark with each marking — the default’s followers included — and those it limits', () => {
    expect(usageOf(doc)).toEqual(
      new Map([
        ['m1', { usedBy: 1, limits: 1 }],
        ['m2', { usedBy: 1, limits: 1 }],
      ]),
    );
  });

  it('deleting a marking sets its tiles to none and takes it out of every limit', () => {
    const next = deleteMarking(doc, 'm2');
    expect(next.markings?.map((marking) => marking.id)).toEqual(['m1']);
    expect(chartTileMarkings(next)).toEqual([
      { tileId: 'follows', chartId: 'c1', marksWith: 'm1', limitedBy: [] },
      { tileId: 'region', chartId: 'c2', marksWith: '', limitedBy: [] },
      { tileId: 'details', chartId: 'c3', marksWith: '', limitedBy: ['m1'] },
    ]);
  });

  it('deleting the default moves it, and the tiles that followed it follow the new one', () => {
    const next = deleteMarking(doc, 'm1');
    expect(next.markings).toEqual([{ id: 'm2', name: 'Region', slot: 'mk2', isDefault: true }]);
    expect(chartTileMarkings(next)[0]?.marksWith).toBe('m2');
  });

  it('never deletes the last marking', () => {
    const one = deleteMarking(doc, 'm2');
    expect(deleteMarking(one, 'm1')).toBe(one);
  });

  it('a tile set to mark with a marking stops being limited by it', () => {
    const next = setTileMarking(doc, 'details', 'm2');
    expect(chartTileMarkings(next)[2]).toMatchObject({ marksWith: 'm2', limitedBy: ['m1'] });
  });

  it('limits a tile by a marking, and lifts it, keeping the marking order', () => {
    const lifted = setTileLimit(doc, 'details', 'm1', false);
    expect(chartTileMarkings(lifted)[2]?.limitedBy).toEqual(['m2']);
    const back = setTileLimit(lifted, 'details', 'm1', true);
    expect(chartTileMarkings(back)[2]?.limitedBy).toEqual(['m1', 'm2']);
    // Never by the marking it marks with.
    expect(setTileLimit(doc, 'region', 'm2', true)).toBe(doc);
  });

  it('making a marking the default lifts it from the limits of the tiles that now follow it', () => {
    // "follows" marks with the default; limited by m2, it would be stuck
    // limited by its own marking once m2 is the default (T218's review).
    const limited = setTileLimit(doc, 'follows', 'm2', true);
    const next = makeDefault(limited, 'm2');
    expect(next.markings?.find((marking) => marking.isDefault)?.id).toBe('m2');
    expect(chartTileMarkings(next)[0]).toMatchObject({ marksWith: 'm2', limitedBy: [] });
  });

  it('says what is wrong with the markings’ names, or nothing', () => {
    expect(markingNameProblem(doc)).toBe(undefined);
    const blank = { ...doc, markings: [{ ...doc.markings![0]!, name: '  ' }, doc.markings![1]!] };
    expect(markingNameProblem(blank)).toBe('Each marking needs a name of its own.');
    const twice = {
      ...doc,
      markings: [doc.markings![0]!, { ...doc.markings![1]!, name: 'marking ' }],
    };
    expect(markingNameProblem(twice)).toBe('Each marking needs a name of its own.');
  });
});
