import { columnTitleOf, isPercentStack, memberOn, type RenderSpec } from '@wechart/core';

import type { AddedColumn } from './index';

const numberOf = (raw: unknown): number | null => {
  if (raw === null || raw === undefined || raw === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
};

/**
 * A 100 % stack's table view (T958, AC-585; design 23 sheet 9): its rows as
 * queried, and "Share of ‹category›", each row's value as a percentage of its
 * category's total to one decimal ("51.0%"), the share its segment draws.
 * Nothing at Sum, which draws no shares; a blank where a row has no value or
 * its category totals 0.
 */
export function stack100Columns(spec: RenderSpec): AddedColumn[] {
  if (!isPercentStack(spec)) return [];
  const category = memberOn(spec.encoding, 'x');
  const measure = memberOn(spec.encoding, 'y');
  if (category === undefined || measure === undefined) return [];

  const keyOf = (row: Record<string, unknown>) => String(row[category] ?? '');
  const totals = new Map<string, number>();
  for (const row of spec.rows) {
    const value = numberOf(row[measure]);
    if (value !== null) totals.set(keyOf(row), (totals.get(keyOf(row)) ?? 0) + value);
  }
  return [
    {
      title: `Share of ${columnTitleOf(category, spec.titles)}`,
      cells: spec.rows.map((row) => {
        const value = numberOf(row[measure]);
        const total = totals.get(keyOf(row)) ?? 0;
        return value === null || total === 0 ? '' : `${((value / total) * 100).toFixed(1)}%`;
      }),
    },
  ];
}
