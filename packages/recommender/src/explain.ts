import { checkLegality } from './legality';
import { enumerate, score } from './recommend';
import type { Candidate, RuleOutcome, Signature } from './types';

/**
 * The trace behind "Why this recommendation?" and its full table (AC-029, as amended by R76).
 *
 * It includes the candidates that were **rejected**, with the rules that
 * rejected them. A trace of only the winner answers "what did you pick" and
 * not "why not the one I expected", which is the question someone opens this
 * to ask.
 */
export interface FieldTrace {
  readonly name: string;
  readonly kind: string;
  /** Null when nothing knows it — which the capacity rules treat as large. */
  readonly cardinality: number | null;
}

export interface CandidateTrace {
  readonly chartType: string;
  /** A stacked type at 100 % (T969), traced apart from it at Sum. */
  readonly stack?: 'percent';
  readonly legal: boolean;
  /** Every rule's verdict, passed and failed alike. */
  readonly rules: readonly RuleOutcome[];
  /** Cost, where lower is better. Null for a candidate that was never ranked. */
  readonly score: number | null;
}

export interface Explanation {
  readonly signature: readonly FieldTrace[];
  readonly candidates: readonly CandidateTrace[];
  /**
   * What the one-value-axis rule says of a second axis the author drew in a
   * combo (AC-510, design 20 state L); none while there is none.
   */
  readonly oneValueAxis?: string;
}

/** What the chart drawn has beyond the recommendation, by the author's hand. */
export interface DrawnByHand {
  /** A combo series the author put on the right axis (AC-497, rule 117). */
  readonly secondAxisByHand?: boolean;
}

/** The one-value-axis rule's line while the author drew a second axis (AC-510). */
export const SECOND_AXIS_BY_HAND = 'You drew a second axis by hand; the recommender never does';

/**
 * The trace for a signature. What the author drew by hand is said, never
 * weighed: the candidates and their order depend on the signature alone, so
 * a second axis drawn by hand leaves the recommendation as it is (AC-510,
 * AC-030).
 */
export function explain(signature: Signature, drawn: DrawnByHand = {}): Explanation {
  const candidates = enumerate(signature).map((candidate: Candidate): CandidateTrace => {
    const rules = checkLegality(candidate);
    const legal = rules.every((outcome) => outcome.passed);

    return {
      chartType: candidate.chartType,
      ...(candidate.stack === undefined ? {} : { stack: candidate.stack }),
      legal,
      rules,
      score: legal ? score(candidate, signature) : null,
    };
  });

  return {
    signature: signature.fields.map((field) => ({
      name: field.name,
      kind: field.kind,
      cardinality: field.cardinality ?? null,
    })),
    // Legal first and cheapest first, so the trace reads in the order the
    // recommendation was made.
    candidates: [...candidates].sort((a, b) => {
      if (a.legal !== b.legal) return a.legal ? -1 : 1;
      return (a.score ?? Number.POSITIVE_INFINITY) - (b.score ?? Number.POSITIVE_INFINITY);
    }),
    ...(drawn.secondAxisByHand === true ? { oneValueAxis: SECOND_AXIS_BY_HAND } : {}),
  };
}
