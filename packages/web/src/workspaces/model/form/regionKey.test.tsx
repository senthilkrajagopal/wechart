import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ObjectForm } from './ObjectForm';
import { SCHEMA } from './schema';

/**
 * T974 (AC-623): … unless the model marks it otherwise, a dimension the model
 * marks as a set's key counting whatever its values and one it marks as not a
 * key never counting, as AC-313 does for Countries.
 *
 * The model marks it in the dimension's `meta`, as `wechart.regionKey`: the
 * set's id, or false. Countries keeps AC-313's own Country code setting.
 */
const form = (value: Record<string, unknown>) => {
  const onChange = vi.fn();
  render(<ObjectForm schema={SCHEMA['Y.6']} value={value} onChange={onChange} />);
  return onChange;
};

const setting = () => screen.getByRole('combobox', { name: 'Region key' });

describe('marking a dimension as a region key (T974, AC-623)', () => {
  it('offers the choices on a string dimension, under Geography, unmarked by default', () => {
    form({ name: 'state', sql: 'state', type: 'string' });
    const geography = screen.getByRole('group', { name: 'Geography' });
    const select = within(geography).getByRole('combobox', { name: 'Region key' });
    expect(
      within(select)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual([
      'Decided by its values',
      'Admin-1 (ISO 3166-2 codes or English names)',
      'Not a region key',
    ]);
    expect((select as HTMLSelectElement).value).toBe('');
  });

  it('sets the mark in the dimension’s meta, keeping what else it holds', async () => {
    const onChange = form({
      name: 'state',
      sql: 'state',
      type: 'string',
      meta: { owner: 'finance', wechart: { note: 'kept' } },
    });
    await userEvent.selectOptions(setting(), 'Admin-1 (ISO 3166-2 codes or English names)');
    expect(onChange).toHaveBeenLastCalledWith({
      name: 'state',
      sql: 'state',
      type: 'string',
      meta: { owner: 'finance', wechart: { note: 'kept', regionKey: 'admin1' } },
    });
  });

  it('writes "not a region key"', async () => {
    const onChange = form({ name: 'channel', sql: 'channel', type: 'string' });
    await userEvent.selectOptions(setting(), 'Not a region key');
    expect(onChange).toHaveBeenLastCalledWith({
      name: 'channel',
      sql: 'channel',
      type: 'string',
      meta: { wechart: { regionKey: false } },
    });
  });

  it('shows a mark the file has, and clears it back to deciding by the values', async () => {
    const onChange = form({
      name: 'state',
      sql: 'state',
      type: 'string',
      meta: { wechart: { regionKey: 'admin1' } },
    });
    expect((setting() as HTMLSelectElement).value).toBe('admin1');
    await userEvent.selectOptions(setting(), 'Decided by its values');
    expect(onChange).toHaveBeenLastCalledWith({ name: 'state', sql: 'state', type: 'string' });
  });

  it('shows a custom set’s mark, which it keeps until another is chosen', () => {
    form({
      name: 'territory',
      sql: 'territory',
      type: 'string',
      meta: { wechart: { regionKey: 'custom:territories' } },
    });
    expect((setting() as HTMLSelectElement).value).toBe('custom:territories');
    expect(
      within(setting()).getByRole('option', { name: 'Custom set: territories' }),
    ).toBeTruthy();
  });

  it('isn’t offered on a dimension that isn’t a string', () => {
    form({ name: 'amount', sql: 'amount', type: 'number' });
    expect(screen.queryByRole('combobox', { name: 'Region key' })).toBeNull();
  });
});
