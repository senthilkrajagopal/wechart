import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { Member } from '../fields';
import { ParallelWells } from './parallel';
import { TYPE_WELLS } from './registry';

/**
 * T981 / AC-597: WHEN parallel coordinates are edited, THE SYSTEM SHALL take
 * Line by (one dimension), Metrics (3 or more, one axis each, in order),
 * Colour (an optional dimension) and Scale, "Each axis, min to max" by default
 * or "Shared", Shared enabled only while every measure has one format and
 * otherwise disabled with the reason; and with fewer than 3 measures SHALL say
 * "Parallel coordinates need at least 3 measures; there are ‹n›. Add a
 * measure, or use Scatter." with + Measure.
 * `Fails when: a well or option is missing; Shared can be chosen for measures
 * of different formats; or fewer than 3 measures draw lines.`
 */
const member = (name: string, title: string, kind: Member['kind']): Member => ({
  name,
  title,
  shortTitle: title,
  kind,
  type: kind === 'measure' ? 'number' : 'string',
  cube: 'products',
});

const AVAILABLE: readonly Member[] = [
  member('products.revenue', 'Revenue', 'measure'),
  member('products.margin', 'Margin %', 'measure'),
  member('products.discount', 'Discount %', 'measure'),
  member('products.units', 'Units', 'measure'),
  member('products.name', 'Product', 'dimension'),
  member('orders.channel', 'Channel', 'dimension'),
];
const titleOf = (name: string) => AVAILABLE.find((one) => one.name === name)?.title ?? name;
const FORMATS = {
  'products.revenue': 'currency',
  'products.margin': 'percent',
  'products.discount': 'percent',
};

const wells = ({
  measures = ['products.revenue', 'products.margin', 'products.discount'],
  dimensions = ['products.name'],
  options = {},
  formats = FORMATS as Record<string, string>,
}: {
  measures?: string[];
  dimensions?: string[];
  options?: Record<string, unknown>;
  formats?: Record<string, string>;
} = {}) => {
  const onOptions = vi.fn();
  const onAdd = vi.fn();
  render(
    <ParallelWells
      chartType="parallel"
      options={options}
      onOptions={onOptions}
      onAdd={onAdd}
      available={AVAILABLE}
      titleOf={titleOf}
      formats={formats}
      spec={{ measures, dimensions }}
    />,
  );
  const scale = screen.getByRole('radiogroup', { name: 'Scale' });
  const radio = (name: string) => within(scale).getByRole('radio', { name }) as HTMLInputElement;
  return { onOptions, onAdd, radio };
};

describe('parallel coordinates’ wells (AC-597)', () => {
  it('is the parallel wells module', () => {
    expect(TYPE_WELLS.parallel).toBe(ParallelWells);
  });

  it('names Line by, Colour and the axes in order from the chart’s fields', () => {
    wells({ dimensions: ['products.name', 'orders.channel'] });
    expect(screen.getByTestId('parallel-lineBy').textContent).toBe('Product');
    expect(screen.getByTestId('parallel-colour').textContent).toBe('Channel');
    expect(screen.getByTestId('parallel-axes').textContent).toBe('Revenue → Margin % → Discount %');
  });

  it('says what Line by needs, and that Colour is optional', () => {
    wells({ dimensions: [] });
    expect(screen.getByTestId('parallel-lineBy').textContent).toBe(
      'Put a dimension in Dimensions: one line per member.',
    );
    expect(screen.getByTestId('parallel-colour').textContent).toBe(
      'Optional: a second dimension in Dimensions.',
    );
  });

  it('offers Scale as Each axis, min to max, chosen by default, or Shared', () => {
    const { radio } = wells({ formats: {} });
    expect(radio('Each axis, min to max').checked).toBe(true);
    expect(radio('Shared').checked).toBe(false);
    expect(radio('Shared').disabled).toBe(false);
  });

  it('disables Shared for measures in $ and %, described by the reason', async () => {
    const { radio, onOptions } = wells();
    const shared = radio('Shared');
    expect(shared.disabled).toBe(true);
    const reason = document.getElementById(shared.getAttribute('aria-describedby') ?? '');
    expect(reason?.textContent).toBe(
      'Shared needs every measure in one format; these are in currency and percent.',
    );
    await userEvent.click(shared);
    expect(onOptions).not.toHaveBeenCalled();
  });

  it('stores Shared for measures of one format, and Each axis as nothing', async () => {
    const percent = { 'products.margin': 'percent', 'products.discount': 'percent' };
    const { radio, onOptions } = wells({
      measures: ['products.margin', 'products.discount', 'products.units'],
      formats: { ...percent, 'products.units': 'percent' },
    });
    await userEvent.click(radio('Shared'));
    expect(onOptions).toHaveBeenLastCalledWith({ parallel: { scale: 'shared' } });
  });

  it('shows a stored Shared as Each axis while the formats differ', () => {
    const { radio } = wells({ options: { parallel: { scale: 'shared' } } });
    expect(radio('Each axis, min to max').checked).toBe(true);
  });

  it('with 2 measures, says so with + Measure, which adds one to Metrics', async () => {
    const { onAdd } = wells({ measures: ['products.revenue', 'products.margin'] });
    expect(screen.getByTestId('parallel-too-few').textContent).toBe(
      'Parallel coordinates need at least 3 measures; there are 2. Add a measure, or use Scatter.',
    );
    const add = screen.getByTestId('add-parallelMeasure');
    expect(add.textContent).toContain('+ Measure');
    await userEvent.click(add);
    // Only measures the chart hasn't yet.
    expect(screen.queryByTestId('pick-products.revenue')).toBeNull();
    await userEvent.click(screen.getByTestId('pick-products.units'));
    expect(onAdd).toHaveBeenLastCalledWith('measures', 'products.units');
  });

  it('says nothing of too few measures from 3', () => {
    wells();
    expect(screen.queryByTestId('parallel-too-few')).toBeNull();
  });
});
