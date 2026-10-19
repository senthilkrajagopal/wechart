import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { Member } from '../fields';
import { TYPE_WELLS } from './registry';
import { SankeyColourLinks, SankeyWells } from './sankey';

/**
 * T986 / AC-610, AC-037: WHEN a Sankey is edited, THE SYSTEM SHALL take
 * Steps, 2–4 dimensions in order, one summed measure, and Customize › Colour
 * links by, Source or Target; … and with one step SHALL say "A Sankey shows
 * flows between steps. Add a second dimension to Steps." with + Step.
 * `Fails when: a fifth step or an unsummed measure is accepted; … or one step
 * draws without the sentence.`
 */
const member = (name: string, title: string, kind: Member['kind'], aggType?: string): Member => ({
  name,
  title,
  shortTitle: title,
  kind,
  type: kind === 'measure' ? 'number' : 'string',
  cube: 'orders',
  ...(aggType === undefined ? {} : { aggType }),
});

const AVAILABLE: readonly Member[] = [
  member('orders.revenue', 'Revenue', 'measure', 'sum'),
  member('orders.average', 'Average order', 'measure', 'avg'),
  member('orders.channel', 'Channel', 'dimension'),
  member('orders.region', 'Region', 'dimension'),
  member('products.category', 'Category', 'dimension'),
  member('customers.country', 'Country', 'dimension'),
  member('customers.segment', 'Segment', 'dimension'),
];
const titleOf = (name: string) => AVAILABLE.find((one) => one.name === name)?.title ?? name;

const wells = ({
  measures = ['orders.revenue'],
  dimensions = ['orders.channel', 'orders.region', 'products.category'],
}: { measures?: string[]; dimensions?: string[] } = {}) => {
  const onAdd = vi.fn();
  render(
    <SankeyWells
      chartType="sankey"
      options={{}}
      onOptions={vi.fn()}
      onAdd={onAdd}
      available={AVAILABLE}
      titleOf={titleOf}
      spec={{ measures, dimensions }}
    />,
  );
  return { onAdd };
};

describe('the Sankey’s wells (AC-610, AC-037)', () => {
  it('is the sankey wells module', () => {
    expect(TYPE_WELLS.sankey).toBe(SankeyWells);
  });

  it('reads Steps in order, from the chart’s dimensions, with nothing refused', () => {
    wells();
    expect(screen.getByTestId('sankey-steps').textContent).toBe('Channel → Region → Category');
    expect(screen.queryByTestId('sankey-refusal')).toBeNull();
  });

  it('with one step, says so with + Step, which adds a dimension the chart hasn’t yet', async () => {
    const { onAdd } = wells({ dimensions: ['orders.channel'] });
    expect(screen.getByTestId('sankey-refusal').textContent).toBe(
      'A Sankey shows flows between steps. Add a second dimension to Steps.',
    );
    const add = screen.getByTestId('add-sankeyStep');
    expect(add.textContent).toContain('+ Step');
    await userEvent.click(add);
    expect(screen.queryByTestId('pick-orders.channel')).toBeNull();
    expect(screen.queryByTestId('pick-orders.revenue')).toBeNull();
    await userEvent.click(screen.getByTestId('pick-orders.region'));
    expect(onAdd).toHaveBeenCalledWith('dimensions', 'orders.region');
  });

  it('refuses a fifth step, with no + Step', () => {
    wells({
      dimensions: [
        'orders.channel',
        'orders.region',
        'products.category',
        'customers.country',
        'customers.segment',
      ],
    });
    expect(screen.getByTestId('sankey-refusal').textContent).toBe(
      'A Sankey takes at most 4 steps; there are 5. Remove a dimension from Steps.',
    );
    expect(screen.queryByTestId('add-sankeyStep')).toBeNull();
  });

  it('refuses an average, by the model’s aggregation', () => {
    wells({ measures: ['orders.average'] });
    expect(screen.getByTestId('sankey-refusal').textContent).toBe(
      'A Sankey’s flows add up, so its measure must be a sum or a count; Average order is an average.',
    );
  });
});

describe('Customize › Colour links by (AC-610)', () => {
  it('offers Source, chosen by default, and Target, stored sparse', async () => {
    const onOptions = vi.fn();
    const { rerender } = render(<SankeyColourLinks options={{}} onOptions={onOptions} />);
    const group = screen.getByRole('radiogroup', { name: 'Colour links by' });
    const radio = (name: string) => within(group).getByRole('radio', { name }) as HTMLInputElement;
    expect(within(group).getAllByRole('radio')).toHaveLength(2);
    expect(radio('Source').checked).toBe(true);
    await userEvent.click(radio('Target'));
    expect(onOptions).toHaveBeenLastCalledWith({ sankey: { colourLinksBy: 'target' } });

    rerender(
      <SankeyColourLinks options={{ sankey: { colourLinksBy: 'target' } }} onOptions={onOptions} />,
    );
    expect(radio('Target').checked).toBe(true);
    await userEvent.click(radio('Source'));
    expect(onOptions).toHaveBeenLastCalledWith({ sankey: undefined });
  });
});
