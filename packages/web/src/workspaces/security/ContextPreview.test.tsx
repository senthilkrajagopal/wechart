import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ContextPreview, previewHref, readContext } from './ContextPreview';

describe('readContext', () => {
  it('reads a JSON object as the context to preview', () => {
    expect(readContext('{"groups": ["sales"], "is_employee": true}')).toEqual({
      context: { groups: ['sales'], is_employee: true },
    });
  });

  it('refuses text that is not JSON, saying where', () => {
    expect(readContext('{"groups": ')).toEqual({
      problem: expect.stringMatching(/^Not JSON: /) as unknown as string,
    });
  });

  it('refuses JSON that is not an object', () => {
    expect(readContext('["sales"]')).toEqual({ problem: 'A security context is a JSON object.' });
    expect(readContext('null')).toEqual({ problem: 'A security context is a JSON object.' });
  });

  it('refuses the keys wechart sets itself, since they would not be what runs', () => {
    expect(readContext('{"exp": 1, "groups": []}')).toEqual({
      problem: 'wechart sets exp itself when it signs the token: remove it.',
    });
    expect(readContext('{"wechartModel": "x"}')).toEqual({
      problem: 'wechart sets wechartModel itself when it signs the token: remove it.',
    });
    // Claims a model may filter on are the context's own.
    expect(readContext('{"sub": "rep-7"}')).toEqual({ context: { sub: 'rep-7' } });
  });

  it('refuses groups that are not a list of names, which Cube would read as none', () => {
    expect(readContext('{"groups": "sales"}')).toEqual({
      problem: 'groups is a list of group names, such as ["sales"].',
    });
    expect(readContext('{"groups": ["sales", 1]}')).toEqual({
      problem: 'groups is a list of group names, such as ["sales"].',
    });
  });
});

describe('previewHref', () => {
  it('opens the dashboard with the context in its address', () => {
    expect(previewHref('d 1', { groups: ['sales'] })).toBe(
      `/explore/dashboards/d%201?preview=${encodeURIComponent('{"groups":["sales"]}')}`,
    );
  });
});

describe('ContextPreview', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    // The context is kept for the session (AC-232): one test's must not be
    // the next one's.
    window.sessionStorage.clear();
  });

  it('links each dashboard found to its preview under the context entered', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json([
          { kind: 'dashboard', id: 'd1', title: 'Sales review' },
          { kind: 'chart', id: 'c1', title: 'Sales by month' },
        ]),
      ),
    );
    const user = userEvent.setup();
    render(<ContextPreview groups={['managers', 'sales']} />);

    const context = screen.getByLabelText('Security context (JSON)');
    await user.clear(context);
    await user.click(context);
    await user.paste('{"groups": ["sales"]}');
    await user.type(screen.getByLabelText('Find a dashboard'), 'Sales');

    const link = await screen.findByRole('link', { name: 'Preview Sales review' });
    expect(link.getAttribute('href')).toBe(previewHref('d1', { groups: ['sales'] }));
    // Dashboards only: a chart is not previewed on its own.
    expect(screen.queryByRole('link', { name: 'Preview Sales by month' })).toBeNull();
    // The groups the policies name, to write the context against.
    expect(screen.getByText(/managers, sales/)).toBeTruthy();
  });

  it('offers no preview while the context cannot be read, and says why', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json([{ kind: 'dashboard', id: 'd1', title: 'Sales review' }])),
    );
    const user = userEvent.setup();
    render(<ContextPreview groups={[]} />);

    const context = screen.getByLabelText('Security context (JSON)');
    await user.clear(context);
    await user.click(context);
    await user.paste('[1]');
    await user.type(screen.getByLabelText('Find a dashboard'), 'Sales');

    expect(await screen.findByText('A security context is a JSON object.')).toBeTruthy();
    expect(context.getAttribute('aria-invalid')).toBe('true');
    expect(screen.queryByRole('link', { name: 'Preview Sales review' })).toBeNull();
  });

  /**
   * T241 / AC-232: … start a dashboard preview from a bounded list of
   * dashboards that says when nothing matches …
   * `Fails when: … a search with no match shows nothing …`
   */
  it('lists at most eight dashboards, asking for dashboards alone, and says when more match', async () => {
    const asked: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        asked.push(url);
        return Response.json(
          Array.from({ length: 9 }, (_, index) => ({
            kind: 'dashboard',
            id: `d${String(index)}`,
            title: `Sales ${String(index)}`,
          })),
        );
      }),
    );
    const user = userEvent.setup();
    render(<ContextPreview groups={[]} />);
    await user.type(screen.getByLabelText('Find a dashboard'), 'Sales');

    await screen.findByRole('link', { name: 'Preview Sales 0' });
    expect(screen.getAllByRole('link', { name: /^Preview Sales/ })).toHaveLength(8);
    expect(screen.getByText('More dashboards match: narrow the search.')).toBeTruthy();
    // Dashboards alone, and one more than shown — so "more" is known, not guessed.
    expect(asked.at(-1)).toBe('/api/search?q=Sales&kind=dashboard&limit=9');
  });

  it('says a search that failed failed, rather than that nothing matched', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('down', { status: 500 })),
    );
    const user = userEvent.setup();
    render(<ContextPreview groups={[]} />);
    await user.type(screen.getByLabelText('Find a dashboard'), 'Sales');

    expect(await screen.findByText('The search failed (HTTP 500).')).toBeTruthy();
    expect(screen.queryByTestId('preview-no-match')).toBeNull();
  });

  it('says which files it could not read, whose cubes and views it cannot list', () => {
    render(<ContextPreview groups={[]} unread={['cubes/product_catalog.yml (Jinja)']} />);
    expect(
      screen.getByText(
        'Not read here: cubes/product_catalog.yml (Jinja). Cubes and views defined there are not listed.',
      ),
    ).toBeTruthy();
  });
});
