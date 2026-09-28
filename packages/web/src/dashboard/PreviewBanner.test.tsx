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
function banner(security: 'oidc' | 'off', context: Record<string, unknown>) {
  const client = new QueryClient();
  client.setQueryData(ME_QUERY.queryKey, { name: 'Super Admin', security });
  render(
    <QueryClientProvider client={client}>
      <PreviewBanner context={context} onExit={undefined} />
    </QueryClientProvider>,
  );
  return screen.getByTestId('preview-banner');
}

describe('the preview banner (T438, AC-166)', () => {
  it('names the groups in words, with sign-in on', () => {
    const shown = banner('oidc', { groups: ['sales-ro', 'emea-viewers'] });
    expect(shown.textContent).toContain('Previewing as sales-ro and emea-viewers.');
    expect(shown.querySelector('a')?.textContent).toBe('Stop preview');
  });

  it('keeps each group’s name whole, whatever it says (T438’s review)', () => {
    const shown = banner('oidc', { groups: ['Sales and Marketing', 'emea', 'finance'] });
    expect(shown.textContent).toContain('Previewing as Sales and Marketing, emea and finance.');
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

  it('keeps phase 1’s context, word for word, with sign-in off', () => {
    const shown = banner('off', { groups: ['sales'] });
    expect(shown.textContent).toContain('Previewing as {"groups":["sales"]}.');
    expect(shown.querySelector('a')?.textContent).toBe('Exit preview');
  });

  it('shows any other context as it is, even signed in', () => {
    const shown = banner('oidc', { groups: ['sales'], region: 'EMEA' });
    expect(shown.textContent).toContain('{"groups":["sales"],"region":"EMEA"}');
  });
});
