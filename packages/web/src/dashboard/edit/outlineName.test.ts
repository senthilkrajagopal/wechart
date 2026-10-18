import { describe, expect, it } from 'vitest';

import { textDocumentFromMarkdown } from '@wechart/core';

import type { Element_ } from '../model/document';
import { outlineNameOf } from './Outline';

/**
 * T247 / AC-209, recheck-dashboard N9: a tile of text is named by what it
 * says, not by its markup — "Markdown: ## New text\nDescribe…" was its
 * accessible name. Since T875 (AC-512) a markdown tile is the Text tile it
 * converts to, named as one: "Text: …", and a code span keeps its backticks
 * as the tile now shows them (decision T869-1).
 */
const markdown = (text: string) => ({ id: 'm', kind: 'markdown', w: 6, text }) as Element_;
const noCharts = () => undefined;

describe('a markdown tile’s name, read as a Text tile', () => {
  it('is its first line as it reads, with no heading marks', () => {
    expect(
      outlineNameOf(markdown('## Quarter notes\nOrders by status, this quarter.'), noCharts),
    ).toBe('Text: Quarter notes');
  });

  it('carries no emphasis or list marks', () => {
    expect(outlineNameOf(markdown('- **Count** is `orders.count`'), noCharts)).toBe(
      'Text: Count is `orders.count`',
    );
  });

  it('skips blank lines to the first that says something', () => {
    expect(outlineNameOf(markdown('\n\n  \n1. First step'), noCharts)).toBe('Text: First step');
  });

  it('is "Empty text" when it says nothing', () => {
    expect(outlineNameOf(markdown('##   \n\n'), noCharts)).toBe('Empty text');
  });

  // T247's review: the name is read by the rules that draw the tile, so what
  // the tile shows as text stays in its name.
  it('keeps what the tile shows as it is: an unpaired mark, a leading space, a key’s underscore', () => {
    expect(outlineNameOf(markdown('Revenue * 1.2'), noCharts)).toBe('Text: Revenue * 1.2');
    expect(outlineNameOf(markdown('  ## Notes'), noCharts)).toBe('Text: ## Notes');
    expect(outlineNameOf(markdown('_id is the key'), noCharts)).toBe('Text: _id is the key');
    expect(outlineNameOf(markdown('order_line_items by _status_'), noCharts)).toBe(
      'Text: order_line_items by status',
    );
  });
});

/**
 * T874's review, AC-209 and design 21 G6: a Text tile is named by its first
 * line; "Empty text" is only a tile holding nothing at all, never one that
 * draws a value.
 */
describe('a Text tile’s name', () => {
  const text = (markdownText: string) =>
    ({
      id: 't',
      kind: 'text',
      w: 6,
      document: textDocumentFromMarkdown(markdownText),
    }) as Element_;

  it('is its first line', () => {
    expect(outlineNameOf(text('## Notes\n\nMore.'), noCharts)).toBe('Text: Notes');
  });

  it('is "Empty text" when it holds nothing', () => {
    expect(outlineNameOf(text(''), noCharts)).toBe('Empty text');
  });

  it('is its kind, not "Empty text", when it holds only an element', () => {
    expect(outlineNameOf(text('{{measure:orders.count}}'), noCharts)).toBe('Text');
  });
});
