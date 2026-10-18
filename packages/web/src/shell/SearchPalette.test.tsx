import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render as rtlRender, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SearchPalette } from './SearchPalette';

/** The palette queries the search API, so it renders inside a query client. */
function render(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return rtlRender(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

/**
 * AC-006: WHEN the user presses ⌘K or Ctrl+K anywhere in the application, THE
 * SYSTEM SHALL open the search palette with keyboard focus in its input.
 * Fails when: after the shortcut, focus is not inside the palette input, or the
 * palette does not open.
 *
 * "Anywhere in the application" is the part worth testing hardest: the
 * shortcut has to work while focus sits in another control, which is exactly
 * where a naive implementation drops it.
 */
describe('search palette (AC-006)', () => {
  it('is closed until the shortcut is pressed', () => {
    render(<SearchPalette />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('opens on Meta+K with focus in the input', async () => {
    render(<SearchPalette />);

    await userEvent.keyboard('{Meta>}k{/Meta}');

    const input = screen.getByRole('combobox');
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(document.activeElement).toBe(input);
  });

  it('opens on Control+K with focus in the input', async () => {
    render(<SearchPalette />);

    await userEvent.keyboard('{Control>}k{/Control}');

    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole('combobox'));
  });

  it('opens while focus is inside another control', async () => {
    render(
      <>
        <input aria-label="elsewhere" />
        <SearchPalette />
      </>,
    );

    const elsewhere = screen.getByLabelText('elsewhere');
    await userEvent.click(elsewhere);
    expect(document.activeElement).toBe(elsewhere);

    await userEvent.keyboard('{Control>}k{/Control}');

    expect(document.activeElement).toBe(screen.getByRole('combobox'));
  });

  it('closes on Escape and gives focus back to where it was', async () => {
    render(
      <>
        <button type="button">before</button>
        <SearchPalette />
      </>,
    );

    const before = screen.getByRole('button', { name: 'before' });
    await userEvent.click(before);
    await userEvent.keyboard('{Control>}k{/Control}');
    expect(screen.getByRole('dialog')).toBeTruthy();

    await userEvent.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).toBeNull();
    // Losing the caller's place would make the shortcut hostile to keyboard use.
    expect(document.activeElement).toBe(before);
  });

  it('keeps Tab inside it, not on the page under it (T182, AC-176)', async () => {
    render(
      <>
        <SearchPalette />
        <button type="button">Under the palette</button>
      </>,
    );
    await userEvent.keyboard('{Control>}k{/Control}');
    const dialog = screen.getByRole('dialog');

    for (const shift of [false, false, true, true, true]) {
      await userEvent.tab({ shift });
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
  });

  it('does not open on K alone', async () => {
    render(<SearchPalette />);

    await userEvent.keyboard('k');

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('is labelled, so it is announced when it opens', async () => {
    render(<SearchPalette />);

    await userEvent.keyboard('{Control>}k{/Control}');

    const dialog = screen.getByRole('dialog');
    expect(
      dialog.getAttribute('aria-label') ?? dialog.getAttribute('aria-labelledby'),
    ).toBeTruthy();
    expect(dialog.getAttribute('aria-modal')).toBe('true');
  });
});

/**
 * T815 (AC-460): the palette asks for the user's own saved queries, which
 * the API answers to their owner alone, and lists the matching ones as
 * "Saved query".
 */
/**
 * AC-191: the arrows move the active result, which the input names. The
 * answers arrive at different moments, and the catalog's rows come first, so
 * the rows move under a choice already made: the input must go on naming the
 * same result, by the same id, rather than whatever row now sits where it was.
 */
describe('the active result as answers arrive (AC-191)', () => {
  // jsdom lays nothing out, so it has no scrollIntoView to keep the active row in sight.
  const had = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollIntoView');
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    if (had === undefined) delete (Element.prototype as Partial<Element>).scrollIntoView;
    else Object.defineProperty(Element.prototype, 'scrollIntoView', had);
  });

  it('keeps naming the chosen result, by the same id, when the catalog answers after the first ↓', async () => {
    let answer: (hits: unknown) => void = () => undefined;
    const searched = new Promise<unknown>((resolve) => {
      answer = resolve;
    });
    const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url === '/api/model/files')
          return Promise.resolve(
            json({
              files: [
                { path: 'cubes/orders.yml', kind: 'yaml' },
                { path: 'cubes/monthly_orders.yml', kind: 'yaml' },
              ],
            }),
          );
        if (url.startsWith('/api/search')) return searched.then(json);
        return Promise.resolve(new Response('{}', { status: 404 }));
      }),
    );
    render(<SearchPalette />);
    await userEvent.keyboard('{Control>}k{/Control}');
    const input = screen.getByRole('combobox');
    await userEvent.type(input, 'orders');
    await screen.findByRole('option', { name: /cubes\/orders\.yml/ });

    await userEvent.keyboard('{ArrowDown}');
    const first = input.getAttribute('aria-activedescendant') ?? '';
    expect(document.getElementById(first)?.textContent).toBe('Model filecubes/orders.yml');

    // The catalog answers: its row comes first, above the files.
    answer([{ kind: 'dashboard', id: 'd1', title: 'Orders overview' }]);
    await screen.findByRole('option', { name: /Orders overview/ });
    expect(input.getAttribute('aria-activedescendant')).toBe(first);
    expect(document.getElementById(first)?.textContent).toBe('Model filecubes/orders.yml');
    expect(document.getElementById(first)?.getAttribute('aria-selected')).toBe('true');

    await userEvent.keyboard('{ArrowDown}');
    const next = input.getAttribute('aria-activedescendant') ?? '';
    expect(document.getElementById(next)?.textContent).toBe('Model filecubes/monthly_orders.yml');
    await userEvent.keyboard('{ArrowUp}');
    expect(input.getAttribute('aria-activedescendant')).toBe(first);
  });
});

describe('saved queries in the palette (T815, AC-460)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('lists the user’s matching saved query, labelled "Saved query", opening it in the workspace', async () => {
    const asked: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        asked.push(url);
        const json = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
        if (url === '/api/sql/saved')
          return json({
            queries: [
              {
                id: 'q-top',
                name: 'Top EMEA orders',
                description: '',
                sourceId: 'emea',
                sourceName: 'emea_replica',
                sql: 'SELECT 1',
                parameters: [],
              },
            ],
          });
        if (url.startsWith('/api/search')) return json([]);
        return Promise.resolve(new Response('{}', { status: 404 }));
      }),
    );
    render(<SearchPalette />);
    await userEvent.keyboard('{Control>}k{/Control}');
    await userEvent.type(screen.getByRole('combobox'), 'emea');

    const option = await screen.findByRole('option', { name: /Top EMEA orders/ });
    expect(option.textContent).toBe('Saved queryTop EMEA ordersemea_replica');
    expect(option.getAttribute('data-href')).toBe('/sql?saved=q-top');
    expect(asked).toContain('/api/sql/saved');
  });
});
