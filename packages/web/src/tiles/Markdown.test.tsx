import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Markdown } from './Markdown';

/**
 * T221 / AC-208: THE SYSTEM SHALL render a markdown tile's headings, emphasis,
 * lists and line breaks, and no raw HTML (`[R7]`).
 * `Fails when: a heading marker such as "##" or an emphasis marker is shown as
 * text, or an HTML tag in the text renders as HTML.`
 */
const html = (text: string) => render(<Markdown text={text} />).container.innerHTML;

describe('a markdown tile’s text (AC-208)', () => {
  // Each carries its own marks' count for its size (T247): the level in the
  // outline and the size drawn are separate.
  it('renders headings below the tile’s own, one level per marker up to two', () => {
    expect(html('# Top')).toBe('<div class="markdown"><h3 data-level="1">Top</h3></div>');
    expect(html('## Title')).toBe('<div class="markdown"><h3 data-level="2">Title</h3></div>');
    expect(html('### Sub')).toBe('<div class="markdown"><h4 data-level="3">Sub</h4></div>');
  });

  it('renders emphasis, strong and code inside a line', () => {
    expect(html('a **b** and *c* or _d_ with `e`')).toBe(
      '<div class="markdown"><p>a <strong>b</strong> and <em>c</em> or <em>d</em> with <code>e</code></p></div>',
    );
  });

  it('keeps a single newline as a break, and a blank line as a new paragraph', () => {
    expect(html('one\ntwo\n\nthree')).toBe(
      '<div class="markdown"><p>one<br>two</p><p>three</p></div>',
    );
  });

  it('renders bulleted and numbered lists', () => {
    expect(html('- a\n* b')).toBe('<div class="markdown"><ul><li>a</li><li>b</li></ul></div>');
    expect(html('1. a\n2. b')).toBe('<div class="markdown"><ol><li>a</li><li>b</li></ol></div>');
  });

  it('shows HTML as the text it is, never as markup', () => {
    const shown = html('<b>x</b> <script>alert(1)</script>');
    expect(shown).toBe(
      '<div class="markdown"><p>&lt;b&gt;x&lt;/b&gt; &lt;script&gt;alert(1)&lt;/script&gt;</p></div>',
    );
  });

  it('leaves an unmatched marker as it is', () => {
    expect(html('2 * 3 and **open')).toBe('<div class="markdown"><p>2 * 3 and **open</p></div>');
  });

  // T221's review: markers left showing, or text changed.
  it('renders bold italic, and emphasis inside strong, with no marker left', () => {
    expect(html('***both***')).toBe(
      '<div class="markdown"><p><strong><em>both</em></strong></p></div>',
    );
    expect(html('**a *b* c**')).toBe(
      '<div class="markdown"><p><strong>a <em>b</em> c</strong></p></div>',
    );
  });

  it('carries emphasis across a line break within a paragraph', () => {
    expect(html('**bold\nmore**')).toBe(
      '<div class="markdown"><p><strong>bold<br>more</strong></p></div>',
    );
  });

  it('leaves underscores inside a word alone, as in a member’s name', () => {
    expect(html('order_line_items and created_at')).toBe(
      '<div class="markdown"><p>order_line_items and created_at</p></div>',
    );
  });

  it('numbers a list from its first item', () => {
    expect(html('3. c\n4. d')).toBe(
      '<div class="markdown"><ol start="3"><li>c</li><li>d</li></ol></div>',
    );
  });

  it('reads Windows line endings as lines', () => {
    expect(html('## A\r\nb')).toBe('<div class="markdown"><h3 data-level="2">A</h3><p>b</p></div>');
  });
});
