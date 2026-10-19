import { describe, expect, it } from 'vitest';

import {
  elementsOf,
  TEXT_DOCUMENT_VERSION,
  TEXT_ELEMENT_LIMIT,
  textDocumentMembers,
  textDocumentProblems,
  textDocumentRenamed,
  textLinkProblem,
  type TextDocument,
  type TextNode,
} from './text-document';

/**
 * T868 / AC-513: IF a Text tile's document holds HTML, a script, an
 * event-handler attribute, a node, mark or attribute outside the Text tile's
 * schema, or a link whose address is neither an http(s) URL nor a wechart
 * dashboard, THEN THE SYSTEM SHALL keep and render only what the schema
 * allows … and refuse with 400, naming the tile, a save whose document fails
 * the schema.
 * `Fails when: a document holding any of these is accepted …`
 *
 * T868 / AC-518: THE SYSTEM SHALL hold at most 10 elements in a Text tile,
 * counting every live element, control and action button.
 * `Fails when: … an 11th element is accepted …`
 *
 * This is the schema both checks stand on: wechart's own, versioned, and
 * checked here rather than by any Tiptap class (research
 * `rich-tiles-and-combo-tech.md` §1, Storage, and Gotchas: stray attributes).
 */

const text = (value: string, marks?: TextNode['marks']): TextNode => ({
  type: 'text',
  text: value,
  ...(marks === undefined ? {} : { marks }),
});
const paragraph = (...content: TextNode[]): TextNode => ({ type: 'paragraph', content });
const docOf = (...content: TextNode[]): TextDocument => ({
  version: TEXT_DOCUMENT_VERSION,
  doc: { type: 'doc', content },
});
const value = (measure = 'orders.revenue'): TextNode => ({ type: 'value', attrs: { measure } });

/** One element of each kind, every kind the design lists (design 21, rule 130; AC-517). */
const oneOfEach: TextNode[] = [
  {
    type: 'value',
    attrs: {
      measure: 'orders.revenue',
      marking: 'Marking',
      whenUnmarked: 'none',
      filters: [{ member: 'orders.country', operator: 'equals', values: ['Germany'] }],
    },
  },
  {
    type: 'change',
    attrs: {
      measure: 'orders.revenue',
      compare: 'previous_period',
      period: 'quarter',
      show: 'percent',
      direction: 'higher',
    },
  },
  {
    type: 'sparkline',
    attrs: {
      measure: 'orders.revenue',
      time: 'orders.ordered_at',
      granularity: 'month',
      last: 12,
      lastPoint: true,
    },
  },
  {
    type: 'icon',
    attrs: {
      measure: 'orders.revenue',
      of: 'orders.revenue_target',
      rules: [
        { op: '>=', value: 1, state: 'success', label: 'On track' },
        { op: '>=', value: 0.9, state: 'warning', label: 'Watch' },
        { op: 'otherwise', state: 'error', label: 'Behind' },
      ],
    },
  },
  {
    type: 'bulletGraph',
    attrs: {
      measure: 'orders.margin',
      target: { kind: 'fixed', value: 0.25 },
      ranges: [0.15, 0.2, 0.25],
      min: 0,
    },
  },
  { type: 'marking', attrs: { marking: 'Marking', show: 'count' } },
  { type: 'filterValue', attrs: { filter: 'f-country' } },
  { type: 'asOf', attrs: { measure: 'orders.revenue' } },
  { type: 'filterControl', attrs: { filter: 'f-country' } },
  { type: 'parameterControl', attrs: { parameter: 'p-metric' } },
  {
    type: 'actionButton',
    attrs: {
      label: 'Go to Detail',
      style: 'primary',
      actions: [
        { kind: 'resetFilters' },
        { kind: 'page', page: 'detail' },
        { kind: 'bookmark', bookmark: 'b-q3' },
        { kind: 'export', tiles: ['t1', 't2'] },
      ],
    },
  },
];

/** Everything the schema allows, once: AC-208's blocks and marks, and every element kind. */
const everything = (elements: TextNode[]): TextDocument =>
  docOf(
    { type: 'paragraph', content: [text('EMEA, '), text('this quarter', [{ type: 'bold' }])] },
    { type: 'heading', attrs: { level: 1 }, content: [text('Large')] },
    { type: 'heading', attrs: { level: 2 }, content: [text('Medium')] },
    { type: 'heading', attrs: { level: 3 }, content: [text('Small')] },
    { type: 'largeValue', content: [value()] },
    paragraph(
      text('a', [{ type: 'italic' }]),
      { type: 'hardBreak' },
      text('vendor', [{ type: 'link', attrs: { href: 'https://example.com/a?b=1#c' } }]),
      text(' and '),
      text('detail', [{ type: 'link', attrs: { href: '/explore/dashboards/d-42' } }]),
    ),
    {
      type: 'bulletList',
      content: [{ type: 'listItem', content: [paragraph(text('one'))] }],
    },
    {
      type: 'orderedList',
      attrs: { start: 3 },
      content: [
        {
          type: 'listItem',
          content: [
            paragraph(text('three')),
            { type: 'bulletList', content: [{ type: 'listItem', content: [paragraph()] }] },
          ],
        },
      ],
    },
    paragraph(...elements),
  );

describe('a Text tile’s stored document (T868, AC-513, AC-518)', () => {
  it('accepts paragraphs, three heading levels, a Large value, bold, italic, both lists, links and one element of each kind', () => {
    // Nine kinds beside the Large value's Value, so the limit isn't what's
    // tested here; the other two kinds in a document of their own.
    expect(textDocumentProblems(everything(oneOfEach.slice(0, 9)))).toEqual([]);
    expect(textDocumentProblems(docOf(paragraph(...oneOfEach.slice(9))))).toEqual([]);
  });

  it('accepts an empty document, and an element with marks around it', () => {
    expect(textDocumentProblems(docOf())).toEqual([]);
    expect(textDocumentProblems(docOf(paragraph()))).toEqual([]);
    expect(
      textDocumentProblems(
        docOf(paragraph({ ...value(), marks: [{ type: 'bold' }, { type: 'italic' }] })),
      ),
    ).toEqual([]);
  });

  it('refuses what isn’t a document of this version', () => {
    for (const notOne of [null, 'text', [], {}, { version: 1 }, { doc: { type: 'doc' } }])
      expect(textDocumentProblems(notOne)).toEqual([
        'A Text document must be an object with its version and doc.',
      ]);
    expect(textDocumentProblems({ version: 99, doc: { type: 'doc', content: [] } })).toEqual([
      'Unknown Text document version 99.',
    ]);
    expect(
      textDocumentProblems({ version: TEXT_DOCUMENT_VERSION, doc: { type: 'paragraph' } }),
    ).toEqual(['The document must start with "doc", not "paragraph".']);
  });

  it('refuses an unknown node, naming it', () => {
    expect(
      textDocumentProblems(
        docOf(paragraph({ type: 'image', attrs: { src: 'x', onerror: 'alert(1)' } })),
      ),
    ).toEqual(['Unknown node "image".']);
    expect(textDocumentProblems(docOf({ type: 'script', content: [text('x')] }))).toEqual([
      'Unknown node "script".',
    ]);
  });

  it('refuses an unknown mark, naming it', () => {
    expect(textDocumentProblems(docOf(paragraph(text('x', [{ type: 'underline' }]))))).toEqual([
      'Unknown mark "underline".',
    ]);
    expect(
      textDocumentProblems(
        docOf(paragraph(text('x', [{ type: 'textStyle', attrs: { color: 'red' } }]))),
      ),
    ).toEqual(['Unknown mark "textStyle".']);
  });

  it('refuses an attribute the schema doesn’t declare, naming it and its node', () => {
    expect(
      textDocumentProblems(docOf({ type: 'paragraph', attrs: { onclick: 'alert(1)' } })),
    ).toEqual(['A paragraph has no attribute "onclick".']);
    expect(
      textDocumentProblems(
        docOf({ type: 'heading', attrs: { level: 2, style: 'color:red' }, content: [] }),
      ),
    ).toEqual(['A heading has no attribute "style".']);
    expect(
      textDocumentProblems(
        docOf(paragraph({ type: 'value', attrs: { measure: 'orders.revenue', class: 'x' } })),
      ),
    ).toEqual(['A value has no attribute "class".']);
    expect(
      textDocumentProblems(
        docOf(
          paragraph(
            text('x', [{ type: 'link', attrs: { href: 'https://x.example', onmouseover: 'a()' } }]),
          ),
        ),
      ),
    ).toEqual(['A link has no attribute "onmouseover".']);
    expect(
      textDocumentProblems(docOf(paragraph(text('x', [{ type: 'bold', attrs: { style: 'x' } }])))),
    ).toEqual(['A bold has no attribute "style".']);
  });

  it('refuses a key a node can’t have, such as raw HTML', () => {
    expect(
      textDocumentProblems(
        docOf({ type: 'paragraph', html: '<img src=x onerror=alert(1)>' } as never),
      ),
    ).toEqual(['A paragraph has no field "html".']);
    expect(textDocumentProblems(docOf(paragraph({ type: 'text', text: 'x', attrs: {} })))).toEqual([
      'A text has no field "attrs".',
    ]);
  });

  it('refuses attribute values of the wrong shape', () => {
    expect(
      textDocumentProblems(docOf({ type: 'heading', attrs: { level: 4 }, content: [] })),
    ).toEqual(['A heading’s "level" must be 1, 2 or 3.']);
    expect(textDocumentProblems(docOf(paragraph({ type: 'value', attrs: {} })))).toEqual([
      'A value needs its "measure".',
    ]);
    expect(
      textDocumentProblems(docOf(paragraph({ type: 'value', attrs: { measure: 'revenue' } }))),
    ).toEqual(['A value’s "measure" must be a member, cube.member.']);
    expect(
      textDocumentProblems(
        docOf(
          paragraph({
            type: 'bulletGraph',
            attrs: { measure: 'orders.margin', ranges: [1, 2, 3, 4] },
          }),
        ),
      ),
    ).toEqual(['A bulletGraph’s "ranges" must be up to 3 numbers, low to high.']);
    expect(
      textDocumentProblems(
        docOf(
          paragraph({
            type: 'actionButton',
            attrs: { label: 'Go', actions: [{ kind: 'script', code: 'alert(1)' }] },
          }),
        ),
      ),
    ).toEqual([
      'An actionButton’s "actions" must be a list of actions, each go to a page, apply a bookmark, reset filters or export.',
    ]);
  });

  it('refuses a node where its parent can’t hold it', () => {
    expect(textDocumentProblems(docOf(text('loose')))).toEqual(['A doc can’t hold a text.']);
    expect(
      textDocumentProblems(docOf({ type: 'bulletList', content: [paragraph(text('x'))] })),
    ).toEqual(['A bulletList can’t hold a paragraph.']);
    expect(textDocumentProblems(docOf(paragraph(paragraph())))).toEqual([
      'A paragraph can’t hold a paragraph.',
    ]);
  });

  it('refuses a javascript:, data: or vbscript: link, naming it', () => {
    for (const href of [
      'javascript:alert(1)',
      'JavaScript:alert(1)',
      ' javascript:alert(1)',
      'data:text/html;base64,PHNjcmlwdD4=',
      'vbscript:msgbox(1)',
    ])
      expect(
        textDocumentProblems(docOf(paragraph(text('a', [{ type: 'link', attrs: { href } }])))),
      ).toEqual([`The link "${href}" isn’t an http(s) address or a wechart dashboard.`]);
  });

  it('allows a link only to an http(s) address or a wechart dashboard', () => {
    expect(textLinkProblem('https://example.com')).toBeUndefined();
    expect(textLinkProblem('http://example.com/path?q=1')).toBeUndefined();
    expect(
      textLinkProblem('/explore/dashboards/0b6e3c0e-1a2b-4c3d-9e8f-001122334455'),
    ).toBeUndefined();
    for (const href of [
      '',
      'ftp://example.com',
      'mailto:a@example.com',
      '//evil.example',
      '/admin',
      'https://',
      'https://exa mple.com',
      'http:evil.example',
      'https://x.example/a\nb',
      'https://x.example/\u0000',
      '/explore/dashboards/../../admin',
    ])
      expect(textLinkProblem(href)).toBe(
        `The link "${href}" isn’t an http(s) address or a wechart dashboard.`,
      );
  });

  it('refuses 11 elements, naming the count and the limit', () => {
    expect(TEXT_ELEMENT_LIMIT).toBe(10);
    const ten = Array.from({ length: 10 }, () => value());
    expect(textDocumentProblems(docOf(paragraph(...ten)))).toEqual([]);
    expect(textDocumentProblems(docOf(paragraph(...ten), paragraph(value())))).toEqual([
      'The text holds 11 elements; a Text tile holds at most 10.',
    ]);
  });

  // T868's review: names every object inherits are no node, mark or
  // attribute of the schema, and are refused by name rather than throwing.
  it('refuses an inherited name as a node, mark or attribute, without throwing', () => {
    const posted = (json: string) => textDocumentProblems(JSON.parse(json) as unknown);
    const wrapped = (block: string) =>
      `{"version":${String(TEXT_DOCUMENT_VERSION)},"doc":{"type":"doc","content":[${block}]}}`;
    expect(posted(wrapped('{"type":"paragraph","attrs":{"constructor":1}}'))).toEqual([
      'A paragraph has no attribute "constructor".',
    ]);
    expect(posted(wrapped('{"type":"paragraph","attrs":{"__proto__":{"x":1}}}'))).toEqual([
      'A paragraph has no attribute "__proto__".',
    ]);
    expect(
      posted(
        wrapped(
          '{"type":"paragraph","content":[{"type":"text","text":"a","marks":[{"type":"link","attrs":{"href":"https://x.example","toString":"x"}}]}]}',
        ),
      ),
    ).toEqual(['A link has no attribute "toString".']);
    expect(
      posted(
        wrapped(
          '{"type":"paragraph","content":[{"type":"text","text":"a","marks":[{"type":"constructor"},{"type":"__proto__"}]}]}',
        ),
      ),
    ).toEqual(['Unknown mark "constructor".', 'Unknown mark "__proto__".']);
    expect(posted(wrapped('{"type":"toString"},{"type":"__proto__"}'))).toEqual([
      'Unknown node "toString".',
      'Unknown node "__proto__".',
    ]);
  });

  // T868's review: ProseMirror marks every inline node in a selection, a
  // line break included.
  it('accepts a line break inside bold, italic or a link', () => {
    expect(
      textDocumentProblems(
        docOf(
          paragraph(
            text('a', [{ type: 'bold' }]),
            { type: 'hardBreak', marks: [{ type: 'bold' }, { type: 'italic' }] },
            { type: 'hardBreak', marks: [{ type: 'link', attrs: { href: 'https://x.example' } }] },
            text('b', [{ type: 'bold' }]),
          ),
        ),
      ),
    ).toEqual([]);
  });

  // T868's review: as StarterKit's lists are, so a document that passes
  // here opens in the editor (`listItem+`, `paragraph block*`).
  it('refuses an empty list, and a list item that doesn’t start with a paragraph', () => {
    expect(textDocumentProblems(docOf({ type: 'bulletList', content: [] }))).toEqual([
      'A bulletList needs at least one listItem.',
    ]);
    expect(textDocumentProblems(docOf({ type: 'orderedList' }))).toEqual([
      'An orderedList needs at least one listItem.',
    ]);
    expect(
      textDocumentProblems(
        docOf({
          type: 'bulletList',
          content: [
            { type: 'listItem', content: [] },
            {
              type: 'listItem',
              content: [
                { type: 'bulletList', content: [{ type: 'listItem', content: [paragraph()] }] },
              ],
            },
          ],
        }),
      ),
    ).toEqual([
      'A listItem must start with a paragraph.',
      'A listItem must start with a paragraph.',
    ]);
  });

  it('checks a document nested past any call stack’s depth without overflowing', () => {
    let deep: TextNode = paragraph(text('bottom'));
    for (let at = 0; at < 200_000; at += 1)
      deep = { type: 'bulletList', content: [{ type: 'listItem', content: [paragraph(), deep] }] };
    expect(textDocumentProblems(docOf(deep))).toEqual([]);
    expect(elementsOf(docOf(deep))).toEqual([]);
  });

  it('names every problem it finds, not only the first', () => {
    expect(
      textDocumentProblems(
        docOf(
          paragraph({ type: 'image' }),
          paragraph(text('a', [{ type: 'link', attrs: { href: 'javascript:x' } }])),
        ),
      ),
    ).toEqual([
      'Unknown node "image".',
      'The link "javascript:x" isn’t an http(s) address or a wechart dashboard.',
    ]);
  });
});

describe('a Text document’s elements (T868, AC-518)', () => {
  it('lists live elements, controls and buttons in text order, wherever they sit', () => {
    const doc = everything(oneOfEach.slice(0, 9));
    expect(elementsOf(doc).map((node) => node.type)).toEqual([
      'value', // the Large value line's
      'value',
      'change',
      'sparkline',
      'icon',
      'bulletGraph',
      'marking',
      'filterValue',
      'asOf',
      'filterControl',
    ]);
    expect(elementsOf(docOf(paragraph(...oneOfEach.slice(9)))).map((node) => node.type)).toEqual([
      'parameterControl',
      'actionButton',
    ]);
  });

  it('counts an element inside a list item, and nothing that isn’t one', () => {
    const doc = docOf(paragraph(text('no elements'), { type: 'hardBreak' }), {
      type: 'bulletList',
      content: [{ type: 'listItem', content: [paragraph(value(), text(' and '), value())] }],
    });
    expect(elementsOf(doc)).toHaveLength(2);
    expect(elementsOf(docOf())).toEqual([]);
  });
});

/**
 * T872 / AC-512, AC-272: publishing binds the members a Text tile's elements
 * name, as it bound a markdown tile's tokens; a copy renames them.
 */
describe('the members a Text document names (T872)', () => {
  const named: TextDocument = {
    version: TEXT_DOCUMENT_VERSION,
    doc: {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Revenue ' },
            {
              type: 'value',
              attrs: {
                measure: 'sales.revenue',
                filters: [{ member: 'regions.name', operator: 'equals', values: ['EU'] }],
              },
            },
            {
              type: 'change',
              attrs: { measure: 'sales.count', time: 'calendar.day' },
            },
            { type: 'icon', attrs: { measure: 'sales.count', of: 'targets.count' } },
            {
              type: 'bulletGraph',
              attrs: {
                measure: 'sales.count',
                target: { kind: 'measure', measure: 'goals.count' },
              },
            },
            { type: 'marking', attrs: { marking: 'sales.count' } },
            { type: 'filterValue', attrs: { filter: 'f1' } },
          ],
        },
      ],
    },
  };

  it('names each member an element names, once, in text order, and no marking or filter id', () => {
    expect(textDocumentMembers(named)).toEqual([
      'sales.revenue',
      'regions.name',
      'sales.count',
      'calendar.day',
      'targets.count',
      'goals.count',
    ]);
  });

  it('renames every member it names, and leaves the words, markings and ids alone', () => {
    const renamed = textDocumentRenamed(named, (member) =>
      member.startsWith('sales.') ? `fab__${member}` : member,
    );
    expect(textDocumentMembers(renamed)).toEqual([
      'fab__sales.revenue',
      'regions.name',
      'fab__sales.count',
      'calendar.day',
      'targets.count',
      'goals.count',
    ]);
    const json = JSON.stringify(renamed);
    expect(json).toContain('"text":"Revenue "');
    expect(json).toContain('"marking":"sales.count"');
    expect(json).toContain('"filter":"f1"');
    expect(textDocumentProblems(renamed)).toEqual([]);
  });

  // T872's review: a stored or posted document is read before it is checked,
  // so only what is a member's name is named, as a token's is.
  it('names nothing that isn’t a member, cube.member', () => {
    const odd = {
      version: TEXT_DOCUMENT_VERSION,
      doc: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'value', attrs: { measure: 'x y.z', time: 'nodot' } }],
          },
        ],
      },
    } as TextDocument;
    expect(textDocumentMembers(odd)).toEqual([]);
  });

  it('gives back the same document when nothing is renamed', () => {
    expect(textDocumentRenamed(named, (member) => member)).toBe(named);
  });
});
