import { describe, expect, it } from 'vitest';

import { clauseOf, sentenceOf } from './sentence';

/** T247's review (recheck-dashboard N9): one full stop, wherever a name is spoken. */
describe('a name spoken in a sentence', () => {
  it('ends a sentence once', () => {
    expect(sentenceOf('Chart: Revenue')).toBe('Chart: Revenue.');
    expect(sentenceOf('Markdown: Count is the number of orders.')).toBe(
      'Markdown: Count is the number of orders.',
    );
    expect(sentenceOf('Markdown: Is it up?')).toBe('Markdown: Is it up?');
    expect(sentenceOf('Markdown: A long paragraph that was cut…')).toBe(
      'Markdown: A long paragraph that was cut…',
    );
  });

  it('starts a clause without its own full stop', () => {
    expect(clauseOf('Markdown: Count is the number of orders.')).toBe(
      'Markdown: Count is the number of orders',
    );
    expect(clauseOf('Chart: Revenue')).toBe('Chart: Revenue');
  });
});
