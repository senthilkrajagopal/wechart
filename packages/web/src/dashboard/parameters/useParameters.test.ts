import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { DashboardParameter } from '@wechart/core';

import { useParameters } from './useParameters';

/**
 * T899 / AC-534: WHEN a dashboard opens without a bookmark or a link setting
 * its parameters, THE SYSTEM SHALL start each parameter at its default; and
 * WHEN a reader changes a Parameter control …, THE SYSTEM SHALL apply the
 * choice at once … and announce it once, politely ("Metric to show: Orders").
 * `Fails when: a parameter opens at another value; … the change is announced
 * not at all, or twice.`
 */
const METRIC: DashboardParameter = {
  id: 'p-metric',
  name: 'Metric to show',
  kind: 'fieldSwitch',
  role: 'measure',
  choices: [
    { member: 'orders.revenue', label: 'Revenue' },
    { member: 'orders.count', label: 'Orders' },
  ],
  default: 'orders.revenue',
};

describe('the dashboard’s parameters as a reader has them (T899, AC-534)', () => {
  it('starts each at its default when the dashboard opens plainly', () => {
    const { result } = renderHook(() => useParameters([METRIC]));
    expect(result.current.valueOf('p-metric')).toBe('orders.revenue');
    expect(result.current.values).toEqual({});
    expect(result.current.said).toBe('');
  });

  it('takes a choice at once, and says it once, politely', () => {
    const { result } = renderHook(() => useParameters([METRIC]));
    act(() => {
      result.current.choose('p-metric', 'orders.count');
    });
    expect(result.current.valueOf('p-metric')).toBe('orders.count');
    expect(result.current.values).toEqual({ 'p-metric': 'orders.count' });
    expect(result.current.said).toBe('Metric to show: Orders');
    // Chosen again, it is said again, once.
    act(() => {
      result.current.choose('p-metric', 'orders.revenue');
    });
    expect(result.current.said).toBe('Metric to show: Revenue');
  });

  it('starts where a link or bookmark set it, and at the default for a choice no longer offered', () => {
    const { result } = renderHook(() =>
      useParameters([METRIC], { 'p-metric': 'orders.count', gone: 'x.y' }),
    );
    expect(result.current.valueOf('p-metric')).toBe('orders.count');
    const { result: stale } = renderHook(() =>
      useParameters([METRIC], { 'p-metric': 'orders.margin' }),
    );
    expect(stale.current.valueOf('p-metric')).toBe('orders.revenue');
  });
});
