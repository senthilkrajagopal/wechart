import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DashboardView } from '../DashboardView';
import type { DashboardDocument, Tile } from '../model/document';
import { LinkTile, webAddressProblem } from './LinkTile';

/**
 * T070 / AC-064: WHEN a link tile targets a dashboard, THE SYSTEM SHALL open
 * that dashboard, carrying the current filters when "pass the current
 * filters" is on; WHEN it targets a URL, THE SYSTEM SHALL accept only http and
 * https and open it in a new tab (direction.md rule 42).
 * Fails when: a non-http(s) URL is accepted, or the target dashboard opens
 * without the filters while the option is on.
 */
describe('a web address for a link', () => {
  it('is accepted as http or https', () => {
    expect(webAddressProblem('https://example.com/report')).toBeUndefined();
    expect(webAddressProblem('http://intranet.local:8080/a?b=c')).toBeUndefined();
    expect(webAddressProblem('  HTTPS://Example.com  ')).toBeUndefined();
  });

  it('is refused in any other form', () => {
    const refusal = 'Only http and https addresses can be linked to.';
    for (const address of [
      'javascript:alert(1)',
      'JavaScript:alert(1)',
      'file:///etc/passwd',
      'data:text/html,<script>alert(1)</script>',
      'ftp://example.com',
      'mailto:someone@example.com',
      '//example.com',
      'example.com',
    ])
      expect(webAddressProblem(address)).toBe(refusal);
    expect(webAddressProblem('')).toBe('Enter a web address.');
  });
});

const tile = (link: Tile['link'], text = 'Open report'): Tile => ({
  id: 't-link',
  kind: 'link',
  w: 3,
  text,
  ...(link === undefined ? {} : { link }),
});

describe('a link tile', () => {
  it('opens a web address in a new tab, telling it nothing of this page', () => {
    render(
      <LinkTile
        tile={tile({ target: { kind: 'url', url: 'https://example.com/report' } })}
        editing={false}
      />,
    );
    const link = screen.getByRole('link', { name: 'Open report' });
    expect(link.getAttribute('href')).toBe('https://example.com/report');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('is not a link to an address that is not http(s), however it got there', () => {
    render(
      <LinkTile
        tile={tile({ target: { kind: 'url', url: 'javascript:alert(1)' } })}
        editing={false}
      />,
    );
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('opens a dashboard with the current filters when told to pass them', () => {
    const carried = [
      {
        id: 'f1',
        member: 'orders.status',
        value: { kind: 'values', values: ['shipped'] } as const,
      },
    ];
    const { rerender } = render(
      <LinkTile
        tile={tile({ target: { kind: 'dashboard', dashboardId: 'd 2', passFilters: true } })}
        editing={false}
        carried={carried}
      />,
    );
    const href = screen.getByRole('link', { name: 'Open report' }).getAttribute('href') ?? '';
    const url = new URL(href, 'http://wechart.test');
    expect(url.pathname).toBe('/explore/dashboards/d%202');
    expect(JSON.parse(url.searchParams.get('filters') ?? 'null')).toEqual(carried);

    rerender(
      <LinkTile
        tile={tile({ target: { kind: 'dashboard', dashboardId: 'd 2', passFilters: false } })}
        editing={false}
        carried={carried}
      />,
    );
    expect(screen.getByRole('link', { name: 'Open report' }).getAttribute('href')).toBe(
      '/explore/dashboards/d%202',
    );
  });

  it('goes nowhere while the dashboard is being edited', () => {
    render(
      <LinkTile tile={tile({ target: { kind: 'url', url: 'https://example.com' } })} editing />,
    );
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText('Open report')).toBeTruthy();
  });
});

const DOC: DashboardDocument = {
  schemaVersion: 1,
  title: 'Home',
  settings: { width: 'full' },
  pages: [
    {
      id: 'p1',
      title: 'Overview',
      items: [{ id: 't-link', kind: 'link', w: 3, h: 7, text: 'Open dashboard' }],
    },
  ],
};

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).startsWith('/api/search'))
        return new Response(
          JSON.stringify([
            { kind: 'chart', id: 'c1', title: 'Sales chart' },
            { kind: 'dashboard', id: 'd-sales', title: 'Sales' },
          ]),
        );
      return new Response('{}', { status: 404 });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function properties() {
  const onSave = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <DashboardView dashboardId="d1" document={DOC} specs={{}} onSave={onSave} />
    </QueryClientProvider>,
  );
  await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
  fireEvent.click(document.querySelector('[data-tile="t-link"]') as HTMLElement);
  const sidebar = screen.getByRole('complementary', { name: 'Edit sidebar' });
  await userEvent.click(within(sidebar).getByRole('tab', { name: 'Properties' }));
  return { sidebar, onSave };
}

const savedLink = (onSave: ReturnType<typeof vi.fn>) =>
  ((onSave.mock.calls[0] as [DashboardDocument])[0].pages[0]?.items[0] as Tile).link;

describe('a link tile’s properties', () => {
  it('refuse a web address that is not http(s), and keep one that is', async () => {
    const { sidebar, onSave } = await properties();
    await userEvent.selectOptions(within(sidebar).getByLabelText('Goes to'), 'url');
    const address = within(sidebar).getByLabelText('Web address');

    await userEvent.type(address, 'javascript:alert(1)');
    await userEvent.tab();
    expect(within(sidebar).getByRole('alert').textContent).toBe(
      'Only http and https addresses can be linked to.',
    );

    await userEvent.clear(address);
    await userEvent.type(address, 'https://example.com/report');
    await userEvent.tab();
    expect(within(sidebar).queryByRole('alert')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(savedLink(onSave)?.target).toEqual({ kind: 'url', url: 'https://example.com/report' });
  });

  it('choose a dashboard — only dashboards are offered — and whether to pass the filters', async () => {
    const { sidebar, onSave } = await properties();
    await userEvent.type(within(sidebar).getByLabelText('Find a dashboard'), 'Sa');
    const offered = within(
      await within(sidebar).findByRole('listbox', { name: 'Dashboards found' }),
    ).getAllByRole('option');
    expect(offered.map((option) => option.textContent)).toEqual(['Sales']);
    await userEvent.click(offered[0] as HTMLElement);
    await userEvent.click(within(sidebar).getByLabelText('Pass the current filters'));
    await userEvent.selectOptions(within(sidebar).getByLabelText('Style'), 'primary');

    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(savedLink(onSave)).toEqual({
      style: 'primary',
      target: { kind: 'dashboard', dashboardId: 'd-sales', title: 'Sales', passFilters: true },
    });
  });
});

describe('found at T070’s review', () => {
  it('carries only the filters in effect, not every value held', () => {
    /**
     * A value held for a filter that cannot use it — kept for Undo, or left
     * from a URL — was carried to the target, which then opened filtered by
     * something this dashboard was not showing.
     */
    const withFilters: DashboardDocument = {
      ...DOC,
      pages: [
        {
          id: 'p1',
          title: 'Overview',
          items: [
            {
              id: 't-link',
              kind: 'link',
              w: 3,
              h: 7,
              text: 'Open dashboard',
              link: { target: { kind: 'dashboard', dashboardId: 'd-2', passFilters: true } },
            },
          ],
        },
      ],
      filters: [
        { id: 'f-amount', widget: 'range', member: 'orders.amount' },
        { id: 'f-status', widget: 'checkbox', member: 'orders.status' },
        { id: 'f-region', widget: 'checkbox', member: 'orders.region' },
      ],
    };
    render(
      <QueryClientProvider client={new QueryClient()}>
        <DashboardView
          dashboardId="d1"
          document={withFilters}
          specs={{}}
          onSave={vi.fn()}
          urlFilterValues={{
            // Not a range: held, but it cannot filter a range filter.
            'f-amount orders.amount': { kind: 'values', values: ['10'] },
            'f-status orders.status': { kind: 'values', values: ['shipped'] },
            // Nothing picked: no filter at all.
            'f-region orders.region': { kind: 'values', values: [] },
          }}
        />
      </QueryClientProvider>,
    );

    const href = screen.getByRole('link', { name: 'Open dashboard' }).getAttribute('href') ?? '';
    const carried = new URL(href, 'http://wechart.test').searchParams.get('filters');
    expect(JSON.parse(carried ?? 'null')).toEqual([
      { id: 'f-status', member: 'orders.status', value: { kind: 'values', values: ['shipped'] } },
    ]);
  });

  it('draws a malformed stored link as text rather than failing the dashboard', () => {
    for (const target of [
      null,
      { kind: 'url' },
      { kind: 'url', url: 42 },
      { kind: 'dashboard' },
      { kind: 'somewhere' },
    ]) {
      const { unmount } = render(
        <LinkTile tile={tile({ target } as unknown as Tile['link'])} editing={false} />,
      );
      expect(screen.queryByRole('link')).toBeNull();
      expect(screen.getByText('Open report')).toBeTruthy();
      unmount();
    }
  });

  it('links to the address it accepted, not to the text as typed', () => {
    // "http:evil.com" parses as http://evil.com/, but as an href the browser
    // resolves it against wechart's own page.
    render(
      <LinkTile tile={tile({ target: { kind: 'url', url: 'http:evil.com' } })} editing={false} />,
    );
    expect(screen.getByRole('link', { name: 'Open report' }).getAttribute('href')).toBe(
      'http://evil.com/',
    );
  });

  it('forgets the old target when where it goes to changes', async () => {
    const linked: DashboardDocument = {
      ...DOC,
      pages: [
        {
          id: 'p1',
          title: 'Overview',
          items: [
            {
              id: 't-link',
              kind: 'link',
              w: 3,
              h: 7,
              text: 'Open dashboard',
              link: { target: { kind: 'url', url: 'https://example.com/' } },
            },
          ],
        },
      ],
    };
    const onSave = vi.fn();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <DashboardView dashboardId="d1" document={linked} specs={{}} onSave={onSave} />
      </QueryClientProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.click(document.querySelector('[data-tile="t-link"]') as HTMLElement);
    const sidebar = screen.getByRole('complementary', { name: 'Edit sidebar' });
    await userEvent.click(within(sidebar).getByRole('tab', { name: 'Properties' }));

    // The panel said "No dashboard chosen yet." while the tile still opened
    // the web address.
    await userEvent.selectOptions(within(sidebar).getByLabelText('Goes to'), 'dashboard');
    await userEvent.click(screen.getByRole('button', { name: /^Save/ }));

    expect(savedLink(onSave)?.target).toBeUndefined();
  });
});
