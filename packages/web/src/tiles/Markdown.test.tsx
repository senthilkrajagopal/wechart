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
  // Each carries its own marks' count for its size (T247). Its level in the
  // page's outline is its rank among the tile's own heading levels, from h3,
  // so what is drawn larger is never announced as a sibling of what is drawn
  // smaller (T247's review: "#" and "##" were both h3). One level alone is h3.
  it('renders the tile’s shallowest heading at h3, and each deeper one a level down', () => {
    expect(html('# Top')).toBe('<div class="markdown"><h3 data-level="1">Top</h3></div>');
    expect(html('## Title')).toBe('<div class="markdown"><h3 data-level="2">Title</h3></div>');
    expect(html('### Sub')).toBe('<div class="markdown"><h3 data-level="3">Sub</h3></div>');
    expect(html('# A\n### B')).toBe(
      '<div class="markdown"><h3 data-level="1">A</h3><h4 data-level="3">B</h4></div>',
    );
    expect(html('## A\n### B\n# C\n#### D')).toBe(
      '<div class="markdown"><h4 data-level="2">A</h4><h5 data-level="3">B</h5><h3 data-level="1">C</h3><h6 data-level="4">D</h6></div>',
    );
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

/**
 * T389 / AC-116: a text tile's tokens drawn as live values, wherever the
 * text holds them. `Fails when: a token renders as literal text …`
 */
describe('a markdown tile’s tokens (AC-116)', () => {
  const drawn = (text: string) =>
    render(
      <Markdown
        text={text}
        tokens={(token, key) => (
          <b key={key}>{token.kind === 'marking' ? `[${token.name}]` : `[${token.member}]`}</b>
        )}
      />,
    ).container.innerHTML;

  it('draws each token in place, in a heading, a list, emphasis or a paragraph', () => {
    expect(drawn('## {{marking:A.count}} marked\n\n- **{{measure:orders.count}}** in all')).toBe(
      '<div class="markdown"><h3 data-level="2"><b>[A]</b> marked</h3><ul><li><strong><b>[orders.count]</b></strong> in all</li></ul></div>',
    );
  });

  it('keeps a token whole when its marking’s name holds an emphasis mark', () => {
    expect(drawn('{{marking:Q3 *core* picks.count}} and *more*')).toBe(
      '<div class="markdown"><p><b>[Q3 *core* picks]</b> and <em>more</em></p></div>',
    );
  });

  it('leaves a token in a code span as its braces', () => {
    expect(drawn('`{{measure:orders.count}}`')).toBe(
      '<div class="markdown"><p><code>{{measure:orders.count}}</code></p></div>',
    );
  });

  it('draws no token without a way to draw it', () => {
    expect(html('{{measure:orders.count}}')).toBe(
      '<div class="markdown"><p>{{measure:orders.count}}</p></div>',
    );
  });
});
