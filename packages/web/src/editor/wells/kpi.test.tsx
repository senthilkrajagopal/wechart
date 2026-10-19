import { emptySpec, kpiOptionsOf } from '@wechart/core';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { Wells } from '../Wells';
import type { Member } from '../fields';
import { KpiWells } from './kpi';
import { kpiCustomize } from './kpiTiles';
import { TYPE_WELLS } from './registry';

/**
 * T936 / AC-564: WHEN a KPI is edited, THE SYSTEM SHALL offer, after Metrics,
 * the optional wells Compare to (Previous period, Same period last year,
 * Another measure, A value, or None), Target (a measure or a value), Time
 * (the period and the trend's time dimension), Tile by (one dimension) and
 * Direction (Higher is better, the default, Lower is better, or Neutral) …
 * `Fails when: a well or a Compare to choice is missing, or another is
 * offered; Direction starts other than Higher is better …`
 */
const member = (name: string, kind: Member['kind'], type: string, title: string): Member => ({
  name,
  title,
  shortTitle: title,
  kind,
  type,
  cube: 'orders',
});

const revenue = member('orders.revenue', 'measure', 'number', 'Revenue');
const target = member('orders.revenue_target', 'measure', 'number', 'Revenue target');
const region = member('orders.region', 'dimension', 'string', 'Region');
const orderedAt = member('orders.ordered_at', 'timeDimension', 'time', 'Ordered at');
const available = [revenue, target, region, orderedAt];
const titleOf = (name: string) => available.find((each) => each.name === name)?.title ?? name;

/** The KPI's wells over options kept as the editor keeps them: each change a patch. */
function Harness({ onPatch }: { onPatch?: (patch: Readonly<Record<string, unknown>>) => void }) {
  const [options, setOptions] = useState<Readonly<Record<string, unknown>>>({});
  return (
    <>
      <KpiWells
        chartType="kpi"
        available={available}
        options={options}
        titleOf={titleOf}
        onOptions={(patch) => {
          onPatch?.(patch);
          setOptions((current) => ({ ...current, ...patch }));
        }}
      />
      <output data-testid="options">{JSON.stringify(options)}</output>
      {/* What an undo does to them (AC-035): the options as they were. */}
      <button type="button" onClick={() => setOptions({})}>
        Undo all
      </button>
    </>
  );
}

const stored = () =>
  JSON.parse(screen.getByTestId('options').textContent ?? '{}') as Record<string, unknown>;

describe('the KPI’s wells (AC-564)', () => {
  it('offers its five wells after Metrics, from its own module', () => {
    expect(TYPE_WELLS.kpi).toBe(KpiWells);
    const spec = { ...emptySpec('orders'), measures: ['orders.revenue'] };
    render(
      <Wells
        spec={spec}
        available={available}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
        typeWells={{
          chartType: 'kpi',
          available,
          options: {},
          titleOf,
          onOptions: vi.fn(),
        }}
      />,
    );
    const labels = [...document.querySelectorAll('.well-field__label')].map((label) =>
      (label.textContent ?? '').trim(),
    );
    const at = labels.findIndex((label) => label.startsWith('Metrics'));
    expect(labels.slice(at, at + 6)).toEqual([
      'Metrics',
      'Compare to',
      'Target',
      // Design 23 sheet 1's words, so it never reads as the query's Time
      // well below (T936 follow-up, the coordinator).
      'Time period and trend',
      'Tile by',
      'Direction',
    ]);
    expect(labels.filter((label) => label === 'Time')).toHaveLength(1);
  });

  it('offers Compare to’s five choices and None, None chosen at first', () => {
    render(<Harness />);
    const compare = screen.getByRole('combobox', { name: 'Compare to' });
    expect(
      within(compare)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['None', 'Previous period', 'Same period last year', 'Another measure', 'A value']);
    expect((compare as HTMLSelectElement).value).toBe('none');
  });

  it('starts Direction at Higher is better, and keeps nothing until something is set', () => {
    render(<Harness />);
    const direction = screen.getByRole('radiogroup', { name: 'Direction' });
    const radios = within(direction).getAllByRole('radio');
    expect(radios.map((radio) => radio.closest('label')?.textContent)).toEqual([
      'Higher is better',
      'Lower is better',
      'Neutral',
    ]);
    expect(within(direction).getByRole('radio', { name: 'Higher is better' })).toHaveProperty(
      'checked',
      true,
    );
    expect(stored()).toEqual({});
  });

  it('keeps each setting as it is chosen, in the chart’s options under `kpi`', async () => {
    render(<Harness />);
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Compare to' }),
      'samePeriodLastYear',
    );
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Target' }),
      'orders.revenue_target',
    );
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Time period and trend' }),
      'orders.ordered_at',
    );
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Time by' }), 'month');
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Tile by' }),
      'orders.region',
    );
    await userEvent.click(screen.getByRole('radio', { name: 'Lower is better' }));
    expect(kpiOptionsOf(stored())).toEqual({
      compareTo: { kind: 'samePeriodLastYear' },
      target: { kind: 'measure', member: 'orders.revenue_target' },
      time: { member: 'orders.ordered_at', granularity: 'month' },
      tileBy: 'orders.region',
      direction: 'lower',
    });
  });

  it('takes another measure or a typed value to compare to, and a typed value as the target', async () => {
    render(<Harness />);
    const compare = screen.getByRole('combobox', { name: 'Compare to' });
    await userEvent.selectOptions(compare, 'measure');
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Compare to: measure' }),
      'orders.revenue_target',
    );
    expect(kpiOptionsOf(stored()).compareTo).toEqual({
      kind: 'measure',
      member: 'orders.revenue_target',
    });
    await userEvent.selectOptions(compare, 'value');
    const compareValue = screen.getByRole('spinbutton', { name: 'Compare to: value' });
    await userEvent.type(compareValue, '1320000');
    await userEvent.tab();
    expect(kpiOptionsOf(stored()).compareTo).toEqual({ kind: 'value', value: 1_320_000 });

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Target' }), 'value');
    await userEvent.type(screen.getByRole('spinbutton', { name: 'Target: value' }), '1400000');
    await userEvent.tab();
    expect(kpiOptionsOf(stored()).target).toEqual({ kind: 'value', value: 1_400_000 });
  });

  it('shows what is stored after an undo, not the choice last made (T936’s review)', async () => {
    render(<Harness />);
    const compare = screen.getByRole('combobox', { name: 'Compare to' });
    const time = screen.getByRole('combobox', { name: 'Time period and trend' });
    await userEvent.selectOptions(compare, 'previousPeriod');
    await userEvent.selectOptions(time, 'orders.ordered_at');
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Time by' }), 'month');
    await userEvent.click(screen.getByRole('button', { name: 'Undo all' }));
    expect(stored()).toEqual({});
    expect((compare as HTMLSelectElement).value).toBe('none');
    expect((time as HTMLSelectElement).value).toBe('');
  });

  /**
   * T940 / AC-567: … order them by value, highest first, unless the author
   * orders them in Customize.
   */
  /**
   * AC-567: the author orders tiles in Customize (checkpoint 2's review), so
   * the Data tab's Tile by well holds the dimension alone; the order's own
   * test is `kpiTiles.test.tsx`.
   */
  it('leaves a tiled KPI’s tile order to Customize, not the Tile by well', async () => {
    render(<Harness />);
    expect(screen.queryByRole('combobox', { name: 'Tile order' })).toBeNull();
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Tile by' }),
      'orders.region',
    );
    expect(stored()).toEqual({ kpi: { tileBy: 'orders.region' } });
    expect(screen.queryByRole('combobox', { name: 'Tile order' })).toBeNull();
    // Tiled now, Customize offers the order, by value first.
    const patches: Readonly<Record<string, unknown>>[] = [];
    const customize = kpiCustomize('kpi', {
      options: stored(),
      onOptions: (patch) => patches.push(patch),
    });
    render(<>{customize.tiles}</>);
    const order = screen.getByRole('combobox', { name: 'Tile order' });
    expect([...(order as HTMLSelectElement).options].map((one) => one.text)).toEqual([
      'By value, highest first',
      'By value, lowest first',
      'By name',
    ]);
    expect((order as HTMLSelectElement).value).toBe('value');
    await userEvent.selectOptions(order, 'name');
    expect(patches).toEqual([{ kpi: { tileBy: 'orders.region', tileOrder: 'name' } }]);
  });

  it('clears a setting back to none, leaving no `kpi` key behind', async () => {
    render(<Harness />);
    const tileBy = screen.getByRole('combobox', { name: 'Tile by' });
    await userEvent.selectOptions(tileBy, 'orders.region');
    await userEvent.selectOptions(tileBy, '');
    expect(stored()).toEqual({});
  });
});
