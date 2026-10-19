/**
 * @wechart/recommender — legality rules and weighted scoring for chart
 * recommendation. Draco 2 is a reference only, never a dependency: it needs
 * Python and clingo, and its shipped weights are hand-tuned rather than learned
 * (docs/research/recommender-algorithms.md).
 */
export const PACKAGE_NAME = '@wechart/recommender';

export { CAPS, HARD_RULES, checkLegality, isLegal } from './legality';
export {
  MAX_REASON_LENGTH,
  SOFT_RULES,
  enumerate,
  recommend,
  score,
  type Recommendation,
  type Recommendations,
} from './recommend';
export { dataReasonFor } from './reason';
export {
  explain,
  SECOND_AXIS_BY_HAND,
  type CandidateTrace,
  type DrawnByHand,
  type Explanation,
  type FieldTrace,
} from './explain';
export {
  REQUIREMENTS,
  canDraw,
  describeMissing,
  missingFor,
  type FieldCounts,
  type Requirement,
  type WellName,
} from './requirements';
export type { Candidate, ChartType, Field, FieldKind, RuleOutcome, Signature } from './types';
export { warningsFor } from './warnings';
