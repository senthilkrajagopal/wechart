import { describe, expect, it } from 'vitest';

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
});
