/**
 * What the recommender reasons over.
 *
 * Deliberately not Cube's metadata shape and not a chart spec: the recommender
 * takes a *signature* — what kinds of field there are and how many distinct
 * values each has — and produces candidates. Anything Cube-specific stays
 * outside it (docs/research/recommender-algorithms.md).
 */

export type FieldKind = 'measure' | 'dimension' | 'timeDimension';

export interface Field {
  readonly name: string;
  readonly kind: FieldKind;
  /** Distinct values, where known. Several rules are cardinality rules. */
  readonly cardinality?: number;
}

export interface Signature {
  readonly fields: readonly Field[];
  /** Rows the query is expected to return, where known. */
  readonly rowCount?: number;
}

export type ChartType =
  | 'bar'
  | 'hbar'
  | 'groupedBar'
  | 'stackedBar'
  | 'line'
  | 'multiLine'
  | 'area'
  | 'stackedArea'
  | 'scatter'
  | 'pie'
  | 'donut'
  | 'treemap'
  | 'heatmap'
  | 'kpi'
  | 'table'
  | 'pivot'
  | 'trellis'
  | 'combo';

/**
 * A chart the recommender is considering: the type, and which fields sit on
 * which channel.
 */
export interface Candidate {
  readonly chartType: ChartType;
  /** Measures drawn against a value axis. */
  readonly valueFields: readonly Field[];
  /** The category axis, if any. */
  readonly categoryField?: Field;
  /** The colour channel, if any. */
  readonly colorField?: Field;
  /** The field a trellis is split by, if any. */
  readonly facetField?: Field;
  /** The second axis of a heatmap, if any. */
  readonly secondCategoryField?: Field;
  /**
   * How many value axes the candidate draws against. Two is never legal
   * (AC-030); it is stated rather than inferred so a candidate cannot smuggle
   * one in through an encoding the rules do not know about.
   */
  readonly valueAxisCount: number;
}

export interface RuleOutcome {
  /** The rule's name, quoted in the "Why this chart?" trace (AC-029). */
  readonly rule: string;
  readonly passed: boolean;
  /** Present when the rule rejected the candidate. */
  readonly reason?: string;
}
