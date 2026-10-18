import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BackToFolder } from './BackToFolder';

/**
 * T830 (AC-485, AC-195; design 19 pin 1, 19-Q9): the compact row begins with
 * a one-step way back, "← ‹folder›", whose accessible name and tooltip give
 * the whole path, and which opens Explore on that folder.
 */
const FOLDERS = [
  { id: 'sales', title: 'Sales', parentId: null },
  { id: 'emea', title: 'EMEA', parentId: 'sales' },
];

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) =>
      String(input) === '/api/folders'
        ? new Response(JSON.stringify(FOLDERS))
        : new Response('null', { status: 404 }),
    ),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the way back', () => {
  it('names its folder, gives the whole path as its name and tooltip, and opens Explore on it', async () => {
    render(<BackToFolder folderId="emea" />);

    const back = await screen.findByRole('link', { name: 'Back to Shared / Sales / EMEA' });
    expect(back.textContent).toBe('← EMEA');
    expect(back.getAttribute('title')).toBe('Back to Shared / Sales / EMEA');
    expect(back.getAttribute('href')).toBe('/explore?folder=emea');
  });

  it('names Shared for a dashboard in the shared root', async () => {
    render(<BackToFolder folderId="root" />);

    const back = await screen.findByRole('link', { name: 'Back to Shared' });
    expect(back.textContent).toBe('← Shared');
    expect(back.getAttribute('href')).toBe('/explore');
  });

  it('leads to Shared from a folder deleted since, saying so', async () => {
    render(<BackToFolder folderId="gone" />);

    const back = await screen.findByRole('link', { name: 'Back to Shared' });
    expect(back.textContent).toBe('← Shared');
    expect(back.getAttribute('href')).toBe('/explore');
  });
});
