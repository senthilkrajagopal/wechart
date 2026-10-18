import { describe, expect, it } from 'vitest';

import {
  TEXT_DOCUMENT_VERSION,
  textDocumentProblems,
  type TextDocument,
  type TextMark,
  type TextNode,
} from './text-document';
import { textDocumentFromMarkdown } from './text-document-from-markdown';

/**
 * T869 / AC-512: WHEN a dashboard holding a markdown tile saved before R80 is
 * opened, THE SYSTEM SHALL show it as a Text tile that reads the same: its
 * headings, emphasis, lists, line breaks and links as AC-208 renders them;
 * its `{{…}}` tokens as the live elements they name (AC-116); and anything
 * else, an HTML tag included, as the literal text it was.
 * `Fails when: … a heading, list, emphasis or token reads differently, or an
 * HTML tag is dropped or rendered …`
 *
 * T869 / AC-116: … every `{{…}}` token of a markdown tile SHALL become the
 * element it names.
 *
 * The cases are `packages/web/src/tiles/Markdown.test.tsx`'s, every one:
 * what that tile drew, this document holds (T875 removes that tile and its
 * test, whose cases live on here).
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
const ul = (...items: TextNode[]): TextNode => ({ type: 'bulletList', content: items });
const ol = (start: number, ...items: TextNode[]): TextNode => ({
  type: 'orderedList',
  ...(start === 1 ? {} : { attrs: { start } }),
  content: items,
});
const br: TextNode = { type: 'hardBreak' };
const bold: TextMark = { type: 'bold' };
const italic: TextMark = { type: 'italic' };
const link = (href: string): TextMark => ({ type: 'link', attrs: { href } });

/** The conversion, checked against the schema every time it's used. */
const converted = (markdown: string) => {
  const result = textDocumentFromMarkdown(markdown);
  expect(textDocumentProblems(result)).toEqual([]);
  return result;
};

describe('a markdown tile’s text as a Text document (T869, AC-512)', () => {
  // The markdown tile placed each heading in the outline by its rank among
  // the tile's own levels, from h3 (T247). So a converted tile keeps those
  // places (the coordinator's call, T869-1): its shallowest level is Heading
  // large (h3), the next Heading medium (h4), and any deeper Heading small
  // (h5), the smallest there is. A lone `##` is h3 still.
  it('reads the tile’s shallowest heading as Heading large, and each deeper one a level down', () => {
    expect(converted('# Top')).toEqual(doc(h(1, text('Top'))));
    expect(converted('## Title')).toEqual(doc(h(1, text('Title'))));
    expect(converted('### Sub')).toEqual(doc(h(1, text('Sub'))));
    expect(converted('# A\n### B')).toEqual(doc(h(1, text('A')), h(2, text('B'))));
    expect(converted('## A\n### B\n# C\n#### D')).toEqual(
      doc(h(2, text('A')), h(3, text('B')), h(1, text('C')), h(3, text('D'))),
    );
  });

  // Markdown T870 wrote names each heading's style by its marks, as AC-516
  // types them: # large, ## medium, ### small.
  it('reads exported markdown’s #, ## and ### as Heading large, medium and small', () => {
    const exported = (markdown: string) => textDocumentFromMarkdown(markdown, { exported: true });
    expect(exported('## Title')).toEqual(doc(h(2, text('Title'))));
    expect(exported('### Sub\n# Top')).toEqual(doc(h(3, text('Sub')), h(1, text('Top'))));
  });

  // A code span isn't among the Text tile's marks (AC-208 amended, AC-515),
  // so it stays the literal text it was, backticks and all (AC-512).
  it('reads emphasis and strong as italic and bold, and a code span as its literal text', () => {
    expect(converted('a **b** and *c* or _d_ with `e`')).toEqual(
      doc(
        p(
          text('a '),
          text('b', bold),
          text(' and '),
          text('c', italic),
          text(' or '),
          text('d', italic),
          text(' with `e`'),
        ),
      ),
    );
  });

  it('keeps a single newline as a break, and a blank line as a new paragraph', () => {
    expect(converted('one\ntwo\n\nthree')).toEqual(
      doc(p(text('one'), br, text('two')), p(text('three'))),
    );
  });

  it('reads bulleted and numbered lists', () => {
    expect(converted('- a\n* b')).toEqual(doc(ul(li(text('a')), li(text('b')))));
    expect(converted('1. a\n2. b')).toEqual(doc(ol(1, li(text('a')), li(text('b')))));
  });

  it('keeps HTML as the text it is, never as markup', () => {
    expect(converted('<b>x</b> <script>alert(1)</script>')).toEqual(
      doc(p(text('<b>x</b> <script>alert(1)</script>'))),
    );
    expect(converted('<b>hi</b>')).toEqual(doc(p(text('<b>hi</b>'))));
    expect(converted('<img src=x onerror="alert(1)">')).toEqual(
      doc(p(text('<img src=x onerror="alert(1)">'))),
    );
  });

  it('leaves an unmatched marker as it is', () => {
    expect(converted('2 * 3 and **open')).toEqual(doc(p(text('2 * 3 and **open'))));
  });

  it('reads bold italic, and emphasis inside strong, with no marker left', () => {
    expect(converted('***both***')).toEqual(doc(p(text('both', bold, italic))));
    expect(converted('**a *b* c**')).toEqual(
      doc(p(text('a ', bold), text('b', bold, italic), text(' c', bold))),
    );
  });

  it('carries emphasis across a line break within a paragraph', () => {
    expect(converted('**bold\nmore**')).toEqual(doc(p(text('bold', bold), br, text('more', bold))));
  });

  it('leaves underscores inside a word alone, as in a member’s name', () => {
    expect(converted('order_line_items and created_at')).toEqual(
      doc(p(text('order_line_items and created_at'))),
    );
  });

  it('numbers a list from its first item', () => {
    expect(converted('3. c\n4. d')).toEqual(doc(ol(3, li(text('c')), li(text('d')))));
    expect(converted('0. zero')).toEqual(doc(ol(0, li(text('zero')))));
    expect(converted('12345678901234567890. big')).toEqual(
      doc(p(text('12345678901234567890. big'))),
    );
  });

  it('reads Windows line endings as lines', () => {
    expect(converted('## A\r\nb')).toEqual(doc(h(1, text('A')), p(text('b'))));
  });

  // T869's review: a markdown tile had no escapes, so its backslashes are
  // text, as it drew them (AC-512).
  it('keeps a markdown tile’s backslashes as the text they were', () => {
    for (const typed of [
      'C:\\Users stays',
      '\\\\server\\share',
      'C:\\Program Files\\(x86)',
      'match \\d+\\. here',
      '`a\\*b` in code',
    ])
      expect(converted(typed)).toEqual(doc(p(text(typed))));
  });

  // What T870 writes for typed markdown characters (decision T869-1): read
  // so only where asked, for markdown written through MCP (AC-527).
  it('exported, reads a backslash before punctuation as that character, never as a mark', () => {
    const escaped = (markdown: string) => {
      const result = textDocumentFromMarkdown(markdown, { exported: true });
      expect(textDocumentProblems(result)).toEqual([]);
      return result;
    };
    expect(escaped('\\*\\*not bold\\*\\* and \\{{measure:orders.revenue}}')).toEqual(
      doc(p(text('**not bold** and {{measure:orders.revenue}}'))),
    );
    expect(escaped('\\# not a heading\n\\- nor a list')).toEqual(
      doc(p(text('# not a heading'), br, text('- nor a list'))),
    );
    expect(escaped('C:\\Users stays')).toEqual(doc(p(text('C:\\Users stays'))));
    // A private-use character typed is kept as typed, in either reading.
    expect(escaped('icon \ue02a here')).toEqual(doc(p(text('icon \ue02a here'))));
    expect(converted('icon \ue02a here')).toEqual(doc(p(text('icon \ue02a here'))));
  });

  it('reads an empty text as an empty document', () => {
    expect(converted('')).toEqual(doc());
    expect(converted('\n  \n')).toEqual(doc());
  });

  // AC-512: links, which a Text tile has, checked as AC-513 checks them.
  it('reads a link to an http(s) address or a dashboard as a link, and any other as its text', () => {
    expect(converted('see [the vendor](https://x.example/a?b=1) now')).toEqual(
      doc(p(text('see '), text('the vendor', link('https://x.example/a?b=1')), text(' now'))),
    );
    expect(converted('**[Detail](/explore/dashboards/d-42)**')).toEqual(
      doc(p(text('Detail', bold, link('/explore/dashboards/d-42')))),
    );
    expect(converted('[a](javascript:alert(1))')).toEqual(doc(p(text('[a](javascript:alert(1))'))));
    expect(converted('[a](data:text/html,x)')).toEqual(doc(p(text('[a](data:text/html,x)'))));
    expect(converted('[a](javascript:alert)')).toEqual(doc(p(text('[a](javascript:alert)'))));
  });

  // T869's review: a refused link's words still read as the tile drew them.
  it('reads the emphasis and tokens in a refused link’s words, its brackets as text', () => {
    expect(converted('[**Write** {{measure:orders.count}}](mailto:ops@x.example)')).toEqual(
      doc(
        p(
          text('['),
          text('Write', bold),
          text(' '),
          { type: 'value', attrs: { measure: 'orders.count' } },
          text('](mailto:ops@x.example)'),
        ),
      ),
    );
  });
});

describe('a markdown tile’s tokens as elements (T869, AC-512, AC-116)', () => {
  it('reads a measure limited by a marking as a Value limited by it', () => {
    expect(converted('{{measure:orders.revenue | marking:Marking}}')).toEqual(
      doc(p({ type: 'value', attrs: { measure: 'orders.revenue', marking: 'Marking' } })),
    );
  });

  it('reads design 21 state I’s tile as its heading and two Values', () => {
    expect(
      converted(
        '## Marked share\n{{measure:orders.revenue | marking:Marking}} of {{measure:orders.revenue}}',
      ),
    ).toEqual(
      doc(
        h(1, text('Marked share')),
        p(
          { type: 'value', attrs: { measure: 'orders.revenue', marking: 'Marking' } },
          text(' of '),
          { type: 'value', attrs: { measure: 'orders.revenue' } },
        ),
      ),
    );
  });

  it('reads a marking’s count and summary as Marking elements', () => {
    expect(converted('{{marking:Status picks.count}}, {{marking:Status picks.summary}}')).toEqual(
      doc(
        p({ type: 'marking', attrs: { marking: 'Status picks', show: 'count' } }, text(', '), {
          type: 'marking',
          attrs: { marking: 'Status picks', show: 'summary' },
        }),
      ),
    );
  });

  it('reads each token in place, in a heading, a list, emphasis or a paragraph', () => {
    expect(
      converted('## {{marking:A.count}} marked\n\n- **{{measure:orders.count}}** in all'),
    ).toEqual(
      doc(
        h(1, { type: 'marking', attrs: { marking: 'A', show: 'count' } }, text(' marked')),
        ul(
          li({ type: 'value', attrs: { measure: 'orders.count' }, marks: [bold] }, text(' in all')),
        ),
      ),
    );
  });

  it('keeps a token whole when its marking’s name holds an emphasis mark', () => {
    expect(converted('{{marking:Q3 *core* picks.count}} and *more*')).toEqual(
      doc(
        p(
          { type: 'marking', attrs: { marking: 'Q3 *core* picks', show: 'count' } },
          text(' and '),
          text('more', italic),
        ),
      ),
    );
  });

  it('leaves a token in a code span as its literal text', () => {
    expect(converted('`{{measure:orders.count}}`')).toEqual(
      doc(p(text('`{{measure:orders.count}}`'))),
    );
  });

  it('leaves braces that name no element as text', () => {
    expect(converted('{{name}} and {{measure:revenue}}')).toEqual(
      doc(p(text('{{name}} and {{measure:revenue}}'))),
    );
  });

  // T869's review: a token in place, the link's words either side linked.
  it('keeps a token in a link’s words in its place, out of the link', () => {
    expect(converted('[see {{measure:orders.count}} now](https://x.example)')).toEqual(
      doc(
        p(
          text('see ', link('https://x.example')),
          { type: 'value', attrs: { measure: 'orders.count' } },
          text(' now', link('https://x.example')),
        ),
      ),
    );
  });

  // T869's review: a token in an address is a live value, as the tile drew
  // it, never text inside an href.
  it('reads a token in a link’s address as a value, and the rest as text', () => {
    expect(converted('[a](https://x.example/{{measure:orders.count}})')).toEqual(
      doc(
        p(
          text('[a](https://x.example/'),
          { type: 'value', attrs: { measure: 'orders.count' } },
          text(')'),
        ),
      ),
    );
  });

  it('keeps an element out of a link, as the schema does', () => {
    expect(converted('[{{measure:orders.count}} orders](https://x.example)')).toEqual(
      doc(
        p(
          { type: 'value', attrs: { measure: 'orders.count' } },
          text(' orders', link('https://x.example')),
        ),
      ),
    );
  });
});
