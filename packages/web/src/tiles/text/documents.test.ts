import { describe, expect, it } from 'vitest';

import { textDocumentProblems, type TextDocument } from '@wechart/core';

import { withElementSettings } from './documents';

/**
 * T884 / AC-520: an element's settings changed in Properties while its text
 * isn't being edited reach the stored document: the element at that place
 * in text order, and nothing else.
 */
const DOC: TextDocument = {
  version: 1,
  doc: {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          { type: 'value', attrs: { measure: 'orders.revenue', marking: 'Picks' } },
          { type: 'text', text: ' and ' },
        ],
      },
      {
        type: 'bulletList',
        content: [
          {
            type: 'listItem',
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'change', attrs: { measure: 'orders.revenue' } }],
              },
            ],
          },
        ],
      },
    ],
  },
};

describe('an element’s settings, set in the stored document (T884)', () => {
  it('sets the element at its place in text order, wherever it sits', () => {
    const next = withElementSettings(DOC, 1, { period: 'quarter', show: 'amount' });
    expect(next.doc.content?.[1]?.content?.[0]?.content?.[0]?.content?.[0]).toEqual({
      type: 'change',
      attrs: { measure: 'orders.revenue', period: 'quarter', show: 'amount' },
    });
    expect(next.doc.content?.[0]).toBe(DOC.doc.content?.[0]);
    expect(textDocumentProblems(next)).toEqual([]);
  });

  it('takes a setting away by null', () => {
    const next = withElementSettings(DOC, 0, { marking: null, whenUnmarked: null });
    expect(next.doc.content?.[0]?.content?.[0]).toEqual({
      type: 'value',
      attrs: { measure: 'orders.revenue' },
    });
  });

  it('leaves the document as it is for a place no element has', () => {
    expect(withElementSettings(DOC, 5, { period: 'year' })).toBe(DOC);
  });
});
