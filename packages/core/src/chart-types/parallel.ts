/**
 * Parallel coordinates (T981, AC-597, AC-037; design 23 sheet 7; direction.md
 * rule 159): one line per member of Line by across 3 or more measure axes,
 * in the order of Metrics, coloured by an optional dimension, on a Scale of
 * "Each axis, min to max" (the default) or "Shared".
 *
 * Line by and Colour are the chart's first and second dimensions, and the
 * axes its measures, so its one grouped Cube query is the editor's as it is.
 * Only Scale is the type's own setting, stored sparse as `options.parallel`.
 */
import type { MemberFormat } from '../format';
import type { ChartTypeModule } from './index';

export const PARALLEL_SCALES = ['each', 'shared'] as const;
export type ParallelScale = (typeof PARALLEL_SCALES)[number];

export interface ParallelSettings {
  readonly scale: ParallelScale;
}

/** The least number of measure axes a parallel-coordinates chart draws. */
export const MIN_PARALLEL_AXES = 3;

const DEFAULT_PARALLEL: ParallelSettings = { scale: 'each' };

function parse(stored: unknown): ParallelSettings {
  const scale =
    typeof stored === 'object' && stored !== null
      ? (stored as Record<string, unknown>)['scale']
      : undefined;
  return scale === 'shared' ? { scale } : DEFAULT_PARALLEL;
}

/** Sparse: Each axis, the default, is stored as nothing. */
function save(settings: ParallelSettings): Record<string, unknown> | undefined {
  return settings.scale === 'each' ? undefined : { scale: settings.scale };
}

export const parallelModule: ChartTypeModule<ParallelSettings> = {
  type: 'parallel',
  parse,
  save,
};

/** With fewer than 3 measures, what the chart needs (AC-597); nothing from 3. */
export function tooFewMeasures(count: number): string | undefined {
  return count >= MIN_PARALLEL_AXES
    ? undefined
    : `Parallel coordinates need at least ${String(MIN_PARALLEL_AXES)} measures; there are ${String(count)}. Add a measure, or use Scatter.`;
}

type Format = string | MemberFormat | undefined;

/** A format as one key: a model's format by its name, or its specifier and currency. */
function formatKey(format: Format): string {
  if (format === undefined) return 'plain numbers';
  if (typeof format === 'string') return format;
  return format.name ?? [format.specifier, format.currency].filter(Boolean).join(' ');
}

/**
 * Why Shared can't be chosen: the measures are in more than one format, named
 * in their order (AC-597); nothing when they share one.
 */
export function sharedScaleRefusal(formats: readonly Format[]): string | undefined {
  const keys = [...new Set(formats.map(formatKey))];
  if (keys.length <= 1) return undefined;
  const named = `${keys.slice(0, -1).join(', ')} and ${keys.at(-1) ?? ''}`;
  return `Shared needs every measure in one format; these are in ${named}.`;
}

export interface Parallel {
  /** One line per member of this dimension. */
  readonly lineBy?: string;
  /** Each line coloured by this dimension's member. */
  readonly colour?: string;
  /** One axis per measure, in order. */
  readonly axes: readonly string[];
  readonly scale: ParallelScale;
}

/**
 * A chart read as parallel coordinates. Given its measures' formats, a stored
 * Shared that they refuse reads as Each axis, so it is never drawn.
 */
export function parallelOf(
  chart: {
    readonly wells: {
      readonly measures: readonly string[];
      readonly dimensions: readonly string[];
    };
    readonly options?: Readonly<Record<string, unknown>> | undefined;
  },
  formats?: readonly Format[],
): Parallel {
  const [lineBy, colour] = chart.wells.dimensions;
  const { scale } = parse(chart.options?.['parallel']);
  return {
    ...(lineBy === undefined ? {} : { lineBy }),
    ...(colour === undefined ? {} : { colour }),
    axes: [...chart.wells.measures],
    scale: formats !== undefined && sharedScaleRefusal(formats) !== undefined ? 'each' : scale,
  };
}
