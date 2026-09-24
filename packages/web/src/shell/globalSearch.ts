import { objectsOf } from '../workspaces/model/objects';

/**
 * What the ⌘K palette finds (AC-191, R9): dashboards and library charts from
 * the catalog, and — as the prototype's "Search fields, charts, models"
 * promises — Cube fields from the model's metadata and the model's files.
 *
 * A pure function over what the page already holds: the catalog's search
 * answer, `/api/meta` and `/api/model/files`, each fetched and cached by the
 * screens that use them. Every result carries its type in words, so two things
 * of the same name are told apart without an icon, and where it opens.
 */
export interface SearchResult {
  readonly key: string;
  readonly type: 'Dashboard' | 'Chart' | 'Measure' | 'Dimension' | 'Model file';
  readonly title: string;
  /** A second line: a field's name and owner, or nothing. */
  readonly detail?: string;
  readonly href: string;
}

interface CatalogHit {
  readonly kind: 'dashboard' | 'chart';
  readonly id: string;
  readonly title: string;
}

interface MetaMember {
  readonly name: string;
  readonly title?: string;
  readonly shortTitle?: string;
  readonly public?: boolean;
  readonly isVisible?: boolean;
}

interface MetaCube {
  readonly name: string;
  readonly type?: string;
  readonly isVisible?: boolean;
  readonly public?: boolean;
  readonly measures?: readonly MetaMember[];
  readonly dimensions?: readonly MetaMember[];
}

export interface SearchSources {
  readonly catalog: readonly CatalogHit[];
  readonly meta: unknown;
  readonly files: readonly { readonly path: string; readonly content: string }[];
}

export function globalResults(text: string, sources: SearchSources): SearchResult[] {
  const needle = text.trim().toLowerCase();
  if (needle === '') return [];
  const matches = (...values: (string | undefined)[]) =>
    values.some((value) => value?.toLowerCase().includes(needle) === true);

  const catalog: SearchResult[] = sources.catalog.map((hit) => ({
    key: `${hit.kind}:${hit.id}`,
    type: hit.kind === 'dashboard' ? 'Dashboard' : 'Chart',
    title: hit.title,
    href: `/explore/${hit.kind}s/${encodeURIComponent(hit.id)}`,
  }));

  // Which file defines each cube or view, read by the Model workspace's own
  // parser — so a field opens where its definition is.
  const fileOf = new Map<string, string>();
  for (const file of sources.files)
    for (const object of objectsOf(file.path, file.content).objects)
      if (!fileOf.has(object.name)) fileOf.set(object.name, file.path);
  const openFile = (path: string | undefined) =>
    path === undefined ? '/model' : `/model/files/${encodeURIComponent(path)}`;

  // A cube or view the model hides takes its members with it: none of them
  // can be queried, so none is offered.
  const cubes = ((sources.meta as { cubes?: readonly MetaCube[] } | null)?.cubes ?? []).filter(
    (cube) => typeof cube.name === 'string' && cube.isVisible !== false && cube.public !== false,
  );
  const fields: SearchResult[] = [];
  for (const cube of cubes) {
    const owner = `${cube.type === 'view' ? 'view' : 'cube'} ${cube.name}`;
    const members = [
      ...(cube.measures ?? []).map((member) => ({ member, type: 'Measure' as const })),
      ...(cube.dimensions ?? []).map((member) => ({ member, type: 'Dimension' as const })),
    ];
    for (const { member, type } of members) {
      // A member the model hides is not one to offer: it cannot be queried.
      if (member.public === false || member.isVisible === false) continue;
      if (!matches(member.title, member.shortTitle, member.name)) continue;
      fields.push({
        key: `field:${member.name}`,
        type,
        title: member.title ?? member.name,
        detail: `${member.name} · ${owner}`,
        href: openFile(fileOf.get(cube.name)),
      });
    }
  }

  const models: SearchResult[] = sources.files
    .filter((file) => matches(file.path))
    .map((file) => ({
      key: `file:${file.path}`,
      type: 'Model file',
      title: file.path,
      href: openFile(file.path),
    }));

  // Every match: AC-191 fails on "a matching field is missing", so a short
  // search lists all it finds and the list scrolls, rather than cutting it.
  return [...catalog, ...fields, ...models];
}
