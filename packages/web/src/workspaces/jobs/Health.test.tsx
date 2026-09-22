import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Health } from './Health';

/**
 * T162 / AC-156: THE SYSTEM SHALL show the refresh worker's state and the
 * Cube deployment's health, and mark the deployment as down when Cube's
 * health endpoint does not report healthy.
 * Fails when: the indicator stays healthy while Cube reports otherwise.
 *
 * The Jobs header's two badges, as the prototype's ("Refresh worker
 * running"), each an icon and words, asked again while the page is open.
 */
function answering(...answers: unknown[]) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe('/api/cube-health');
      const next = answers.length > 1 ? answers.shift() : answers[0];
      return new Response(JSON.stringify(next));
    }),
  );
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <Health pollMs={10} />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const badge = (id: string) => screen.getByTestId(id);

describe('Cube’s health, in the Jobs header', () => {
  it('shows the deployment healthy and the refresh worker running, each with its icon', async () => {
    answering({ cube: 'healthy', worker: 'healthy' });

    await vi.waitFor(() => {
      expect(badge('cube-health').textContent).toBe('Cube healthy');
    });
    expect(badge('cube-health').querySelector('svg')?.getAttribute('data-icon')).toBe('ok');
    expect(badge('worker-health').textContent).toBe('Refresh worker running');
    expect(badge('worker-health').querySelector('svg')?.getAttribute('data-icon')).toBe('ok');
  });

  it('marks the deployment down as soon as Cube stops reporting healthy', async () => {
    answering({ cube: 'healthy', worker: 'healthy' }, { cube: 'down', worker: 'down' });

    await vi.waitFor(() => {
      expect(badge('cube-health').textContent).toBe('Cube down');
    });
    expect(badge('cube-health').querySelector('svg')?.getAttribute('data-icon')).toBe('err');
    expect(badge('worker-health').textContent).toBe('Refresh worker down');
  });

  it('says so when the refresh worker is not watched, rather than calling it running', async () => {
    answering({ cube: 'healthy', worker: 'unwatched' });

    await vi.waitFor(() => {
      expect(badge('worker-health').textContent).toBe('Refresh worker not watched');
    });
    expect(badge('worker-health').querySelector('svg')?.getAttribute('data-icon')).toBe('warn');
  });

  it('stops calling it healthy once its health can no longer be read', async () => {
    // The last answer is kept by the query when a later ask fails; shown, it
    // would say healthy while nothing says so any more.
    let asks = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        asks += 1;
        return asks === 1
          ? new Response(JSON.stringify({ cube: 'healthy', worker: 'healthy' }))
          : new Response('', { status: 502 });
      }),
    );
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <Health pollMs={10} />
      </QueryClientProvider>,
    );

    await vi.waitFor(() => {
      expect(asks).toBeGreaterThan(1);
      expect(badge('cube-health').textContent).toBe('Cube health unknown');
    });
  });

  it('marks the deployment down when its health cannot be read at all', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 502 })),
    );
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <Health pollMs={10} />
      </QueryClientProvider>,
    );

    await vi.waitFor(() => {
      expect(badge('cube-health').textContent).toBe('Cube health unknown');
    });
    expect(badge('cube-health').querySelector('svg')?.getAttribute('data-icon')).toBe('warn');
  });
});
