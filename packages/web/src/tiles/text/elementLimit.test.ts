import { describe, expect, it } from 'vitest';

import { textDocumentFromMarkdown } from '@wechart/core';

import type { DashboardDocument, Element_ } from '../../dashboard/model/document';
import {
  ELEMENT_LIMIT_REASON,
  elementCountOf,
  insertRefusal,
  limitedGroups,
  pasteRefusal,
  whyTextUnsaveable,
} from './elementLimit';
import { insertGroups, type InsertSources } from './InsertMenu';

/**
 * Decision T875-1 (AC-512, AC-518): a markdown tile of more than 10 tokens
 * converts in full, and Save is held for it, "Remove ‹k› live values to
 * save", rather than refused by the API (T871).
 */
const tokens = (n: number) =>
  textDocumentFromMarkdown(Array.from({ length: n }, () => '{{measure:orders.count}}').join(' '));

const board = (...items: Element_[]): DashboardDocument => ({
  schemaVersion: 1,
  title: 'B',
  settings: { width: 'fixed' },
  pages: [
    {
      id: 'p1',
      title: 'P',
      items: [
        {
          id: 's',
          kind: 'section',
          title: 'S',
          items: [{ id: 'tg', kind: 'tabs', w: 12, tabs: [{ id: 't', title: 'T', items }] }],
        },
      ],
    },
  ],
});

describe('a Text tile over the element limit (decision T875-1)', () => {
  it('counts a tile’s elements', () => {
    expect(elementCountOf(tokens(12))).toBe(12);
    expect(elementCountOf(undefined)).toBe(0);
  });

  it('holds Save for a tile of 12 elements, anywhere on the dashboard, naming how many to remove', () => {
    const why = whyTextUnsaveable(
      board({ id: 'many', kind: 'text', w: 6, h: 20, document: tokens(12) }),
    );
    expect(why).toContain('12 elements');
    expect(why).toContain('Remove 2 live values to save');
  });

  it('holds nothing at 10', () => {
    expect(
      whyTextUnsaveable(board({ id: 'ten', kind: 'text', w: 6, h: 20, document: tokens(10) })),
    ).toBeUndefined();
  });

  it('says "1 live value" for one too many', () => {
    expect(
      whyTextUnsaveable(board({ id: 'eleven', kind: 'text', w: 6, h: 20, document: tokens(11) })),
    ).toContain('Remove 1 live value to save');
  });
});

/**
 * T883 / AC-518: THE SYSTEM SHALL hold at most 10 elements in a Text tile,
 * counting every live element, control and action button; WHILE a tile
 * holds 10, Insert and every row of the insert menu SHALL be disabled with
 * "This tile holds 10 elements, the most a Text tile can. Remove one, or add
 * another Text tile."; a paste … that would pass 10 SHALL be refused with
 * that reason.
 */
describe('a Text tile held to 10 elements in the editor (T883, AC-518)', () => {
  const REASON =
    'This tile holds 10 elements, the most a Text tile can. Remove one, or add another Text tile.';
  const SOURCES: InsertSources = {
    cubes: [
      {
        name: 'orders',
        title: 'Orders',
        measures: [{ name: 'orders.revenue', title: 'Revenue' }],
      },
    ],
    markings: [{ name: 'Picks' }],
    filters: [{ id: 'f1', name: 'Country' }],
  };

  it('counts a filter control and a button with the live values', () => {
    const document = textDocumentFromMarkdown('{{measure:orders.count}} {{measure:orders.count}}');
    const paragraph = document.doc.content?.[0];
    if (paragraph === undefined) throw new Error('No paragraph');
    const mixed = {
      ...document,
      doc: {
        ...document.doc,
        content: [
          {
            ...paragraph,
            content: [
              ...(paragraph.content ?? []),
              { type: 'filterControl', attrs: { filter: 'f1' } },
              { type: 'actionButton', attrs: { label: 'Go' } },
            ],
          },
        ],
      },
    };
    expect(elementCountOf(mixed)).toBe(4);
  });

  it('disables Insert at 10, with the reason, and not at 9', () => {
    expect(ELEMENT_LIMIT_REASON).toBe(REASON);
    expect(insertRefusal(10)).toBe(REASON);
    expect(insertRefusal(12)).toBe(REASON);
    expect(insertRefusal(9)).toBeUndefined();
  });

  it('disables every row of the menu at 10, with the reason, and none at 9', () => {
    for (const step of [
      { kind: 'search' } as const,
      { kind: 'source', element: 'marking' } as const,
      { kind: 'measure', measure: { name: 'orders.revenue', title: 'Revenue' } } as const,
    ]) {
      const groups = insertGroups('re', step, SOURCES, 'on');
      const rows = limitedGroups(groups, 10).flatMap((group) => group.rows);
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.map((row) => row.disabled)).toEqual(rows.map(() => REASON));
      expect(limitedGroups(groups, 9)).toBe(groups);
    }
  });

  it('refuses a paste of 2 elements into a tile of 9, and one that adds none past 10', () => {
    expect(pasteRefusal(9, 0, 2)).toBe(REASON);
    expect(pasteRefusal(9, 0, 1)).toBeUndefined();
    // Over a selection holding one: 9 − 1 + 2 = 10.
    expect(pasteRefusal(9, 1, 2)).toBeUndefined();
    // A converted tile of 12 may take a paste that adds none.
    expect(pasteRefusal(12, 0, 0)).toBeUndefined();
    expect(pasteRefusal(12, 2, 1)).toBeUndefined();
    expect(pasteRefusal(12, 0, 1)).toBe(REASON);
  });
});
