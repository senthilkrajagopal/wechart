import type { Explanation } from '@wechart/recommender';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { WhyThisChart } from './WhyThisChart';

/**
 * AC-029 as amended by R76 (chart-editor-Q3; T689, EDI-12; design 01 pin 9
 * and state C): WHEN the user opens "Why this recommendation?", THE SYSTEM
 * SHALL show the field signature, the cardinality of each field and the rules
 * that decided, as a checklist with ✓/⚠ icons, and one link away ("Show every
 * rule for every type") every hard rule with its pass or fail result for every
 * type. `Fails when: a rule that rejected a candidate is absent from the full
 * table, or the full table can't be reached from the checklist.`
 */
const EXPLANATION: Explanation = {
  signature: [
    { name: 'customers.country', kind: 'dimension', cardinality: 8 },
    { name: 'orders.total_amount', kind: 'measure', cardinality: null },
  ],
  candidates: [
    {
      chartType: 'bar',
      legal: true,
      score: 1,
      rules: [
        { rule: 'no_dual_value_axis', passed: true },
        { rule: 'pie_slice_capacity', passed: true },
      ],
    },
    {
      chartType: 'pie',
      legal: false,
      score: null,
      rules: [
        { rule: 'no_dual_value_axis', passed: true },
        {
          rule: 'pie_slice_capacity',
          passed: false,
          reason: 'A pie is readable up to 6 slices; this has 8.',
        },
      ],
    },
  ],
};
const TITLES = { 'customers.country': 'Customers Country', 'orders.total_amount': 'Total Amount' };
const PICKED = {
  type: 'bar' as const,
  reason: '8 Customers Country values × 1 measure → Bar',
  runnersUp: [
    { type: 'hbar' as const, reason: 'Long category names read across.' },
    { type: 'table' as const, reason: 'Every value, exactly.' },
  ],
};

const why = () =>
  render(<WhyThisChart explanation={EXPLANATION} picked={PICKED} titles={TITLES} />);

describe('“Why this recommendation?” (AC-029, AC-220; T689, EDI-12)', () => {
  it('is collapsed at first, a ▸ caret before its words', async () => {
    why();
    const toggle = screen.getByRole('button', { name: 'Why this recommendation?' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.textContent).toBe('▸Why this recommendation?');
    expect(screen.queryByTestId('why-checklist')).toBeNull();
    await userEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(toggle.textContent).toBe('▾Why this recommendation?');
  });

  it('lists the signature, each field’s distinct values, the rules that decided, the pick and runners-up, with ✓/⚠', async () => {
    why();
    await userEvent.click(screen.getByRole('button', { name: 'Why this recommendation?' }));
    const checks = within(screen.getByTestId('why-checklist')).getAllByRole('listitem');
    expect(checks.map((check) => check.textContent)).toEqual([
      'Signature: 1 category × 1 measure, no time',
      'Customers Country: 8 distinct values in this result',
      'Pie: A pie is readable up to 6 slices; this has 8.',
      'Picked Bar: 8 Customers Country values × 1 measure → Bar',
      'Runners-up: Bar, horizontal — Long category names read across. · Table — Every value, exactly.',
    ]);
    // Icon plus word, never colour alone (direction.md rule 3).
    expect(checks.map((check) => check.querySelector('svg')?.dataset['icon'] ?? null)).toEqual([
      'ok',
      'ok',
      'warn',
      'ok',
      null,
    ]);
    expect(screen.getByTestId('picked-type').dataset['chartType']).toBe('bar');
    expect(screen.getByTestId('runner-up-hbar').textContent).toBe(
      'Bar, horizontal — Long category names read across.',
    );
    // By title, never the internal name (AC-220).
    expect(screen.getByTestId('why-checklist').textContent).not.toContain('customers.country');
  });

  it('keeps every rule for every type one link away, a rejecting rule with its reason', async () => {
    why();
    await userEvent.click(screen.getByRole('button', { name: 'Why this recommendation?' }));
    expect(screen.queryByTestId('why-this-chart')).toBeNull();
    const every = screen.getByRole('button', {
      name: 'Show every rule for every type (2 types × 2 rules)',
    });
    await userEvent.click(every);
    const table = screen.getByTestId('why-this-chart');
    expect(within(table).getByTestId('trace-pie').textContent).toContain('rejected');
    expect(within(table).getByTestId('trace-pie-pie_slice_capacity').textContent).toContain(
      '6 slices',
    );
    expect(within(table).getByTestId('trace-bar-no_dual_value_axis').textContent).toContain(
      'passed',
    );
    expect(
      within(table).getByTestId('trace-field-customers.country').querySelector('th')?.textContent,
    ).toBe('Customers Country');
  });
});

/**
 * T865 (AC-510; design 20 state L): in a combo whose author drew a second
 * value axis, the checklist's one-value-axis line says so, with ⚠, after the
 * signature; the pick and runners-up stay as they are.
 */
describe('a second axis the author drew (AC-510)', () => {
  it('reads "You drew a second axis by hand; the recommender never does" on its one-value-axis line', async () => {
    render(
      <WhyThisChart
        explanation={{
          ...EXPLANATION,
          oneValueAxis: 'You drew a second axis by hand; the recommender never does',
        }}
        picked={PICKED}
        titles={TITLES}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Why this recommendation?' }));
    const checks = within(screen.getByTestId('why-checklist')).getAllByRole('listitem');

    const line = screen.getByTestId('check-one-value-axis');
    expect(line.textContent).toBe(
      'One value axis: You drew a second axis by hand; the recommender never does',
    );
    expect(line.querySelector('svg')?.dataset['icon']).toBe('warn');
    expect(checks.indexOf(line)).toBe(1);
    expect(screen.getByTestId('picked-type').dataset['chartType']).toBe('bar');
  });

  it('has no such line while no second axis is drawn', async () => {
    why();
    await userEvent.click(screen.getByRole('button', { name: 'Why this recommendation?' }));

    expect(screen.queryByTestId('check-one-value-axis')).toBeNull();
  });
});
