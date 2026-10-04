import { folderChain } from '../workspaces/explore/folders';
import type { FolderNode } from '../workspaces/explore/FolderTree';
import { modelHref } from '../workspaces/model/inFolder';
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
  /** A second line: a field's cube or view, by title, and a folder's path; or nothing. */
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
  readonly title?: string;
  /** Where xcube published it, and its name there (`meta.xcube`, T450). */
  readonly meta?: {
    readonly xcube?: { readonly folderId?: unknown; readonly shortName?: unknown };
  };
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
  /** The folders, each with its xcube id: where a folder's cube is said to be (T450). */
  readonly folders?: readonly FolderNode[];
}

/** An identifier in words, "sales_lines" as "Sales lines", for a name with no title. */
const inWords = (name: string) =>
  name.replace(/_/g, ' ').replace(/^./, (first) => first.toUpperCase());

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
    // A folder's cube by its short name, its title and its folder path;
    // never its prefixed name (T450, AC-329). The root's, as before.
    const xcube = cube.meta?.xcube;
    const inFolder =
      typeof xcube?.folderId === 'string' &&
      xcube.folderId !== 'froot' &&
      typeof xcube.shortName === 'string'
        ? { folderId: xcube.folderId, shortName: xcube.shortName }
        : undefined;
    const kind = cube.type === 'view' ? 'View' : 'Cube';
    const folder = inFolder && sources.folders?.find((each) => each.xcubeId === inFolder.folderId);
    // Its cube or view by title, and a folder's by its path too: never an id
    // (T478, AC-220; UX-013, UX-102).
    const cubeTitle = cube.title ?? inWords(inFolder?.shortName ?? cube.name);
    const owner = [
      `${kind} ${cubeTitle}`,
      ...(folder === undefined
        ? []
        : [
            folderChain(sources.folders ?? [], folder.id)
              .map((crumb) => crumb.title)
              .join(' / '),
          ]),
    ].join(' · ');
    const shown = (name: string) =>
      inFolder === undefined ? name : `${inFolder.shortName}${name.slice(cube.name.length)}`;
    /** A member with no title, in words: its cube's title, then its own name. */
    const titleOf = (member: MetaMember) =>
      member.title ?? `${cubeTitle} ${inWords(member.name.slice(cube.name.length + 1))}`;
    const members = [
      ...(cube.measures ?? []).map((member) => ({ member, type: 'Measure' as const })),
      ...(cube.dimensions ?? []).map((member) => ({ member, type: 'Dimension' as const })),
    ];
    for (const { member, type } of members) {
      // A member the model hides is not one to offer: it cannot be queried.
      if (member.public === false || member.isVisible === false) continue;
      if (!matches(member.title, member.shortTitle, shown(member.name))) continue;
      fields.push({
        key: `field:${member.name}`,
        type,
        title: titleOf(member),
        detail: owner,
        // A folder's cube, in its folder's model, whose files search doesn't
        // hold: never the root's Model workspace (T530, AC-222).
        href: folder ? modelHref(folder.id) : openFile(fileOf.get(cube.name)),
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
