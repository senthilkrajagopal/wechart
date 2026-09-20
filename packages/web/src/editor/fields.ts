/**
 * Reading Cube's `/v1/meta` into the field list the chart editor shows
 * (AC-025).
 *
 * Time dimensions are not a separate array in Cube's metadata: they are
 * dimensions whose `type` is `time`. Listing them with the other dimensions
 * would bury the one field most charts are built around, so they are their own
 * group here.
 */

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
