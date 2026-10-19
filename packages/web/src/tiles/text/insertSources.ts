import type { DashboardDocument } from '../../dashboard/model/document';
import { cubesFrom, membersOf } from '../../editor/fields';
import type { InsertSources } from './InsertMenu';

/** A member's name, `cube.member`, as any string of a chart or a document holds it. */
const MEMBER = /"([A-Za-z_][A-Za-z0-9_]*)\.[A-Za-z_][A-Za-z0-9_]*"/g;

/**
 * What a dashboard's Text tiles can insert (T881, AC-517; decision T881-1):
 * the measures of the cubes its charts and Text elements name, by cube, each
 * by its short title, or every cube's while it names none; its markings; and
 * its filters that have a field, by the field's title.
 */
export function insertSourcesOf({
  model,
  dashboard,
  documents,
  memberTitle,
}: {
  readonly model: unknown;
  readonly dashboard: DashboardDocument;
  readonly documents: unknown;
  readonly memberTitle?: ((member: string) => string | undefined) | undefined;
}): InsertSources {
  const named = new Set<string>();
  for (const held of [documents, dashboard.pages])
    for (const [, cube] of (JSON.stringify(held ?? null) ?? '').matchAll(MEMBER))
      if (cube !== undefined) named.add(cube);
  const cubes = cubesFrom(model);
  const used = cubes.filter((cube) => named.has(cube.name));
  return {
    cubes: (used.length > 0 ? used : cubes)
      .map((cube) => ({
        name: cube.name,
        title: cube.title,
        measures: membersOf(model, cube.name)
          .filter((member) => member.kind === 'measure')
          .map((member) => ({ name: member.name, title: member.shortTitle })),
        dimensions: membersOf(model, cube.name)
          // A string field: an own filter is one of its values, or not (T868-1).
          .filter((member) => member.kind === 'dimension' && member.type === 'string')
          .map((member) => ({ name: member.name, title: member.shortTitle })),
      }))
      .filter((cube) => cube.measures.length > 0),
    markings: (dashboard.markings ?? []).map((marking) => ({ name: marking.name })),
    filters: (dashboard.filters ?? []).flatMap((filter) =>
      filter.member === undefined
        ? []
        : [{ id: filter.id, name: memberTitle?.(filter.member) ?? filter.member }],
    ),
    // Its parameters, by name (F46): a Parameter control's, and a Value's in a measure's place.
    parameters: (dashboard.parameters ?? []).map(({ id, name }) => ({ id, name })),
  };
}
