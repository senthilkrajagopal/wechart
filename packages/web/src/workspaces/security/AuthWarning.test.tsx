import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AuthWarning } from './AuthWarning';

/**
 * T175 / AC-169: IF Cube would accept unauthenticated requests, because
 * authentication checks are not enforced, THEN THE SYSTEM SHALL show a
 * persistent warning in the Security workspace.
 * Fails when: no warning is shown while Cube accepts an unauthenticated
 * request.
 *
 * The API asks Cube as anyone could, and says `enforced`, `open` (with what
 * Cube accepted) or `unknown` (`/api/cube-auth`).
 */
function answering(answer: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) =>
      String(input) === '/api/cube-auth'
        ? Response.json(answer)
        : new Response('not found', { status: 404 }),
    ),
  );
}

function warning() {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <AuthWarning />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the warning that Cube accepts unauthenticated requests', () => {
  it('is shown while Cube answers a request nobody signed, saying which', async () => {
    answering({ auth: 'open', accepted: ['no token', 'an invalid token'] });
    warning();

    const shown = await screen.findByRole('alert');
    expect(shown.getAttribute('data-testid')).toBe('cube-auth');
    expect(shown.textContent).toContain(
      'Cube lets in requests with no token and with an invalid token.',
    );
    // What that opens, as the research has it: the empty context's reach.
    expect(shown.textContent).toContain('It answers them as an empty security context');
    // An icon of its kind with the words, never colour alone.
    expect(shown.querySelector('[data-icon="err"]')).not.toBeNull();
    // It stays: nothing on it dismisses it.
    expect(screen.queryByRole('button', { name: /dismiss|close/i })).toBeNull();
  });

  it('stays up through an ask that cannot tell, and goes only when Cube refuses them', async () => {
    // Open, then asks that cannot tell or fail — until the test says Cube refuses.
    const answers: unknown[] = [{ auth: 'open', accepted: ['no token'] }, { auth: 'unknown' }];
    let asked = 0;
    let refusing = false;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        const answer = refusing ? { auth: 'enforced' } : (answers[asked] ?? 'fails');
        asked += 1;
        return answer === 'fails' ? new Response('down', { status: 502 }) : Response.json(answer);
      }),
    );
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <AuthWarning pollMs={20} />
      </QueryClientProvider>,
    );

    await screen.findByRole('alert');
    // Through the ask that could not tell and the one that failed: still up.
    await vi.waitFor(() => {
      expect(asked).toBeGreaterThanOrEqual(3);
    });
    expect(screen.getByRole('alert').textContent).toContain('Cube lets in requests with no token.');
    // A definite refusal replaces it.
    refusing = true;
    await vi.waitFor(() => {
      expect(screen.queryByRole('alert')).toBeNull();
    });
    expect(screen.getByTestId('cube-auth').textContent).toContain(
      'Cube refuses requests without a valid token.',
    );
  });

  it('says Cube refuses them when it does, with no warning', async () => {
    answering({ auth: 'enforced' });
    warning();

    const shown = await screen.findByText('Cube refuses requests without a valid token.');
    expect(shown.closest('[data-testid="cube-auth"]')?.getAttribute('role')).toBe('status');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('says it cannot tell, rather than that all is well, when Cube cannot be asked', async () => {
    answering({ auth: 'unknown' });
    warning();

    const said = await screen.findByText(/^Could not tell whether Cube refuses/);
    expect(said.textContent).toBe(
      'Could not tell whether Cube refuses requests without a valid token.',
    );
    expect(
      said.closest('[data-testid="cube-auth"]')?.querySelector('[data-icon="warn"]'),
    ).not.toBeNull();
  });
});
