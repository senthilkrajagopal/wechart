import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ObjectForm } from './ObjectForm';
import { SCHEMA } from './schema';

/**
 * T397 (AC-313): … unless the model marks it otherwise; a dimension the model
 * marks as a country code counts whatever its values, and one it marks as not
 * a country code never does.
 *
 * The model marks it in the dimension's `meta`, as `wechart.countryCode`
 * (research/country-map.md: Cube has no such key, and passes `meta` through
 * `/v1/meta` verbatim). The form sets it without the author writing YAML.
 */
const form = (value: Record<string, unknown>) => {
  const onChange = vi.fn();
  render(<ObjectForm schema={SCHEMA['Y.6']} value={value} onChange={onChange} />);
  return onChange;
};

const setting = () => screen.getByRole('combobox', { name: 'Country code' });

describe('marking a dimension as a country code (T397, AC-313)', () => {
  it('offers the three choices on a string dimension, under Geography, unmarked by default', () => {
    form({ name: 'country', sql: 'country', type: 'string' });
    const geography = screen.getByRole('group', { name: 'Geography' });
    const select = within(geography).getByRole('combobox', { name: 'Country code' });
    expect(
      within(select)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['Decided by its values (ISO-3 codes)', 'A country code', 'Not a country code']);
    expect((select as HTMLSelectElement).value).toBe('');
  });

  it('writes the marking into the dimension’s meta, keeping what else it holds', async () => {
    const onChange = form({
      name: 'country',
      sql: 'country',
      type: 'string',
      meta: { owner: 'finance' },
    });
    await userEvent.selectOptions(setting(), 'A country code');
    expect(onChange).toHaveBeenLastCalledWith({
      name: 'country',
      sql: 'country',
      type: 'string',
      meta: { owner: 'finance', wechart: { countryCode: true } },
    });
  });

  it('shows a marking the file has, and clears it back to deciding by the values', async () => {
    const onChange = form({
      name: 'code',
      sql: 'code',
      type: 'string',
      meta: { wechart: { countryCode: false } },
    });
    expect((setting() as HTMLSelectElement).value).toBe('false');
    await userEvent.selectOptions(setting(), 'Decided by its values (ISO-3 codes)');
    // Nothing left in meta: the key goes with it.
    expect(onChange).toHaveBeenLastCalledWith({ name: 'code', sql: 'code', type: 'string' });
  });

  it('writes "not a country code", and clearing keeps the rest of meta', async () => {
    const onChange = form({
      name: 'code',
      sql: 'code',
      type: 'string',
      meta: { owner: 'finance', wechart: { note: 'kept' } },
    });
    await userEvent.selectOptions(setting(), 'Not a country code');
    expect(onChange).toHaveBeenLastCalledWith({
      name: 'code',
      sql: 'code',
      type: 'string',
      meta: { owner: 'finance', wechart: { note: 'kept', countryCode: false } },
    });
  });

  it('clears a marking, keeping what else meta and its wechart key hold', async () => {
    const onChange = form({
      name: 'code',
      sql: 'code',
      type: 'string',
      meta: { owner: 'finance', wechart: { note: 'kept', countryCode: true } },
    });
    await userEvent.selectOptions(setting(), 'Decided by its values (ISO-3 codes)');
    expect(onChange).toHaveBeenLastCalledWith({
      name: 'code',
      sql: 'code',
      type: 'string',
      meta: { owner: 'finance', wechart: { note: 'kept' } },
    });
  });

  it('isn’t offered on a dimension that isn’t a string', () => {
    form({ name: 'amount', sql: 'amount', type: 'number' });
    expect(screen.queryByRole('combobox', { name: 'Country code' })).toBeNull();
  });
});
