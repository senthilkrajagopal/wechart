import { describe, expect, it } from 'vitest';

import { textDocumentFromMarkdown } from '@wechart/core';

import { tileChangesOf } from './tileChanges';

/**
 * T356 (AC-341; design 05, pin 4; R33 proposal 4): each tile a proposed
 * dashboard changes or adds against the folder's current version, by tile.
 * A tile's chart is set against the chart it shows there, whatever its id:
 * a copy's charts have ids of their own.
 */
const chart = (title: string, measures: string[]) => ({
  schemaVersion: 1,
  title,
  chart: { source: { cube: 'orders' }, wells: { measures } },
});

const board = (items: unknown[]) => ({
  schemaVersion: 1,
  title: 'Board',
  pages: [{ id: 'p1', items }],
});

const current = {
  body: board([
    { id: 't1', kind: 'chart', chartId: 'c1', layout: { w: 6 } },
    { id: 't2', kind: 'chart', chartId: 'c2', layout: { w: 6 } },
    { id: 't3', kind: 'markdown', text: 'Notes' },
    {
      id: 's1',
      kind: 'section',
      items: [{ id: 't4', kind: 'markdown', text: 'Inside' }],
    },
  ]),
  charts: {
    c1: { ...chart('Revenue', ['orders.total']), folderId: 'f1' },
    c2: { ...chart('Orders', ['orders.count']), localToDashboardId: 'd1', owner: 'ada' },
  },
};

describe('which tiles a proposal changes or adds (T356, AC-341)', () => {
  it('marks nothing when the proposal holds the dashboard as it is, whatever its charts’ ids', () => {
    const proposed = {
      body: board([
        { id: 't1', kind: 'chart', chartId: 'w1', layout: { w: 6 } },
        { id: 't2', kind: 'chart', chartId: 'w2', layout: { w: 6 } },
        { id: 't3', kind: 'markdown', text: 'Notes' },
        { id: 's1', kind: 'section', items: [{ id: 't4', kind: 'markdown', text: 'Inside' }] },
      ]),
      charts: {
        // The workspace's copies, placed elsewhere but the same charts.
        w1: { ...chart('Revenue', ['orders.total']), folderId: 'ws:ada', origin: { id: 'c1' } },
        w2: { ...chart('Orders', ['orders.count']), localToDashboardId: 'wd1', owner: 'wren' },
      },
    };
    expect(tileChangesOf(proposed, current)).toEqual({});
  });

  it('marks a tile moved or restyled, a chart changed, and a tile added, even inside a section', () => {
    const proposed = {
      body: board([
        { id: 't1', kind: 'chart', chartId: 'w1', layout: { w: 12 } },
        { id: 't2', kind: 'chart', chartId: 'w2', layout: { w: 6 } },
        { id: 't3', kind: 'markdown', text: 'Notes' },
        {
          id: 's1',
          kind: 'section',
          items: [
            { id: 't4', kind: 'markdown', text: 'Inside' },
            { id: 't5', kind: 'markdown', text: 'New inside' },
          ],
        },
      ]),
      charts: {
        w1: chart('Revenue', ['orders.total']),
        w2: chart('Orders', ['orders.count', 'orders.total']),
      },
    };
    expect(tileChangesOf(proposed, current)).toEqual({
      t1: 'changed',
      t2: 'changed',
      t5: 'new',
    });
  });

  // T875's review: a draft saved through the editor holds its markdown tiles
  // as the Text tiles they convert to; the folder's version still holds
  // markdown. That is no change.
  it('marks a markdown tile saved as its converted Text tile unchanged, and a changed one changed', () => {
    const proposed = {
      body: board([
        { id: 't1', kind: 'chart', chartId: 'w1', layout: { w: 6 } },
        { id: 't2', kind: 'chart', chartId: 'w2', layout: { w: 6 } },
        { id: 't3', kind: 'text', document: textDocumentFromMarkdown('Notes') },
        {
          id: 's1',
          kind: 'section',
          items: [{ id: 't4', kind: 'text', document: textDocumentFromMarkdown('Edited') }],
        },
      ]),
      charts: {
        w1: { ...chart('Revenue', ['orders.total']), folderId: 'ws:ada', origin: { id: 'c1' } },
        w2: { ...chart('Orders', ['orders.count']), localToDashboardId: 'wd1', owner: 'wren' },
      },
    };
    expect(tileChangesOf(proposed, current)).toEqual({ t4: 'changed' });
  });

  it('marks every tile new when there is no current version', () => {
    const proposed = { body: board([{ id: 't9', kind: 'markdown', text: 'Hi' }]), charts: {} };
    expect(tileChangesOf(proposed, undefined)).toEqual({ t9: 'new' });
  });
});
