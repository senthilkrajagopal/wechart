/**
 * Reading Cube's `/v1/meta` into the field list the chart editor shows
 * (AC-025).
 *
 * Time dimensions are not a separate array in Cube's metadata: they are
 * dimensions whose `type` is `time`. Listing them with the other dimensions
 * would bury the one field most charts are built around, so they are their own
 * group here.
 */
import type { MemberFormat } from '@wechart/core';

export type MemberKind = 'measure' | 'dimension' | 'timeDimension' | 'segment';

export interface Member {
  readonly name: string;
  readonly title: string;
  readonly shortTitle: string;
  readonly kind: MemberKind;
  readonly type: string;
}

export interface CubeSummary {
  readonly name: string;
  readonly title: string;
  /** Cube distinguishes a cube from a view; the editor shows both. */
  readonly isView: boolean;
  readonly description?: string;
}

interface RawMember {
  name?: string;
  title?: string;
  shortTitle?: string;
  type?: string;
  isVisible?: boolean;
  public?: boolean;
}

interface RawCube {
  name?: string;
  title?: string;
  type?: string;
  isVisible?: boolean;
  public?: boolean;
  description?: string;
  measures?: RawMember[];
  dimensions?: RawMember[];
  segments?: RawMember[];
}

/**
 * A member Cube marks as not visible or not public must not appear. Cube
 * usually omits them, but says so explicitly when it does not, and a field list
 * that offers a hidden member produces queries Cube then rejects.
 */
function isShown(member: RawMember | RawCube): boolean {
  return member.isVisible !== false && member.public !== false;
}

export function cubesFrom(meta: unknown): CubeSummary[] {
  const cubes = (meta as { cubes?: RawCube[] } | null)?.cubes ?? [];

  return cubes.filter(isShown).map((cube) => ({
    name: cube.name ?? '',
    title: cube.title ?? cube.name ?? '',
    isView: cube.type === 'view',
    ...(cube.description === undefined ? {} : { description: cube.description }),
  }));
}

export function membersOf(meta: unknown, cubeName: string): Member[] {
  const cube = ((meta as { cubes?: RawCube[] } | null)?.cubes ?? []).find(
    (candidate) => candidate.name === cubeName,
  );
  if (!cube) return [];

  const read = (raw: RawMember[] | undefined, kind: MemberKind): Member[] =>
    (raw ?? []).filter(isShown).map((member) => ({
      name: member.name ?? '',
      title: member.title ?? member.name ?? '',
      shortTitle: member.shortTitle ?? member.title ?? member.name ?? '',
      kind: kind === 'dimension' && member.type === 'time' ? 'timeDimension' : kind,
      type: member.type ?? 'string',
    }));

  return [
    ...read(cube.measures, 'measure'),
    ...read(cube.dimensions, 'dimension'),
    ...read(cube.segments, 'segment'),
  ];
}

/**
 * The `format` each member declares in the model, for every cube (AC-046).
 *
 * Across all cubes rather than the selected one: a chart names its members in
 * full (`orders.total_amount`), and a saved chart opened before its cube is
 * selected should still know how to write its numbers.
 */
export function formatsOf(meta: unknown): Record<string, string | MemberFormat> {
  const formats: Record<string, string | MemberFormat> = {};

  for (const cube of (meta as { cubes?: RawCube[] } | null)?.cubes ?? []) {
    for (const member of [...(cube.measures ?? []), ...(cube.dimensions ?? [])]) {
      const { name, format, formatDescription, currency } = member as RawMember & {
        format?: unknown;
        formatDescription?: { specifier?: unknown; currency?: unknown };
        currency?: unknown;
      };
      /**
       * Only a member that declares a format. One that does not is written
       * as Cube's plain number anyway, and a number *dimension* with none —
       * an id — is left as it came rather than grouped (T195).
       */
      if (typeof name !== 'string' || format === undefined || format === null) continue;
      const time = (format as { type?: unknown; value?: unknown }).type === 'custom-time';
      const pattern = (format as { value?: unknown }).value;
      if (time && typeof pattern === 'string') {
        formats[name] = { time: pattern };
        continue;
      }
      /**
       * The d3 specifier Cube reports for the format, whether named, custom
       * or `currency_N` (T201; research/cube/data-modeling.md, "What
       * `/v1/meta` reports for each format") — Cube's meaning, not a copy.
       */
      const specifier = formatDescription?.specifier;
      const code = formatDescription?.currency ?? currency;
      if (typeof specifier === 'string')
        formats[name] = { specifier, ...(typeof code === 'string' ? { currency: code } : {}) };
      else if (typeof format === 'string') formats[name] = format;
    }
  }

  return formats;
}

export const GROUP_LABELS: Record<MemberKind, string> = {
  measure: 'Measures',
  dimension: 'Dimensions',
  timeDimension: 'Time dimensions',
  segment: 'Segments',
};

export const GROUP_ORDER: MemberKind[] = ['measure', 'dimension', 'timeDimension', 'segment'];

export function groupMembers(members: readonly Member[]): [MemberKind, Member[]][] {
  return GROUP_ORDER.map(
    (kind) => [kind, members.filter((member) => member.kind === kind)] as [MemberKind, Member[]],
  ).filter(([, group]) => group.length > 0);
}
