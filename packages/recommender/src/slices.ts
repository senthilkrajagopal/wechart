import type { Field } from './types';

/**
 * A pie's slices, as the field its capacity rule counts (AC-031, AC-218).
 *
 * Grouped by its category alone, a slice per category; split by a second
 * dimension as well, a slice per row it draws (AC-221) — the rows, where
 * known, or as many as the two can make. Top N folds the category into N and
 * one "Other" (AC-041). One function for the recommender and the warnings, so
 * a type is never suggested and then warned about (T230's review).
 */
export function pieSlicesField(
  category: Field,
  split: Field | undefined,
  rowCount: number | undefined,
  topN?: number,
): Field {
  const unknown = Number.POSITIVE_INFINITY;
  const categories = category.cardinality ?? unknown;
  const kept = topN !== undefined && topN > 0 && categories > topN ? topN + 1 : categories;
  const slices =
    split === undefined
      ? kept
      : Math.min(rowCount ?? unknown, kept * (split.cardinality ?? unknown));
  // Not known: no count, which the capacity rule reads as too many.
  const { cardinality: _known, ...named } = category;
  void _known;
  return Number.isFinite(slices) ? { ...named, cardinality: slices } : named;
}
