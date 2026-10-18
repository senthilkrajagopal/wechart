import { describe, expect, it } from 'vitest';

import { textDocumentFromMarkdown } from '@wechart/core';

import type { Element_ } from '../model/document';
import { outlineNameOf } from './Outline';

/**
 * T247 / AC-209, recheck-dashboard N9: a Markdown tile is named by what it
 * says, not by its markup — "Markdown: ## New text\nDescribe…" was its
 * accessible name.
 */
const markdown = (text: string) => ({ id: 'm', kind: 'markdown', w: 6, text }) as Element_;
const noCharts = () => undefined;

describe('a Markdown tile’s name', () => {
  it('is its first line as it reads, with no heading marks', () => {
    expect(
      outlineNameOf(markdown('## Quarter notes\nOrders by status, this quarter.'), noCharts),
    ).toBe('Markdown: Quarter notes');
  });

  it('carries no emphasis, code or list marks', () => {
    expect(outlineNameOf(markdown('- **Count** is `orders.count`'), noCharts)).toBe(
      'Markdown: Count is orders.count',
    );
  });

  it('skips blank lines to the first that says something', () => {
    expect(outlineNameOf(markdown('\n\n  \n1. First step'), noCharts)).toBe('Markdown: First step');
  });

  it('is its kind alone when it says nothing', () => {
    expect(outlineNameOf(markdown('##   \n\n'), noCharts)).toBe('Markdown');
  });

  // T247's review: the name is read by the rules that draw the tile, so what
  // the tile shows as text stays in its name.
  it('keeps what the tile shows as it is: an unpaired mark, a leading space, a key’s underscore', () => {
    expect(outlineNameOf(markdown('Revenue * 1.2'), noCharts)).toBe('Markdown: Revenue * 1.2');
    expect(outlineNameOf(markdown('  ## Notes'), noCharts)).toBe('Markdown: ## Notes');
    expect(outlineNameOf(markdown('_id is the key'), noCharts)).toBe('Markdown: _id is the key');
    expect(outlineNameOf(markdown('order_line_items by _status_'), noCharts)).toBe(
      'Markdown: order_line_items by status',
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
