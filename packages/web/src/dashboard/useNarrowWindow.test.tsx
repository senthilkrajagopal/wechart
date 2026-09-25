import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { NARROW_QUERY, useNarrowWindow } from './useNarrowWindow';

/**
 * T250: below 1,024 px a dashboard is view mode only (direction.md §2). The
 * hook follows the window as it is resized, so Edit goes and comes back.
 */
function Probe() {
  return <p data-testid="narrow">{useNarrowWindow() ? 'narrow' : 'wide'}</p>;
}

function fakeWindow(matches: boolean) {
  const listeners = new Set<() => void>();
  const query = {
    matches,
    media: NARROW_QUERY,
    addEventListener: (_: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
  };
  vi.stubGlobal('matchMedia', (asked: string) => {
    expect(asked).toBe(NARROW_QUERY);
    return query;
  });
  return {
    resize(next: boolean) {
      query.matches = next;
      for (const listener of listeners) listener();
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useNarrowWindow (T250)', () => {
  it('asks for the width under 1,024 px and follows a resize both ways', () => {
    const window = fakeWindow(true);
    render(<Probe />);
    expect(screen.getByTestId('narrow').textContent).toBe('narrow');

    act(() => {
      window.resize(false);
    });
    expect(screen.getByTestId('narrow').textContent).toBe('wide');

    act(() => {
      window.resize(true);
    });
    expect(screen.getByTestId('narrow').textContent).toBe('narrow');
  });
});
