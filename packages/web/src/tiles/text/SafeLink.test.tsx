import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SafeLink } from './SafeLink';

/**
 * T873 / AC-513: the JSON static renderer runs no `renderHTML` and checks no
 * link (research `rich-tiles-and-combo-tech.md`, Gotchas), so read mode's
 * link is wechart's own: only an http(s) address or a wechart dashboard is a
 * link; anything else is its words as plain text, with no `href`.
 */
const drawn = (href: unknown) =>
  render(
    <SafeLink mark={{ type: 'link', attrs: { href } }}>
      <span>words</span>
    </SafeLink>,
  ).container;

describe('a Text tile’s link in view mode (AC-513)', () => {
  it('draws javascript: as plain text with no href', () => {
    const tile = drawn('javascript:alert(1)');
    expect(tile.querySelector('a')).toBeNull();
    expect(tile.querySelector('[href]')).toBeNull();
    expect(tile.textContent).toBe('words');
  });

  it.each(['data:text/html,<script>alert(1)</script>', '//evil.example', 'vbscript:x', 42])(
    'draws %s as plain text',
    (href) => {
      const tile = drawn(href);
      expect(tile.querySelector('[href]')).toBeNull();
      expect(tile.textContent).toBe('words');
    },
  );

  it('draws an https address as a link opening in a new tab', () => {
    const link = drawn('https://example.com/report').querySelector('a');
    expect(link?.getAttribute('href')).toBe('https://example.com/report');
    expect(link?.getAttribute('target')).toBe('_blank');
    expect(link?.getAttribute('rel')).toBe('noopener noreferrer');
    expect(link?.textContent).toBe('words');
  });

  it('draws a wechart dashboard as a link in the same tab', () => {
    const link = drawn('/explore/dashboards/sales-1').querySelector('a');
    expect(link?.getAttribute('href')).toBe('/explore/dashboards/sales-1');
    expect(link?.hasAttribute('target')).toBe(false);
  });
});
