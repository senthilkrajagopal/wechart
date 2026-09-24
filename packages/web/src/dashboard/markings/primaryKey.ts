/**
 * The dimension that identifies a row of a cube (AC-092).
 *
 * Rows are markable only where there is one: a marked row is stored as that
 * row's identity, and without a key there is nothing to store that would
 * still mean the same row after a filter changes. Cube says which dimension
 * it is — `primaryKey: true` on a dimension in `/v1/meta`
 * (`docs/research/cube/data-apis.md`).
 *
 * A hidden member does not count. `/v1/meta` omits members the model marks
 * `public: false`, and one that cannot be queried cannot identify a row in an
 * answer either.
 */
interface RawDimension {
  readonly name?: string;
  readonly primaryKey?: boolean;
  readonly public?: boolean;
  readonly isVisible?: boolean;
  readonly shown?: boolean;
}

interface RawCube {
  readonly name?: string;
  readonly dimensions?: readonly RawDimension[];
}

export function primaryKeyOf(meta: unknown, cubeName: string): string | undefined {
  const cubes = (meta as { cubes?: readonly RawCube[] } | null | undefined)?.cubes ?? [];
  const cube = cubes.find((candidate) => candidate.name === cubeName);
  const key = (cube?.dimensions ?? []).find(
    (dimension) =>
      dimension.primaryKey === true &&
      dimension.public !== false &&
      dimension.isVisible !== false &&
      dimension.shown !== false,
  );
  return key?.name === undefined || key.name === '' ? undefined : key.name;
}
