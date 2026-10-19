import { bulletOptionsOf, withBulletOptions } from '@wechart/core';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { Member } from '../fields';
import { BulletWells } from './bullet';
import { TYPE_WELLS } from './registry';

/**
 * T953 / AC-580: THE SYSTEM SHALL … take Metrics, Target, Bands as 2 or 3
 * percentages of the target (80 %, 100 % and 120 % by default), and one
 * dimension; refuse a fourth band, saying "At most 3 bands: R80's three
 * greys, and no fourth without a new colour."; and with Target emptied, say
 * "A bullet chart compares each member with a target. Put a measure or a
 * value in Target." with the Target well as its action.
 * `Fails when: a bullet chart can be drawn with no target; fewer than 2 or
 * more than 3 bands can be set; the defaults differ; or a sentence or action
 * is missing.`
 */
const member = (name: string, title: string, kind: Member['kind']): Member => ({
  name,
  title,
  shortTitle: title,
  kind,
  type: kind === 'measure' ? 'number' : 'string',
  cube: 'orders',
});

const AVAILABLE: readonly Member[] = [
  member('orders.revenue', 'Revenue', 'measure'),
  member('orders.revenue_target', 'Revenue target', 'measure'),
  member('orders.region', 'Region', 'dimension'),
];
const titleOf = (name: string) => AVAILABLE.find((one) => one.name === name)?.title ?? name;
const valueOf = (element: HTMLElement) => (element as HTMLInputElement | HTMLSelectElement).value;

function Harness({
  initial,
  highlight,
  onChange,
}: {
  initial: Record<string, unknown>;
  highlight?: 'target';
  onChange: (options: Record<string, unknown>) => void;
}) {
  const [options, setOptions] = useState(initial);
  return (
    <BulletWells
      chartType="bullet"
      available={AVAILABLE}
      titleOf={titleOf}
      options={options}
      highlight={highlight}
      spec={{ measures: ['orders.revenue'], dimensions: ['orders.region'] }}
      onOptions={(patch) => {
        const next = { ...options, ...patch };
        for (const [key, value] of Object.entries(patch)) if (value === undefined) delete next[key];
        setOptions(next);
        onChange(next);
      }}
    />
  );
}

const wells = (initial: Record<string, unknown> = {}, highlight?: 'target') => {
  const onChange = vi.fn<(options: Record<string, unknown>) => void>();
  render(<Harness initial={initial} onChange={onChange} {...(highlight ? { highlight } : {})} />);
  const last = () => bulletOptionsOf(onChange.mock.lastCall?.[0]);
  const bands = () =>
    within(screen.getByRole('group', { name: 'Bands' }))
      .getAllByRole('spinbutton')
      .map(valueOf);
  return { last, bands };
};

const TARGETED = withBulletOptions(
  {},
  {
    target: { kind: 'measure', member: 'orders.revenue_target' },
    bands: [80, 100, 120],
  },
);

describe('the bullet chart’s wells (AC-580)', () => {
  it('is the bullet chart’s entry in the wells registry', () => {
    expect(TYPE_WELLS.bullet).toBe(BulletWells);
  });

  it('with no target, says what it needs, Target the action beside it, highlighted when asked', () => {
    wells({}, 'target');
    const target = screen.getByTestId('well-bullet-target');
    expect(target.getAttribute('data-highlight')).toBe('true');
    expect(
      within(target).getByText(
        'A bullet chart compares each member with a target. Put a measure or a value in Target.',
      ),
    ).toBeTruthy();
    const choose = within(target).getByRole('combobox', { name: 'Target' });
    expect(valueOf(choose)).toBe('');
    expect(choose.getAttribute('aria-describedby')).toBe(
      within(target).getByText(/compares each member with a target/).id,
    );
  });

  it('takes a measure or a value in Target', async () => {
    const user = userEvent.setup();
    const { last } = wells();
    const choose = screen.getByRole('combobox', { name: 'Target' });
    expect(Array.from((choose as HTMLSelectElement).options).map((one) => one.text)).toEqual([
      'None',
      'Revenue',
      'Revenue target',
      'A value',
    ]);
    await user.selectOptions(choose, 'orders.revenue_target');
    expect(last().target).toEqual({ kind: 'measure', member: 'orders.revenue_target' });
    expect(screen.queryByText(/compares each member with a target/)).toBeNull();

    await user.selectOptions(choose, 'value');
    const value = screen.getByRole('spinbutton', { name: 'Target: value' });
    await user.type(value, '450000{Enter}');
    expect(last().target).toEqual({ kind: 'value', value: 450000 });
  });

  it('reads a Target measure its cube doesn’t have as no target, saying what it needs (T953’s review)', () => {
    wells(
      withBulletOptions(
        {},
        {
          target: { kind: 'measure', member: 'customers.lifetime_value' },
          bands: [80, 100, 120],
        },
      ),
    );
    expect(valueOf(screen.getByRole('combobox', { name: 'Target' }))).toBe('');
    expect(screen.getByText(/compares each member with a target/)).toBeTruthy();
  });

  it('shows no value box beside a measure Target that comes back, as by Undo, after "A value" was chosen', async () => {
    const user = userEvent.setup();
    const props = {
      chartType: 'bullet' as const,
      available: AVAILABLE,
      titleOf,
      spec: { measures: ['orders.revenue'], dimensions: ['orders.region'] },
      onOptions: vi.fn(),
    };
    const { rerender } = render(<BulletWells {...props} options={TARGETED} />);
    await user.selectOptions(screen.getByRole('combobox', { name: 'Target' }), 'value');
    // Empty while no value is typed: still saying what it needs.
    rerender(<BulletWells {...props} options={{}} />);
    expect(screen.getByRole('spinbutton', { name: 'Target: value' })).toBeTruthy();
    expect(screen.getByText(/compares each member with a target/)).toBeTruthy();
    // The editor's Undo puts the measure back.
    rerender(<BulletWells {...props} options={TARGETED} />);
    expect(valueOf(screen.getByRole('combobox', { name: 'Target' }))).toBe('orders.revenue_target');
    expect(screen.queryByRole('spinbutton', { name: 'Target: value' })).toBeNull();
  });

  it('starts its bands at 80, 100 and 120 % of the target', () => {
    const { bands } = wells(TARGETED);
    expect(bands()).toEqual(['80', '100', '120']);
  });

  it('refuses a fourth band with AC-580’s sentence, and changes nothing', async () => {
    const user = userEvent.setup();
    const { bands } = wells(TARGETED);
    const add = screen.getByRole('button', { name: '+ Band' });
    expect(add.getAttribute('aria-disabled')).toBe('true');
    await user.click(add);
    expect(
      screen.getByText('At most 3 bands: R80’s three greys, and no fourth without a new colour.'),
    ).toBeTruthy();
    expect(bands()).toEqual(['80', '100', '120']);
  });

  it('removes a band down to two, and no further', async () => {
    const user = userEvent.setup();
    const { last, bands } = wells(TARGETED);
    await user.click(screen.getByRole('button', { name: 'Remove band 3, 120 %' }));
    expect(last().bands).toEqual([80, 100]);
    expect(bands()).toEqual(['80', '100']);
    const remove = screen.getByRole('button', { name: 'Remove band 2, 100 %' });
    expect(remove.getAttribute('aria-disabled')).toBe('true');
    await user.click(remove);
    expect(screen.getByText('At least 2 bands: a bullet chart’s bands are 2 or 3.')).toBeTruthy();
    expect(last().bands).toEqual([80, 100]);
    // Two bands, so a third can be added again: above the highest.
    await user.click(screen.getByRole('button', { name: '+ Band' }));
    expect(last().bands).toEqual([80, 100, 120]);
  });

  it('sets a band’s percentage, refusing one out of order', async () => {
    const user = userEvent.setup();
    const { last, bands } = wells(TARGETED);
    const first = screen.getByRole('spinbutton', { name: 'Band 1, % of target' });
    await user.clear(first);
    await user.type(first, '90{Enter}');
    expect(last().bands).toEqual([90, 100, 120]);
    await user.clear(first);
    await user.type(first, '130{Enter}');
    expect(screen.getByText('Bands run low to high, each above 0 %.')).toBeTruthy();
    expect(bands()).toEqual(['90', '100', '120']);
  });
});
