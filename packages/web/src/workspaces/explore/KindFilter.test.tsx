import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import type { CatalogItem } from './FolderContents';
import {
  KindFilter,
  captionOf,
  emptyTextOf,
  kindFrom,
  shownOf,
  sayShown,
  type ShownKind,
} from './KindFilter';

/**
 * T525 (AC-370; design 14, state I): Explore's Show filter over the open
 * folder: All, Dashboards and charts, Data sources, Models. The folder's
 * subfolders stay listed; only its items are filtered. A radio group, one
 * Tab stop, whose arrows move and choose.
 */
const item = (kind: CatalogItem['kind'], id: string): CatalogItem => ({
  kind,
  id,
  title: id,
  owner: null,
  updatedAt: '2026-09-30T10:00:00.000Z',
});
const LISTED = [
  item('folder', 'archive'),
  item('folder', 'dach'),
  item('dashboard', 'revenue'),
  item('chart', 'margin'),
  item('model', 'sales.yml'),
  item('data-source', 'emea_replica'),
];
const ids = (items: readonly CatalogItem[]) => items.map((each) => each.id);

describe('what each kind shows (T525, AC-370)', () => {
  it('lists the subfolders, then only the items of the kind chosen', () => {
    expect(ids(shownOf(LISTED, 'all'))).toEqual(ids(LISTED));
    expect(ids(shownOf(LISTED, 'dashboards'))).toEqual(['archive', 'dach', 'revenue', 'margin']);
    expect(ids(shownOf(LISTED, 'data-sources'))).toEqual(['archive', 'dach', 'emea_replica']);
    expect(ids(shownOf(LISTED, 'models'))).toEqual(['archive', 'dach', 'sales.yml']);
  });

  it('reads the kind from the address, All for anything else', () => {
    expect(kindFrom('models')).toBe('models');
    expect(kindFrom('data-sources')).toBe('data-sources');
    expect(kindFrom('dashboards')).toBe('dashboards');
    for (const asked of [undefined, '', 'all', 'charts', 7]) expect(kindFrom(asked)).toBe('all');
  });

  it('names the kind in the empty line, the caption and what is said', () => {
    expect(emptyTextOf('dashboards')).toBe('No dashboards or charts in this folder.');
    expect(emptyTextOf('data-sources')).toBe('No data sources in this folder.');
    expect(emptyTextOf('models')).toBe('No models in this folder.');
    expect(captionOf('all')).toBe('Contents of this folder');
    expect(captionOf('models')).toBe('Contents of this folder: models only');
    expect(captionOf('dashboards')).toBe('Contents of this folder: dashboards and charts only');
    expect(sayShown('models', shownOf(LISTED, 'models'))).toBe('Models: 1, and 2 folders');
    expect(sayShown('data-sources', [item('data-source', 'a')])).toBe('Data sources: 1');
    expect(sayShown('all', [item('folder', 'a'), item('chart', 'b'), item('chart', 'c')])).toBe(
      'All: 2, and 1 folder',
    );
  });
});

function Filtered({ start = 'all' as ShownKind }) {
  const [kind, setKind] = useState<ShownKind>(start);
  return (
    <>
      <button type="button">Before</button>
      <KindFilter kind={kind} onChange={setKind} />
      <output data-testid="chosen">{kind}</output>
    </>
  );
}

describe('the Show filter (T525; design 14, state I and keyboard)', () => {
  it('is a radio group labelled Show, starting where it is told', () => {
    render(<Filtered />);
    const group = screen.getByRole('radiogroup', { name: 'Show' });
    expect(group).not.toBeNull();
    // Its choices, in order.
    expect(screen.getAllByRole('radio')).toEqual(
      ['All', 'Dashboards and charts', 'Data sources', 'Models'].map((name) =>
        screen.getByRole('radio', { name }),
      ),
    );
    expect((screen.getByRole('radio', { name: 'All' }) as HTMLInputElement).checked).toBe(true);
  });

  it('chooses by click, and is one Tab stop whose arrows move and choose', async () => {
    render(<Filtered />);
    await userEvent.click(screen.getByRole('radio', { name: 'Models' }));
    expect(screen.getByTestId('chosen').textContent).toBe('models');
    await userEvent.click(screen.getByRole('button', { name: 'Before' }));
    await userEvent.tab();
    expect(document.activeElement).toBe(screen.getByRole('radio', { name: 'Models' }));
    await userEvent.keyboard('{ArrowLeft}');
    expect(screen.getByTestId('chosen').textContent).toBe('data-sources');
    expect(document.activeElement).toBe(screen.getByRole('radio', { name: 'Data sources' }));
  });
});
