import { describe, expect, it } from 'vitest';

import {
  TEXT_DOCUMENT_VERSION,
  textDocumentProblems,
  type TextDocument,
  type TextMark,
  type TextNode,
} from './text-document';
import { textDocumentFromMarkdown } from './text-document-from-markdown';
import { textDocumentToMarkdown } from './text-document-to-markdown';

/**
 * T870 / AC-527: WHEN an MCP client reads a dashboard (AC-437), THE SYSTEM
 * SHALL return each Text tile's content as markdown, each element as a
 * `{{…}}` token naming its kind and source …; and WHEN an MCP client writes a
 * dashboard with a Text tile given as markdown, THE SYSTEM SHALL store it
 * converted as AC-512 converts.
 * `Fails when: … an element is missing from the markdown or its token names
 * no kind or source, or markdown written back reads differently …`
 */

const doc = (...content: TextNode[]): TextDocument => ({
  version: TEXT_DOCUMENT_VERSION,
  doc: { type: 'doc', content },
});
const text = (value: string, ...marks: TextMark[]): TextNode => ({
  type: 'text',
  text: value,
  ...(marks.length === 0 ? {} : { marks }),
});
const p = (...content: TextNode[]): TextNode => ({ type: 'paragraph', content });
const h = (level: 1 | 2 | 3, ...content: TextNode[]): TextNode => ({
  type: 'heading',
  attrs: { level },
  content,
});
const li = (...content: TextNode[]): TextNode => ({ type: 'listItem', content: [p(...content)] });
const br: TextNode = { type: 'hardBreak' };
const bold: TextMark = { type: 'bold' };
const italic: TextMark = { type: 'italic' };
const link = (href: string): TextMark => ({ type: 'link', attrs: { href } });
const el = (type: string, attrs: Record<string, unknown>, ...marks: TextMark[]): TextNode => ({
  type,
  attrs,
  ...(marks.length === 0 ? {} : { marks }),
});

const value = el('value', { measure: 'orders.revenue' });
const limited = el('value', { measure: 'orders.revenue', marking: 'Marking' });
const markingCount = el('marking', { marking: 'Status picks', show: 'count' });
const markingSummary = el('marking', { marking: 'Status picks', show: 'summary' });

/** A document of every block, mark and element kind. */
const everything = doc(
  h(1, text('Revenue '), text('overview', italic)),
  h(2, text('This quarter')),
  h(3, text('Notes')),
  { type: 'largeValue', content: [value] },
  p(
    text('Revenue is '),
    el('change', {
      measure: 'orders.revenue',
      compare: 'previous_period',
      period: 'quarter',
      direction: 'higher',
    }),
    text(' on last quarter, '),
    el('sparkline', { measure: 'orders.revenue', time: 'orders.ordered_at', granularity: 'month' }),
    text(' and '),
    el('icon', { measure: 'orders.revenue', of: 'orders.revenue_target' }),
    text(' against plan.'),
    br,
    text('Margin sits at '),
    el('bulletGraph', { measure: 'orders.margin' }),
    text(', as of '),
    el('asOf', { measure: 'orders.revenue' }),
    text('.'),
  ),
  p(text('Showing '), el('filterValue', { filter: 'country' }), text(' for '), limited),
  {
    type: 'bulletList',
    content: [li(text('bold', bold), text(' and '), markingCount), li(text('plain'))],
  },
  {
    type: 'orderedList',
    attrs: { start: 3 },
    content: [li(text('third')), li(text('see '), text('the vendor', link('https://x.example')))],
  },
  p(
    el('filterControl', { filter: 'country' }),
    el('parameterControl', { parameter: 'metric' }),
    el('actionButton', { label: 'Go to Detail', actions: [{ kind: 'page', page: 'detail' }] }),
  ),
);

/** The markdown kinds' text and elements, as T869 reads them back. */
const roundTrip = (document: TextDocument) =>
  textDocumentFromMarkdown(textDocumentToMarkdown(document), { escapes: true });

describe('a Text document written as markdown (T870, AC-527)', () => {
  it('writes every block, mark and element, each element as a token naming its kind and source', () => {
    // Every kind at once is more than one tile may hold; otherwise it's a
    // valid document.
    expect(textDocumentProblems(everything)).toEqual([
      'The text holds 12 elements; a Text tile holds at most 10.',
    ]);
    expect(textDocumentToMarkdown(everything)).toBe(
      [
        '# Revenue *overview*',
        '',
        '## This quarter',
        '',
        '### Notes',
        '',
        '{{measure:orders.revenue}}',
        '',
        'Revenue is {{change:orders.revenue | vs:previous_period}} on last quarter, {{sparkline:orders.revenue}} and {{icon:orders.revenue}} against plan.',
        'Margin sits at {{bullet-graph:orders.margin}}, as of {{as-of:orders.revenue}}.',
        '',
        'Showing {{filter-value:country}} for {{measure:orders.revenue | marking:Marking}}',
        '',
        '- **bold** and {{marking:Status picks.count}}',
        '- plain',
        '',
        '3. third',
        '4. see [the vendor](https://x.example)',
        '',
        '{{filter-control:country}}{{parameter-control:metric}}{{button:Go to Detail}}',
      ].join('\n'),
    );
  });

  it('reads back as the same text and the same elements for the kinds markdown tiles had', () => {
    const back = roundTrip(
      doc(
        h(2, text('Marked share')),
        p(limited, text(' of '), value),
        p(text('Picked '), markingCount, text(': '), markingSummary),
        p(text('a '), text('b', bold), text(' and '), text('c', italic), br, text('next line')),
        {
          type: 'bulletList',
          content: [li(el('value', { measure: 'orders.count' }, bold), text(' in all'))],
        },
        {
          type: 'orderedList',
          attrs: { start: 3 },
          content: [li(text('c')), li(text('d'))],
        },
        p(text('to '), text('Detail', bold, link('/explore/dashboards/d-42'))),
      ),
    );
    expect(back).toEqual(
      doc(
        h(2, text('Marked share')),
        p(limited, text(' of '), value),
        p(text('Picked '), markingCount, text(': '), markingSummary),
        p(text('a '), text('b', bold), text(' and '), text('c', italic), br, text('next line')),
        {
          type: 'bulletList',
          content: [li(el('value', { measure: 'orders.count' }, bold), text(' in all'))],
        },
        {
          type: 'orderedList',
          attrs: { start: 3 },
          content: [li(text('c')), li(text('d'))],
        },
        p(text('to '), text('Detail', bold, link('/explore/dashboards/d-42'))),
      ),
    );
  });

  it('keeps every element in the markdown, and its kind and source when read back as text', () => {
    const markdown = textDocumentToMarkdown(everything);
    for (const token of [
      '{{change:orders.revenue | vs:previous_period}}',
      '{{sparkline:orders.revenue}}',
      '{{icon:orders.revenue}}',
      '{{bullet-graph:orders.margin}}',
      '{{as-of:orders.revenue}}',
      '{{filter-value:country}}',
      '{{filter-control:country}}',
      '{{parameter-control:metric}}',
      '{{button:Go to Detail}}',
    ])
      expect(markdown).toContain(token);
  });

  // Text a reader typed stays that text: what would read as markdown is
  // escaped, and read back without its backslashes.
  it('escapes text that would otherwise read as markdown, and reads it back as typed', () => {
    const typed = doc(
      p(text('2 * 3 is not **bold**, _this_ isn’t italic, `code` and [a](https://x.example)')),
      p(text('{{measure:orders.revenue}} typed as text, and a \\ backslash')),
      p(text('# not a heading')),
      p(text('- not a list')),
      p(text('1. not numbered')),
      p(text('order_line_items stays as it is')),
    );
    const markdown = textDocumentToMarkdown(typed);
    expect(markdown).toContain('order_line_items stays as it is');
    expect(roundTrip(typed)).toEqual(typed);
  });

  it('keeps spaces outside emphasis markers, so bold and italic edges read back', () => {
    const spaced = doc(
      p(text('a'), text(' bold ', bold), text('b'), text(' it ', italic), text('c')),
    );
    expect(textDocumentToMarkdown(spaced)).toBe('a **bold** b *it* c');
    expect(roundTrip(spaced)).toEqual(
      doc(p(text('a '), text('bold', bold), text(' b '), text('it', italic), text(' c'))),
    );
  });

  it('writes nested bold and italic so they read back nested', () => {
    const nested = doc(p(text('a ', bold), text('b', bold, italic), text(' c', bold)));
    expect(roundTrip(nested)).toEqual(nested);
    const both = doc(p(text('both', bold, italic)));
    expect(roundTrip(both)).toEqual(both);
  });

  it('writes an empty document as no text', () => {
    expect(textDocumentToMarkdown(doc())).toBe('');
  });
});
