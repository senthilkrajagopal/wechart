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
  /**
   * The cube it belongs to (AC-215): its own, or — for a view's member — the
   * cube its `aliasMember` names (research/cube/data-modeling.md).
   */
  readonly cube: string;
  /** A measure's aggregation, as Cube reports it: count, sum, avg… */
  readonly aggType?: string;
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
  aggType?: string;
  aliasMember?: string;
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
      cube: (member.aliasMember ?? member.name ?? cubeName).split('.')[0] ?? cubeName,
      ...(typeof member.aggType === 'string' ? { aggType: member.aggType } : {}),
    }));

  return [
    ...read(cube.measures, 'measure'),
    ...read(cube.dimensions, 'dimension'),
    ...read(cube.segments, 'segment'),
  ];
}

/**
 * Each shown member's title, for every cube and view (AC-220): what a legend,
 * a tooltip, a table's headers and the "Why this chart?" trace call it — a
 * chart may name members of more than one cube, so not only the selected one.
 */
export function titlesOf(meta: unknown): Record<string, string> {
  const titles: Record<string, string> = {};
  for (const cube of cubesFrom(meta))
    for (const member of membersOf(meta, cube.name))
      if (!(member.name in titles)) titles[member.name] = member.title;
  return titles;
}

/**
 * Each shown member's short title ("Count" for "Orders Count"), for where its
 * cube is evident: a one-source chart's legend and KPI label (T403, AC-220).
 */
export function shortTitlesOf(meta: unknown): Record<string, string> {
  const titles: Record<string, string> = {};
  for (const cube of cubesFrom(meta))
    for (const member of membersOf(meta, cube.name))
      if (!(member.name in titles)) titles[member.name] = member.shortTitle;
  return titles;
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
        formatDescription?: { name?: unknown; specifier?: unknown; currency?: unknown };
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
      // A link or image address is text, whatever number format sits beside
      // it (T201's review): kept by name, which writes it as it came.
      if (format === 'link' || format === 'imageUrl') {
        formats[name] = format;
        continue;
      }
      const specifier = formatDescription?.specifier;
      const code = formatDescription?.currency ?? currency;
      const called = formatDescription?.name;
      if (typeof specifier === 'string')
        formats[name] = {
          specifier,
          ...(typeof called === 'string' ? { name: called } : {}),
          ...(typeof code === 'string' ? { currency: code } : {}),
        };
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

/**
 * Members by the cube they belong to (AC-215), in the order the cubes first
 * appear — the source's own first — and within each, by type (AC-025).
 */
export function groupByCube(members: readonly Member[]): [string, [MemberKind, Member[]][]][] {
  const cubes = [...new Set(members.map((member) => member.cube))];
  return cubes.map((cube) => [
    cube,
    groupMembers(members.filter((member) => member.cube === cube)),
  ]);
}

/**
 * Whether a member answers a search (AC-215): by any word of its titles or
 * its name, ignoring case.
 */
export function matchesSearch(member: Member, search: string): boolean {
  const needle = search.trim().toLowerCase();
  if (needle === '') return true;
  return [member.title, member.shortTitle, member.name].some((text) =>
    text.toLowerCase().includes(needle),
  );
}

/**
 * What a field row says of a member besides its title (AC-215): a measure's
 * aggregation, "time" for a time dimension, a dimension's type.
 */
export function fieldMetaOf(member: Member): string {
  if (member.kind === 'measure') return member.aggType ?? member.type;
  if (member.kind === 'timeDimension') return 'time';
  if (member.kind === 'segment') return 'segment';
  return member.type;
}
