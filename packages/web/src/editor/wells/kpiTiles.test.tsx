import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import { CustomizeTab } from '../CustomizeTab';
import { kpiCustomize } from './kpiTiles';

/**
 * T940 / AC-567: … order them by value, highest first, unless the author
 * orders them in Customize (checkpoint 2's review: the order is Customize's,
 * not the Data tab's Tile by well; decision T940-1).
 */
function Harness({ initial }: { initial: Readonly<Record<string, unknown>> }) {
  const [options, setOptions] = useState<Readonly<Record<string, unknown>>>(initial);
  const onOptions = (patch: Readonly<Record<string, unknown>>) =>
    setOptions((current) => ({ ...current, ...patch }));
  return (
    <>
      <CustomizeTab
        options={options}
        onOptions={onOptions}
        cartesian={false}
        valueAxes={[]}
        // As the editor gives a KPI: a DOM type, not drawn by ECharts.
        drawn={false}
        stackable={false}
        series={[]}
        colourOf={() => '#000000'}
        {...kpiCustomize('kpi', { options, onOptions })}
      />
      <output data-testid="options">{JSON.stringify(options)}</output>
    </>
  );
}

const stored = () =>
  JSON.parse(screen.getByTestId('options').textContent ?? '{}') as Record<string, unknown>;

describe('a tiled KPI’s tile order, in Customize (T940, AC-567)', () => {
  it('offers By value, highest first, then lowest first, then By name, and keeps the choice', async () => {
    render(<Harness initial={{ kpi: { tileBy: 'orders.region' } }} />);
    const order = screen.getByRole('combobox', { name: 'Tile order' });
    expect([...(order as HTMLSelectElement).options].map((one) => one.text)).toEqual([
      'By value, highest first',
      'By value, lowest first',
      'By name',
    ]);
    expect((order as HTMLSelectElement).value).toBe('value');
    await userEvent.selectOptions(order, 'name');
    expect(stored()).toEqual({ kpi: { tileBy: 'orders.region', tileOrder: 'name' } });
    await userEvent.selectOptions(order, 'value');
    expect(stored()).toEqual({ kpi: { tileBy: 'orders.region' } });
  });

  it('is offered only for a KPI tiled by a dimension', () => {
    const onOptions = () => undefined;
    expect(kpiCustomize('kpi', { options: {}, onOptions })).toEqual({});
    expect(
      kpiCustomize('bar', { options: { kpi: { tileBy: 'orders.region' } }, onOptions }),
    ).toEqual({});
    expect(kpiCustomize(null, { options: {}, onOptions })).toEqual({});
  });
});
