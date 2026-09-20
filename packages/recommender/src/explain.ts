import { checkLegality } from './legality';
import { enumerate, score } from './recommend';
import type { Candidate, RuleOutcome, Signature } from './types';

/**
 * The trace behind "Why this chart?" (AC-029).
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
  readonly legal: boolean;
  /** Every rule's verdict, passed and failed alike. */
  readonly rules: readonly RuleOutcome[];
  /** Cost, where lower is better. Null for a candidate that was never ranked. */
  readonly score: number | null;
}

export interface Explanation {
  readonly signature: readonly FieldTrace[];
  readonly candidates: readonly CandidateTrace[];
}

export function explain(signature: Signature): Explanation {
  const candidates = enumerate(signature).map((candidate: Candidate): CandidateTrace => {
    const rules = checkLegality(candidate);
    const legal = rules.every((outcome) => outcome.passed);

    return {
      chartType: candidate.chartType,
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
  };
}
