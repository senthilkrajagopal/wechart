import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DashboardView } from '../DashboardView';
import type { DashboardDocument } from '../model/document';
import { ImageTile } from './ImageTile';

/**
 * T069 / AC-063: WHEN an image tile has no alternative text, THE SYSTEM SHALL
 * show a warning on the tile in edit mode, and SHALL accept only PNG, JPEG,
 * WebP, GIF and SVG files of at most 2 MB (direction.md rule 42).
 * Fails when: a tile without alt text shows no warning, or a file of another
 * type or over 2 MB is accepted.
 */
describe('an image tile', () => {
  it('warns in edit mode while it has no alternative text', () => {
    render(<ImageTile tile={{ id: 't', kind: 'image', w: 4, imageId: 'i1' }} editing />);
    expect(screen.getByTestId('image-alt-missing').textContent).toBe('⚠ No alternative text');
  });

  it('does not warn once it has alternative text, nor in view mode', () => {
    const { rerender } = render(
      <ImageTile tile={{ id: 't', kind: 'image', w: 4, imageId: 'i1', alt: 'Logo' }} editing />,
    );
    expect(screen.queryByTestId('image-alt-missing')).toBeNull();

    rerender(<ImageTile tile={{ id: 't', kind: 'image', w: 4, imageId: 'i1' }} editing={false} />);
    expect(screen.queryByTestId('image-alt-missing')).toBeNull();
  });

  it('shows its image with its alternative text, fitted as set', () => {
    render(
      <ImageTile
        tile={{ id: 't', kind: 'image', w: 4, imageId: 'i1', alt: 'Logo', fit: 'cover' }}
        editing={false}
      />,
    );
    const image = screen.getByRole('img', { name: 'Logo' });
    expect(image.getAttribute('src')).toBe('/api/images/i1');
    expect(image.className).toContain('image-tile__image--cover');
  });
});

const DOC: DashboardDocument = {
  schemaVersion: 1,
  title: 'Brand',
  settings: { width: 'full' },
  pages: [{ id: 'p1', title: 'Overview', items: [{ id: 't-img', kind: 'image', w: 4, h: 20 }] }],
};

let posted: { contentType: string; data: string }[] = [];
/** Held uploads' releases, while set. */
let holding: (() => void)[] | undefined;

beforeEach(() => {
  posted = [];
  holding = undefined;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === '/api/dashboards/d1/images') {
        posted.push(JSON.parse(String(init?.body)) as { contentType: string; data: string });
        if (holding !== undefined) {
          const held = holding;
          await new Promise<void>((release) => {
            held.push(release);
          });
        }
        return new Response(JSON.stringify({ id: 'img-1', contentType: 'image/png', size: 11 }), {
          status: 201,
        });
      }
      return new Response('{}', { status: 404 });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function dashboard() {
  const onSave = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <DashboardView dashboardId="d1" document={DOC} specs={{}} onSave={onSave} />
    </QueryClientProvider>,
  );
  return onSave;
}

async function openProperties() {
  await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
  fireEvent.click(document.querySelector('[data-tile="t-img"]') as HTMLElement);
  const sidebar = screen.getByRole('complementary', { name: 'Edit sidebar' });
  await userEvent.click(within(sidebar).getByRole('tab', { name: 'Properties' }));
  return sidebar;
}

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

describe('an image tile’s properties', () => {
  it('refuse a file of another type, and one over 2 MB, before sending anything', async () => {
    dashboard();
    const sidebar = await openProperties();
    const input = within(sidebar).getByLabelText('Image file');

    await userEvent.upload(
      input,
      new File(['%PDF-1.7'], 'report.pdf', { type: 'application/pdf' }),
      { applyAccept: false },
    );
    expect((await within(sidebar).findByRole('alert')).textContent).toBe(
      'Only PNG, JPEG, WebP, GIF and SVG images can be added.',
    );

    const big = new Uint8Array(2_000_001);
    big.set(PNG);
    await userEvent.upload(input, new File([big], 'huge.png', { type: 'image/png' }));
    expect((await within(sidebar).findByRole('alert')).textContent).toBe(
      'Images can be at most 2 MB; this one is 2.0 MB.',
    );
    expect(posted).toEqual([]);
  });

  it('add an accepted image to the tile, and take its alternative text', async () => {
    const onSave = dashboard();
    const sidebar = await openProperties();
    const tile = document.querySelector('[data-tile="t-img"]') as HTMLElement;
    expect(within(tile).getByTestId('image-alt-missing')).toBeTruthy();

    await userEvent.upload(
      within(sidebar).getByLabelText('Image file'),
      new File([PNG], 'logo.png', { type: 'image/png' }),
    );
    await vi.waitFor(() => {
      expect(posted).toHaveLength(1);
    });
    expect(posted[0]?.contentType).toBe('image/png');
    // Not by role: with no alternative text yet, an image is presentational.
    await vi.waitFor(() => {
      expect(tile.querySelector('img')?.getAttribute('src')).toBe('/api/images/img-1');
    });

    await userEvent.type(within(sidebar).getByLabelText('Alternative text'), 'Company logo');
    expect(within(tile).queryByTestId('image-alt-missing')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    const saved = (onSave.mock.calls[0] as [DashboardDocument])[0];
    const kept = saved.pages[0]?.items[0] as { imageId?: string; alt?: string };
    expect([kept.imageId, kept.alt]).toEqual(['img-1', 'Company logo']);
  });

  /**
   * Found by T069's review: the upload's answer was applied to the dashboard
   * as it was when the file was chosen, so anything changed while it was on
   * its way — alternative text typed meanwhile — was undone when it landed.
   */
  it('keep what was changed while the image was on its way', async () => {
    const onSave = dashboard();
    const sidebar = await openProperties();
    holding = [];

    await userEvent.upload(
      within(sidebar).getByLabelText('Image file'),
      new File([PNG], 'logo.png', { type: 'image/png' }),
    );
    await vi.waitFor(() => {
      expect(holding).toHaveLength(1);
    });
    await userEvent.type(within(sidebar).getByLabelText('Alternative text'), 'Company logo');
    for (const release of holding) release();

    const tile = document.querySelector('[data-tile="t-img"]') as HTMLElement;
    await vi.waitFor(() => {
      expect(tile.querySelector('img')?.getAttribute('src')).toBe('/api/images/img-1');
    });
    expect(within(sidebar).getByLabelText('Alternative text')).toHaveProperty(
      'value',
      'Company logo',
    );

    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    const saved = (onSave.mock.calls[0] as [DashboardDocument])[0];
    const kept = saved.pages[0]?.items[0] as { imageId?: string; alt?: string };
    expect([kept.imageId, kept.alt]).toEqual(['img-1', 'Company logo']);
  });
});
