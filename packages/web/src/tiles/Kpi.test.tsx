import type { RenderSpec } from '@wechart/core';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Kpi } from './Kpi';

/**
 * T040 / AC-037: the KPI tile.
 *
 * A KPI is one number, so almost everything that can go wrong with it is about
 * what happens when that number is not there — an empty result, a measure the
 * rows do not carry, a value that is not a number. Those are the cases here;
 * the happy path is one assertion.
 */
const COUNT = 'orders.count';

const spec = (over: Partial<RenderSpec> = {}): RenderSpec => ({
  chartType: 'kpi',
  encoding: { y: [COUNT] },
  rows: [{ [COUNT]: 1234 }],
  ...over,
});

describe('a KPI with a value', () => {
  it('shows the number', () => {
    render(<Kpi spec={spec()} />);

    expect(screen.getByTestId('kpi-value').textContent).toBe('1,234');
  });

  it('writes the number in its member’s format from the model (AC-046, T201)', () => {
    // percent_1, as `/v1/meta` reports it: Cube's specifier `.1~%`.
    render(
      <Kpi
        spec={spec({ rows: [{ [COUNT]: 0.1234 }], formats: { [COUNT]: { specifier: '.1~%' } } })}
      />,
    );

    expect(screen.getByTestId('kpi-value').textContent).toBe('12.3%');
  });

  it('names the measure underneath it, so the number means something', () => {
    render(<Kpi spec={spec()} />);

    expect(screen.getByTestId('kpi-label').textContent).toBe(COUNT);
  });

  // T232 / AC-220: by its title from the model, never "orders.count".
  it('names the measure by its title where the model gives one', () => {
    render(<Kpi spec={spec({ titles: { [COUNT]: 'Orders Count' } })} />);

    expect(screen.getByTestId('kpi-label').textContent).toBe('Orders Count');
  });

  it('reads the value Cube sent, which is a string over JSON', () => {
    render(<Kpi spec={spec({ rows: [{ [COUNT]: '80' }] })} />);

    // Trusting the raw value would print "80" here but sort and scale it as
    // text everywhere else, so the conversion has to be real.
    expect(screen.getByTestId('kpi-value').textContent).toBe('80');
  });

  it('groups a large number rather than printing a wall of digits', () => {
    render(<Kpi spec={spec({ rows: [{ [COUNT]: 9876543 }] })} />);

    expect(screen.getByTestId('kpi-value').textContent).toBe('9,876,543');
  });
});

describe('a KPI with nothing to show', () => {
  it('says so when the query returned no rows', () => {
    render(<Kpi spec={spec({ rows: [] })} />);

    // An empty result is not zero. Printing 0 would assert a measurement that
    // was never made.
    expect(screen.queryByTestId('kpi-value')).toBeNull();
    expect(screen.getByTestId('kpi-empty')).toBeTruthy();
  });

  it('says so when the row does not carry the measure', () => {
    render(<Kpi spec={spec({ rows: [{ 'orders.total': 5 }] })} />);

    expect(screen.getByTestId('kpi-empty')).toBeTruthy();
  });

  it('says so when the value is not a number', () => {
    render(<Kpi spec={spec({ rows: [{ [COUNT]: 'n/a' }] })} />);

    expect(screen.getByTestId('kpi-empty')).toBeTruthy();
  });

  it('says so when no measure is bound at all', () => {
    render(<Kpi spec={spec({ encoding: {} })} />);

    expect(screen.getByTestId('kpi-empty')).toBeTruthy();
  });
});
