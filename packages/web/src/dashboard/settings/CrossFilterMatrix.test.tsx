import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { Interactions } from '@wechart/core';

import type { DashboardDocument } from '../model/document';
import { CrossFilterMatrix } from './CrossFilterMatrix';

/**
 * T887 / AC-523: THE SYSTEM SHALL make a Text tile a cross-filter target like
 * any tile, set to Filter or None, with Highlight shown disabled with "Text
 * has no marks to highlight", and never a source.
 * `Fails when: Highlight can be chosen for a Text tile, or a Text tile is
 * offered as a source …`
 */
const DOC: DashboardDocument = {
  schemaVersion: 1,
  title: 'Sales',
  settings: { width: 'fixed' },
  pages: [
    {
      id: 'p1',
      title: 'Overview',
      items: [
        { id: 'bars', kind: 'chart', w: 6, h: 40, chartId: 'c1' },
        { id: 'line', kind: 'chart', w: 6, h: 40, chartId: 'c2' },
        {
          id: 'note',
          kind: 'text',
          w: 6,
          h: 12,
          document: {
            version: 1,
            doc: {
              type: 'doc',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Summary' }] }],
            },
          },
        },
      ],
    },
  ],
};
const TITLES: Record<string, string> = { c1: 'By status', c2: 'By month' };

function shown(interactions: Interactions) {
  const onChange = vi.fn();
  render(
    <CrossFilterMatrix
      document={DOC}
      interactions={interactions}
      onChange={onChange}
      titleOf={(id) => TITLES[id]}
    />,
  );
  return { onChange, table: screen.getByRole('table') };
}

describe('a Text tile in the cross-filter matrix (T887, AC-523)', () => {
  it('is a target column, never a source row', () => {
    const { table } = shown({ mode: 'crossFilter', crossFilter: { defaultAction: 'filter' } });
    const columns = within(table)
      .getAllByRole('columnheader')
      .map((cell) => cell.textContent);
    // A Text tile named by its first line, as everywhere a tile is named.
    expect(columns).toEqual(['Source ↓ · Target →', 'By status', 'By month', 'text: Summary']);
    const rows = within(table)
      .getAllByRole('rowheader')
      .map((cell) => cell.textContent);
    expect(rows).toEqual(['By status', 'By month']);
  });

  it('offers Filter and None, Highlight disabled with its reason', async () => {
    const { onChange } = shown({ mode: 'crossFilter', crossFilter: { defaultAction: 'filter' } });
    const cell = screen.getByRole('combobox', { name: 'By status to text: Summary' });
    // The reason is the option's own words, read and shown wherever it is (checkpoint 2).
    const highlight = within(cell).getByRole('option', {
      name: 'Highlight: Text has no marks to highlight',
    });
    expect((highlight as HTMLOptionElement).disabled).toBe(true);
    expect(highlight.textContent).toBe('Highlight: Text has no marks to highlight');
    expect(
      within(cell)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['Filter', 'Highlight: Text has no marks to highlight', 'None']);
    await userEvent.selectOptions(cell, 'None');
    expect(onChange).toHaveBeenCalledWith({
      defaultAction: 'filter',
      pairs: { 'bars>note': 'none' },
    });
  });

  it('reads Filter where the dashboard’s default is Highlight, which Text can’t take', () => {
    shown({ mode: 'crossFilter', crossFilter: { defaultAction: 'highlight' } });
    expect(
      (screen.getByRole('combobox', { name: 'By status to text: Summary' }) as HTMLSelectElement)
        .value,
    ).toBe('filter');
    expect(
      (screen.getByRole('combobox', { name: 'By status to By month' }) as HTMLSelectElement).value,
    ).toBe('highlight');
  });
});
