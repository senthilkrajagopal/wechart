import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BoundarySetUpload } from './BoundarySetUpload';

/**
 * T979 / AC-628: … uploads a custom boundary set … SHALL accept only GeoJSON
 * whose features are polygons or multipolygons, each holding the key
 * property named at upload with a value unique in the set, refusing anything
 * else and naming the first feature that fails; … landing it in the folder
 * only through a proposal.
 *
 * The upload page: Name, Key property and the file; checked before it is
 * sent, then into My workspace, then proposed to the folder.
 */
const square = (key: string, at: number) => ({
  type: 'Feature',
  properties: { territory_id: key },
  geometry: { type: 'Polygon', coordinates: [[[at, 0], [at + 1, 0], [at + 1, 1], [at, 0]]] },
});

const fileOf = (geojson: unknown) =>
  new File([JSON.stringify(geojson)], 'territories.geojson', { type: 'application/geo+json' });

afterEach(() => {
  vi.unstubAllGlobals();
});

async function fill(geojson: unknown) {
  await userEvent.type(screen.getByRole('textbox', { name: 'Name' }), 'Sales territories');
  await userEvent.type(screen.getByRole('textbox', { name: 'Key property' }), 'territory_id');
  fireEvent.change(screen.getByLabelText('GeoJSON file'), { target: { files: [fileOf(geojson)] } });
}

describe('uploading a boundary set (AC-628)', () => {
  it('names the first feature that fails, sending nothing', async () => {
    const fetching = vi.fn();
    vi.stubGlobal('fetch', fetching);
    render(<BoundarySetUpload folderId="sales" />);
    await fill({
      type: 'FeatureCollection',
      features: [square('Atlantic', 0), square('Atlantic', 1)],
    });
    await userEvent.click(screen.getByRole('button', { name: 'Upload to My workspace' }));
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Feature 2 ("Atlantic") has the same "territory_id" as feature 1: each key must be unique.',
    );
    expect(fetching).not.toHaveBeenCalled();
  });

  it('uploads into My workspace, to go to the folder, then proposes it', async () => {
    const fetching = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/boundary-sets') {
        expect(JSON.parse(String(init?.body))).toMatchObject({
          name: 'Sales territories',
          keyProperty: 'territory_id',
          targetFolderId: 'sales',
        });
        return new Response(
          JSON.stringify({ id: 'set-1', name: 'Sales territories', keyProperty: 'territory_id', regions: 2 }),
          { status: 201 },
        );
      }
      return new Response(JSON.stringify({ id: 'proposal-1' }), { status: 201 });
    });
    vi.stubGlobal('fetch', fetching);
    render(<BoundarySetUpload folderId="sales" />);
    await fill({ type: 'FeatureCollection', features: [square('Atlantic', 0), square('Gulf', 1)] });
    await userEvent.click(screen.getByRole('button', { name: 'Upload to My workspace' }));
    expect((await screen.findByTestId('boundary-set-uploaded')).textContent).toContain(
      'Sales territories is in My workspace: 2 regions.',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Propose to the folder' }));
    await waitFor(() =>
      expect(screen.getByTestId('boundary-set-proposed').textContent).toContain(
        'Proposed. It reaches the folder once a reviewer approves it.',
      ),
    );
    expect(fetching).toHaveBeenLastCalledWith('/api/proposals', expect.objectContaining({ method: 'POST' }));
  });
});
