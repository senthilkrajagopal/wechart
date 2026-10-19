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
  /**
   * A dimension holding ISO-3 country codes, as the caller decided it
   * (AC-313): by its values, or as the model marks it. The recommender only
   * reads the answer; how it was reached is Cube's and the model's.
   */
  readonly countryCodes?: boolean;
  /**
   * The scale a measure's format puts its values on (T510; `scaleOf` in
   * @wechart/core): money in its currency, a share or a plain number, where
   * the caller knows its format. Measures of different scales can't share
   * one value axis. None reads as a plain number.
   */
  readonly scale?: string;
  /**
   * A measure's aggregation, as the model declares it (T969): whether its
   * shares of a total mean anything — a 100 % stack's need it summed.
   * Unknown reads as not summed.
   */
  readonly aggType?: string;
  /** A dimension of Cube's `geo` type: each value a place (T1012, AC-560). */
  readonly geo?: boolean;
  /**
   * A dimension that is a region key of a boundary set other than Countries
   * (AC-623), as the caller decided it: `admin1`, or `custom:‹id›` (T1012).
   */
  readonly regionSet?: string;
}

export interface Signature {
  readonly fields: readonly Field[];
  /** Rows the query is expected to return, where known. */
  readonly rowCount?: number;
  /**
   * The share of a vertical bar's category labels that would be hidden at
   * the tile's size, 0 to 1, where the caller knows it (T516; reckoned by
   * `hiddenLabelShare` in @wechart/charts, which this package can't import).
   */
  readonly hiddenLabels?: number;
  /**
   * The chart has a Target, a measure or a value (T968, AC-560): a bullet
   * chart's or a KPI's, as its options hold it. With one dimension it makes
   * a bullet chart the pick; with none, a KPI against it.
   */
  readonly target?: boolean;
  /**
   * The rules the chart is drawn by (T970, AC-562): those before R81's for a
   * chart saved in Auto before them, until its fields change — none of R81's
   * picks or offers then. Absent, the current ones.
   */
  readonly rules?: number;
}

/**
 * The chart-type vocabulary is owned by the spec in @wechart/core, not by the
 * recommender: it is what a saved chart is written in, and the renderer has to
 * agree with it. Re-exported here so the recommender's callers need not know
 * where it lives — but defined once, because two lists would drift and a
 * recommendation for a type the renderer never heard of fails at draw time.
 */
import type { ChartType } from '@wechart/core';

export type { ChartType };

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
  /**
   * A stacked bar or area at 100 %, each stack adding to the whole (T969,
   * AC-561): the same type as at Sum, offered beside it as its own pick.
   */
  readonly stack?: 'percent';
  /** A Map's layer: Points from a geo dimension, or Regions of a region key (T1012). */
  readonly mapLayer?: 'points' | 'regions';
  /** A Map's boundary set, where not Countries (T1012): `admin1`, `custom:‹id›`. */
  readonly boundarySet?: string;
  /** A Sankey's flows: the pairs of its two steps the query answered (T1012, AC-031). */
  readonly flows?: number;
}

export interface RuleOutcome {
  /** The rule's name, quoted in "Why this recommendation?"'s full table (AC-029). */
  readonly rule: string;
  readonly passed: boolean;
  /** Present when the rule rejected the candidate. */
  readonly reason?: string;
}
