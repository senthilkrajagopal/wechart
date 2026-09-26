import { addMarking, defaultMarkings } from '@wechart/core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { DashboardDocument } from '../model/document';
import { MarkingsSettings } from './MarkingsSettings';

/**
 * T386, AC-093: WHILE a marking is in range mode, THE SYSTEM SHALL let the
 * user drag along an axis to mark a continuous range. Settings › Markings is
 * where a marking is put in range mode, one marking at a time, as Spotfire's
 * "Marking mode" is set per marking (references-markings.md).
 */
const DASHBOARD = {
  title: 'Sales',
  pages: [],
  markings: addMarking(defaultMarkings()),
} as unknown as DashboardDocument;

describe('a marking’s mode in Settings › Markings (T386, AC-093)', () => {
  it('offers items or range for each marking, items to begin with, and changes only the one set', async () => {
    const onChange = vi.fn();
    render(<MarkingsSettings document={DASHBOARD} onChange={onChange} />);

    // Spotfire's words, which R7 keeps: "Marking mode > Range-based".
    const first = screen.getByRole('combobox', { name: 'Marking mode of Marking' });
    const second = screen.getByRole('combobox', { name: 'Marking mode of Marking 2' });
    expect((first as HTMLSelectElement).value).toBe('items');
    expect((second as HTMLSelectElement).value).toBe('items');
    expect([...(first as HTMLSelectElement).options].map((option) => option.text)).toEqual([
      'Items',
      'Range-based',
    ]);

    await userEvent.selectOptions(second, 'range');
    const next = onChange.mock.lastCall?.[0] as DashboardDocument;
    expect(next.markings?.map((marking) => marking.mode ?? 'items')).toEqual(['items', 'range']);
  });
});
