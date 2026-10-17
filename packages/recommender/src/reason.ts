import { CHART_TYPE_NAMES } from '@wechart/core';

import { MAX_REASON_LENGTH } from './recommend';
import type { Candidate, Field } from './types';

/**
 * A pick's reason built from the data (T689, EDI-07; design 01 pin 5): each
 * grouping field's values counted, by its title (AC-220), the measures, and
 * the form — "8 Country values × 1 measure → Bar" — from the signature and
 * cardinalities the recommender already has. At most 80 characters (AC-028;
 * the cap the coordinator set for this reason, 2026-10-17).
 */
export function dataReasonFor(candidate: Candidate, titleOf: (name: string) => string): string {
  const grouping = [
    candidate.categoryField,
    candidate.secondCategoryField,
    candidate.colorField,
    candidate.facetField,
  ].filter((field): field is Field => field !== undefined);
  const measures = candidate.valueFields.length;
  const parts = [
    ...grouping.map(
      (field) =>
        `${field.cardinality === undefined ? 'many' : String(field.cardinality)} ${titleOf(field.name)} values`,
    ),
    `${String(measures)} ${measures === 1 ? 'measure' : 'measures'}`,
  ];
  const reason = `${parts.join(' × ')} → ${CHART_TYPE_NAMES[candidate.chartType]}`;
  return reason.length <= MAX_REASON_LENGTH ? reason : `${reason.slice(0, MAX_REASON_LENGTH - 1)}…`;
}
