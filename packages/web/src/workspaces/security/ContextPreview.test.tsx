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
    expect(readContext('{"wechartDraft": "x"}')).toEqual({
      problem: 'wechart sets wechartDraft itself when it signs the token: remove it.',
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
});
