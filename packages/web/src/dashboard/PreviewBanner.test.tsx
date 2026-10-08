import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ME_QUERY } from '../shell/me';
import { PreviewBanner } from './PreviewBanner';

/**
 * T438 (AC-166; design 08 of 2026-09-27, state E; direction.md rule 21): the
 * banner over a previewed dashboard names what it runs as. With sign-in on, a
 * preview as groups says them in words, with "Stop preview"; any other
 * context, and sign-in off, keep phase 1's words and the context itself.
 */
function banner(security: 'oidc' | 'off', context: Record<string, unknown>, title?: string) {
  const client = new QueryClient();
  client.setQueryData(ME_QUERY.queryKey, { name: 'Super Admin', security });
  render(
    <QueryClientProvider client={client}>
      <PreviewBanner context={context} onExit={undefined} title={title} />
    </QueryClientProvider>,
  );
  return screen.getByTestId('preview-banner');
}

describe('the preview banner (T438, AC-166)', () => {
  /**
   * T630 (AC-166, AC-343; design 08, state E, as drawn): the eye, "Previewing
   * as sales-ro and emea-viewers · Revenue overview", each group in the code
   * face and bold, and Stop preview as a button.
   */
  it('names the groups and the dashboard, with sign-in on, as design 08 draws it', () => {
    const shown = banner('oidc', { groups: ['sales-ro', 'emea-viewers'] }, 'Revenue overview');
    expect(shown.textContent).toBe(
      'Previewing as sales-ro and emea-viewers · Revenue overviewStop preview',
    );
    expect(shown.className).toContain('preview-banner--groups');
    expect(shown.querySelector('svg')?.getAttribute('data-icon')).toBe('eye');
    expect([...shown.querySelectorAll('b > code')].map((code) => code.textContent)).toEqual([
      'sales-ro',
      'emea-viewers',
    ]);
    const stop = shown.querySelector('a');
    expect(stop?.textContent).toBe('Stop preview');
    expect(stop?.className).toContain('btn');
  });

  it('keeps each group’s name whole, whatever it says (T438’s review)', () => {
    const shown = banner('oidc', { groups: ['Sales and Marketing', 'emea', 'finance'] }, 'Q3');
    expect(shown.textContent).toContain('Previewing as Sales and Marketing, emea and finance · Q3');
    expect([...shown.querySelectorAll('code')].map((code) => code.textContent)).toEqual([
      'Sales and Marketing',
      'emea',
      'finance',
    ]);
  });

  it('keeps phase 1’s words when who is signed in isn’t known', () => {
    render(<PreviewBanner context={{ groups: ['sales'] }} onExit={undefined} />);
    expect(screen.getByTestId('preview-banner').textContent).toContain('{"groups":["sales"]}');
  });

  /** T699 (security-Q1, R76): Preview as groups with sign-in off too, under the same banner. */
  it('names the groups and the dashboard with sign-in off too, as design 08 draws it', () => {
    const shown = banner('off', { groups: ['sales'] }, 'Revenue overview');
    expect(shown.textContent).toBe('Previewing as sales · Revenue overviewStop preview');
    expect(shown.querySelector('a')?.textContent).toBe('Stop preview');
    expect(shown.className).toContain('preview-banner--groups');
  });

  it('keeps phase 1’s words for any other context with sign-in off', () => {
    const shown = banner('off', { groups: ['sales'], region: 'EMEA' });
    expect(shown.textContent).toContain('Previewing as {"groups":["sales"],"region":"EMEA"}.');
    expect(shown.querySelector('a')?.textContent).toBe('Exit preview');
    expect(shown.className).not.toContain('preview-banner--groups');
  });

  it('shows any other context as it is, even signed in', () => {
    const shown = banner('oidc', { groups: ['sales'], region: 'EMEA' });
    expect(shown.textContent).toContain('{"groups":["sales"],"region":"EMEA"}');
  });
});
