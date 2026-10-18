import { describe, expect, it } from 'vitest';

import { textDocumentFromMarkdown } from '@wechart/core';

import type { DashboardDocument, Element_ } from '../../dashboard/model/document';
import { elementCountOf, whyTextUnsaveable } from './elementLimit';

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
