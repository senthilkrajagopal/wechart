import { objectsOf } from './objects';
import { modelOf } from './sync';

/**
 * The model's join graph (T144, AC-138): every cube, and every join, from
 * the cube that declares it to the cube it names — a join is declared on the
 * cube it starts from (research Y.5), so that is its direction.
 */
export interface GraphCube {
  readonly name: string;
  readonly path: string;
  readonly dimensions: number;
  readonly measures: number;
}

export interface GraphJoin {
  readonly from: string;
  readonly to: string;
  readonly relationship: string;
}

export interface JoinGraph {
  readonly cubes: readonly GraphCube[];
  readonly joins: readonly GraphJoin[];
  /** Cubes a join names that no file defines: drawn too, so no join is left out. */
  readonly missing: readonly string[];
}

type Value = Record<string, unknown>;

const objects = (list: unknown): Value[] =>
  (Array.isArray(list) ? (list as unknown[]) : []).filter(
    (each): each is Value => each !== null && typeof each === 'object' && !Array.isArray(each),
  );

export function joinGraphOf(files: readonly { path: string; content: string }[]): JoinGraph {
  const cubes: GraphCube[] = [];
  const joins: GraphJoin[] = [];
  for (const file of files) {
    // Code and templates define their cubes only when Cube runs them.
    const read = objectsOf(file.path, file.content);
    if (read.code !== undefined || read.problem !== undefined) continue;
    for (const cube of objects(modelOf(file.content).model?.cubes)) {
      const name = cube['name'];
      if (typeof name !== 'string') continue;
      cubes.push({
        name,
        path: file.path,
        dimensions: objects(cube['dimensions']).length,
        measures: objects(cube['measures']).length,
      });
      for (const join of objects(cube['joins'])) {
        const to = join['name'];
        if (typeof to !== 'string') continue;
        const relationship = join['relationship'];
        joins.push({
          from: name,
          to,
          relationship: typeof relationship === 'string' ? relationship : '',
        });
      }
    }
  }
  const defined = new Set(cubes.map((cube) => cube.name));
  const missing = [...new Set(joins.map((join) => join.to))].filter((to) => !defined.has(to));
  return { cubes, joins, missing };
}
