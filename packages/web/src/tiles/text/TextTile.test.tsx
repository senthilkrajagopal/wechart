import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { TextDocument, TextNode } from '@wechart/core';

import { TextTile } from './TextTile';

/**
 * T873 / AC-208: a Text tile's paragraphs, three heading styles, Large value,
 * bold, italic, lists, line breaks and links render in view mode through the
 * JSON static renderer as React elements, at §3's sizes, and no raw HTML.
 * Fails when: a heading, emphasis, list or link is shown as markup; a heading
 * style isn't a heading element; or an HTML tag in the text renders as HTML.
 *
 * AC-513: whatever the stored tree holds, only what the schema allows is
 * drawn, and nothing is set as HTML.
 */
const doc = (...content: TextNode[]): TextDocument => ({
  version: 1,
  doc: { type: 'doc', content },
});
const text = (value: string, marks?: TextNode['marks']): TextNode => ({
  type: 'text',
  text: value,
  ...(marks === undefined ? {} : { marks }),
});
const paragraph = (...content: TextNode[]): TextNode => ({ type: 'paragraph', content });
const heading = (level: number, value: string): TextNode => ({
  type: 'heading',
  attrs: { level },
  content: [text(value)],
});
const item = (value: string): TextNode => ({ type: 'listItem', content: [paragraph(text(value))] });

const drawn = (document: TextDocument) => render(<TextTile document={document} />).container;

describe('a Text tile in view mode (AC-208)', () => {
  it('draws Heading large, medium and small as h3, h4 and h5 at text-xl, text-lg and text-md', () => {
    const tile = drawn(doc(heading(1, 'Large'), heading(2, 'Medium'), heading(3, 'Small')));
    const h3 = tile.querySelector('h3');
    const h4 = tile.querySelector('h4');
    const h5 = tile.querySelector('h5');
    expect(h3?.textContent).toBe('Large');
    expect(h3?.getAttribute('data-type')).toBe('text-xl');
    expect(h4?.textContent).toBe('Medium');
    expect(h4?.getAttribute('data-type')).toBe('text-lg');
    expect(h5?.textContent).toBe('Small');
    expect(h5?.getAttribute('data-type')).toBe('text-md');
  });

  it('draws a converted markdown tile’s lone "##", level 1 by rank, as h3 (decision T869-1)', () => {
    const tile = drawn(doc(heading(1, 'Marked share'), paragraph(text('Body'))));
    expect(tile.querySelector('h3')?.textContent).toBe('Marked share');
    expect(tile.textContent).not.toContain('#');
  });

  it('draws Large value at text-kpi, 32/40, in tabular numerals', () => {
    const tile = drawn(doc({ type: 'largeValue', content: [text('$1.2M')] }));
    const large = tile.querySelector('[data-type="text-kpi"]');
    expect(large?.textContent).toBe('$1.2M');
    expect(large?.className).toContain('text-tile__large');
  });

  it('draws paragraphs, bold as strong, italic as em, and a line break as br', () => {
    const tile = drawn(
      doc(
        paragraph(
          text('Sales '),
          text('rose', [{ type: 'bold' }]),
          text(' sharply', [{ type: 'italic' }]),
          { type: 'hardBreak' },
          text('next line'),
        ),
      ),
    );
    expect(tile.querySelector('p strong')?.textContent).toBe('rose');
    expect(tile.querySelector('p em')?.textContent).toBe(' sharply');
    expect(tile.querySelector('p br')).not.toBeNull();
    expect(tile.textContent).toBe('Sales rose sharplynext line');
  });

  it('draws bulleted and numbered lists as ul and ol, numbered from their start', () => {
    const tile = drawn(
      doc(
        { type: 'bulletList', content: [item('one'), item('two')] },
        { type: 'orderedList', attrs: { start: 3 }, content: [item('three')] },
      ),
    );
    expect([...tile.querySelectorAll('ul > li')].map((li) => li.textContent)).toEqual([
      'one',
      'two',
    ]);
    expect(tile.querySelector('ol')?.getAttribute('start')).toBe('3');
    expect(tile.querySelector('ol > li')?.textContent).toBe('three');
  });

  it('draws a link through wechart’s own check', () => {
    const tile = drawn(
      doc(
        paragraph(
          text('safe', [{ type: 'link', attrs: { href: 'https://example.com/a' } }]),
          text(' and '),
          text('unsafe', [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }]),
        ),
      ),
    );
    const links = tile.querySelectorAll('a');
    expect(links).toHaveLength(1);
    expect(links[0]?.getAttribute('href')).toBe('https://example.com/a');
    expect(tile.textContent).toBe('safe and unsafe');
    expect(tile.innerHTML).not.toContain('javascript:');
  });

  it('draws an HTML tag in the text as that text, setting no HTML (AC-208, AC-513)', () => {
    const tile = drawn(doc(paragraph(text('<b>x</b><img src=x onerror="alert(1)">'))));
    expect(tile.querySelector('b')).toBeNull();
    expect(tile.querySelector('img')).toBeNull();
    expect(tile.textContent).toBe('<b>x</b><img src=x onerror="alert(1)">');
  });

  it('draws nothing of a node, mark or attribute outside the schema from a tampered tree (AC-513)', () => {
    const tampered = {
      version: 1,
      doc: {
        type: 'doc',
        content: [
          { type: 'iframe', attrs: { src: 'https://x.example' } },
          {
            type: 'paragraph',
            attrs: { onclick: 'alert(1)', style: 'color:red' },
            content: [
              { type: 'text', text: 'kept', marks: [{ type: 'script' }] },
              { type: 'image', attrs: { src: 'x', onerror: 'alert(1)' } },
            ],
          },
        ],
      },
    } as unknown as TextDocument;
    const tile = drawn(tampered);
    expect(tile.querySelector('iframe, img, script')).toBeNull();
    expect(tile.querySelector('[onclick], [style]')).toBeNull();
    expect(tile.textContent).toBe('kept');
  });

  it('draws each element through the tile’s own drawing of it, marks and all', () => {
    const tile = render(
      <TextTile
        document={doc(
          paragraph(text('Revenue is '), {
            type: 'value',
            attrs: { measure: 'orders.revenue' },
            marks: [{ type: 'bold' }],
          }),
        )}
        renderElement={(node) => <span data-testid="el">{String(node.attrs?.['measure'])}</span>}
      />,
    ).container;
    expect(tile.querySelector('strong [data-testid="el"]')?.textContent).toBe('orders.revenue');
  });

  it('draws nothing at all for a stored value that isn’t a document', () => {
    const tile = drawn({ version: 1 } as unknown as TextDocument);
    expect(tile.textContent).toBe('');
  });
});
