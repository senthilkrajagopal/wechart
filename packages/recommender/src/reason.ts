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
  return capped(reason);
}

const capped = (reason: string) =>
  reason.length <= MAX_REASON_LENGTH ? reason : `${reason.slice(0, MAX_REASON_LENGTH - 1)}…`;

/** "categories", from "Category": a title as a count of its values says it. */
function pluralOf(title: string): string {
  const lower = title.toLowerCase();
  if (/[^aeiou]y$/.test(lower)) return `${lower.slice(0, -1)}ies`;
  if (/(s|x|z|ch|sh)$/.test(lower)) return `${lower}es`;
  return `${lower}s`;
}

const countOf = (field: Field | undefined) =>
  field?.cardinality === undefined ? 'Many' : String(field.cardinality);

/**
 * An R81 runner-up's reason from the data, in AC-561's words (T969): its
 * fields by their titles (AC-220) and counts — "Channel mix in each Region,
 * every bar adding to 100 %.", "42 categories, each with a trend: a row per
 * category, with sparklines." Undefined for any other candidate, whose
 * reason is the recommender's own. At most 80 characters (AC-028).
 */
export function runnerUpReasonFor(
  candidate: Candidate,
  titleOf: (name: string) => string,
): string | undefined {
  const { chartType, categoryField, colorField, facetField, valueFields } = candidate;
  const title = (field: Field | undefined) => (field === undefined ? '' : titleOf(field.name));
  if (candidate.stack === 'percent')
    return capped(
      chartType === 'stackedArea'
        ? `${title(colorField)} mix over ${title(categoryField)}, every point adding to 100 %.`
        : `${title(colorField)} mix in each ${title(categoryField)}, every bar adding to 100 %.`,
    );
  if (chartType === 'graphicalTable' && categoryField !== undefined)
    return capped(
      `${countOf(categoryField)} ${pluralOf(title(categoryField))}, each with a trend: a row per ${title(categoryField).toLowerCase()}, with sparklines.`,
    );
  if (chartType === 'kpi' && facetField !== undefined)
    return capped(
      `A KPI per ${title(facetField)}: ${countOf(facetField)} tiles, each this period’s number and its trend.`,
    );
  if (chartType === 'parallel' && categoryField !== undefined)
    return capped(
      `${String(valueFields.length)} measures across ${countOf(categoryField)} ${title(categoryField)} values: a line per member.`,
    );
  return undefined;
}
