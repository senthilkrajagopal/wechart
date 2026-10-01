import type { Checked, Refusal } from './DeleteDialog';
import { fileHref } from '../model/inFolder';
import { exploreHref } from './folders';
import { SHARED_ROOT } from './roots';

/**
 * What the server says depends on an item, turned into design 14's dialogs
 * (T517; states A–E): asked before the dialog chooses between Can't delete
 * and the confirmation, and answered again, the same way, by the delete's
 * own `409`.
 */
type Step = { readonly id: string; readonly title: string };

/** A folder's path from Shared, as the dialogs name it: "Sales / EMEA", or "Shared". */
export const pathText = (path: readonly Step[]): string =>
  path.length === 0 ? SHARED_ROOT.title : path.map((step) => step.title).join(' / ');

/** The server's reason, or the status, for an answer that is neither done nor refused. */
async function failure(response: Response, what: string): Promise<Error> {
  const said = (await response.json().catch(() => ({}))) as { error?: string; message?: string };
  return new Error(said.error ?? said.message ?? `${what} (${String(response.status)}).`);
}

/** A library chart's dependents (T517, AC-362): the shared folders' dashboards that show it. */
export interface ChartDependents {
  readonly dashboards: readonly {
    readonly id: string;
    readonly title: string;
    readonly folderId: string | null;
    readonly folderPath: readonly Step[];
  }[];
  /** Those in folders the user can't see: counted, never named (AC-322). */
  readonly hidden: number;
}

const dashboards = (count: number) => `${String(count)} dashboard${count === 1 ? '' : 's'}`;

/**
 * Design 14's state A: what uses the chart, and what to do. The line on
 * proposals is left out with sign-in off, where dashboards change in place.
 */
export function chartRefusal(
  found: ChartDependents,
  { signedIn, justNow = false }: { readonly signedIn: boolean; readonly justNow?: boolean },
): Refusal | undefined {
  const total = found.dashboards.length + found.hidden;
  if (total === 0) return undefined;
  if (found.dashboards.length === 0 && !justNow)
    return {
      kind: 'refused',
      lead: `${dashboards(total)} ${total === 1 ? 'uses' : 'use'} it, in folders you can’t see. It can be deleted once no dashboard uses it.`,
    };
  return {
    kind: 'refused',
    lead: justNow
      ? total === 1
        ? 'A dashboard started using it just now. Nothing was deleted.'
        : `${dashboards(total)} use it now. Nothing was deleted.`
      : total === 1
        ? '1 dashboard uses it. Remove it from the dashboard, then delete it.'
        : `${dashboards(total)} use it. Remove it from each of them, then delete it.`,
    ...(found.dashboards.length === 0
      ? {}
      : {
          groups: [
            {
              heading: 'Dashboards that use it',
              rows: found.dashboards.map((dashboard) => ({
                key: dashboard.id,
                icon: 'dashboard' as const,
                name: dashboard.title,
                href: `/explore/dashboards/${encodeURIComponent(dashboard.id)}`,
                where: pathText(dashboard.folderPath),
              })),
            },
          ],
        }),
    ...(found.hidden === 0 ? {} : { hidden: found.hidden }),
    ...(signedIn && found.dashboards.length > 0
      ? { help: 'A shared dashboard changes through Edit in my workspace and a proposal.' }
      : {}),
  };
}

/** Asks what uses a library chart, for its dialog (state A1). */
export const checkChart = (id: string, signedIn: boolean) => async (): Promise<Checked> => {
  const response = await fetch(`/api/documents/chart/${encodeURIComponent(id)}/dependents`);
  if (!response.ok) throw await failure(response, 'What uses it couldn’t be read');
  const found = (await response.json()) as ChartDependents;
  return chartRefusal(found, { signedIn }) ?? { kind: 'confirm', text: 'No dashboard uses it.' };
};

/** A data source's dependents (T519, T526; AC-364): the published cubes bound to it. */
export interface SourceDependents {
  readonly cubes: readonly {
    readonly name: string;
    readonly folderId: string;
    /** Its model file's path, where known (T499). */
    readonly file?: string;
    readonly folderPath: readonly Step[];
  }[];
  readonly hidden: number;
}

const publishedCubes = (count: number) =>
  `${String(count)} published cube${count === 1 ? ' is' : 's are'}`;

/**
 * Design 14's state C: the cubes bound to it, as its Usage lists them, Cube
 * · Model · Folder, the folder a link; the rest counted; and how to free it:
 * a cube keeps the data source it was published with (AC-273, AC-275).
 */
export function sourceRefusal(
  found: SourceDependents,
  { justNow = false }: { readonly justNow?: boolean } = {},
): Refusal | undefined {
  const total = found.cubes.length + found.hidden;
  if (total === 0) return undefined;
  if (found.cubes.length === 0 && !justNow)
    return {
      kind: 'refused',
      lead: `${publishedCubes(total)} bound to it, in ${total === 1 ? 'a folder' : 'folders'} you can’t see. It can be deleted once no published cube is bound to it.`,
    };
  return {
    kind: 'refused',
    lead: justNow
      ? `A cube was published with it just now: ${publishedCubes(total)} bound to it. Nothing was deleted.`
      : `${publishedCubes(total)} bound to it. A cube keeps the data source it was published with, so publish each with another data source, or delete it, first.`,
    ...(found.cubes.length === 0
      ? {}
      : {
          groups: [
            {
              heading: 'Cubes bound to it',
              rows: found.cubes.map((cube) => ({
                key: `${cube.folderId}/${cube.name}`,
                icon: 'cube' as const,
                name: cube.name,
                code: true,
                // Cube · Model · Folder, Model and Folder links (design 14, C2).
                ...(cube.file === undefined
                  ? {}
                  : {
                      file: {
                        text: cube.file.split('/').at(-1) ?? cube.file,
                        href: fileHref(cube.file, cube.folderId),
                      },
                    }),
                where: pathText(cube.folderPath),
                whereHref: exploreHref(cube.folderId),
              })),
            },
          ],
        }),
    ...(found.hidden === 0 ? {} : { hidden: found.hidden }),
  };
}

/** Asks what a data source is bound to, for its dialog (state C). */
export const checkSource = (id: string) => async (): Promise<Checked> => {
  const response = await fetch(`/api/data-sources/${encodeURIComponent(id)}/dependents`);
  if (!response.ok) throw await failure(response, 'What uses it couldn’t be read');
  return (
    sourceRefusal((await response.json()) as SourceDependents) ?? {
      kind: 'confirm',
      text: 'No published cube is bound to it.',
    }
  );
};

/** Deletes a data source: its refusal, where a cube was published with it meanwhile. */
export const removeSource = (id: string) => async (): Promise<Refusal | undefined> => {
  const response = await fetch(`/api/data-sources/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  if (response.status === 409) {
    const said = (await response.json().catch(() => ({}))) as Partial<SourceDependents> & {
      error?: string;
    };
    if (Array.isArray(said.cubes))
      return sourceRefusal({ cubes: said.cubes, hidden: said.hidden ?? 0 }, { justNow: true });
    throw new Error(said.error ?? 'It could not be deleted.');
  }
  if (!response.ok) throw await failure(response, 'It could not be deleted');
  return undefined;
};

/** A model file's dependents (T520, T526; AC-365), as its delete's refusal names them. */
export interface ModelDependents {
  /** The cube or view it declares. */
  readonly declares: readonly { readonly kind: string; readonly name: string }[];
  readonly views: readonly {
    readonly name: string;
    readonly folderId: string;
    readonly file?: string;
  }[];
  readonly cubes: readonly {
    readonly name: string;
    readonly folderId: string;
    readonly file?: string;
  }[];
  readonly charts: readonly {
    readonly id: string;
    readonly title: string | null;
    readonly folderId?: string | null;
  }[];
  readonly dashboards: readonly {
    readonly id: string;
    readonly title: string | null;
    readonly folderId?: string | null;
  }[];
  readonly hidden: number;
}

/**
 * Design 14's state D: what depends on the file's cube, grouped in AC-365's
 * order, views that use it, cubes that join to it, charts and dashboards
 * bound to it, each where it is. `pathOf` names a folder the user sees.
 */
export function modelRefusal(
  found: ModelDependents,
  pathOf: (folderId: string) => string | undefined,
  { justNow = false }: { readonly justNow?: boolean } = {},
): Refusal | undefined {
  const named =
    found.views.length + found.cubes.length + found.charts.length + found.dashboards.length;
  if (named + found.hidden === 0) return undefined;
  // Its one cube or view by name; of several, none, since which is in use isn't said.
  const item = found.declares.length === 1 ? found.declares[0] : undefined;
  const its = item === undefined ? undefined : `Its ${item.kind} ${item.name}`;
  /** A view's or cube's file, opened in its folder, where it is known. */
  const opens = (file: string | undefined, folderId: string) =>
    file === undefined ? {} : { href: fileHref(file, folderId) };
  const at = (folderId: string | null | undefined) =>
    folderId == null ? '' : (pathOf(folderId) ?? '');
  const inFile = (file: string | undefined, folderId: string) =>
    [file?.split('/').at(-1), at(folderId)]
      .filter((part) => part !== undefined && part !== '')
      .join(' · ');
  const groups = [
    {
      heading: 'Views that use it',
      rows: found.views.map((view) => ({
        key: `view:${view.folderId}/${view.name}`,
        icon: 'view' as const,
        name: view.name,
        code: true,
        ...opens(view.file, view.folderId),
        where: inFile(view.file, view.folderId),
      })),
    },
    {
      heading: 'Cubes that join to it',
      rows: found.cubes.map((cube) => ({
        key: `cube:${cube.folderId}/${cube.name}`,
        icon: 'cube' as const,
        name: cube.name,
        code: true,
        ...opens(cube.file, cube.folderId),
        where: inFile(cube.file, cube.folderId),
      })),
    },
    {
      heading: 'Charts bound to it',
      rows: found.charts.map((chart) => ({
        key: chart.id,
        icon: 'chart' as const,
        name: chart.title ?? 'Untitled',
        href: `/explore/charts/${encodeURIComponent(chart.id)}`,
        where: at(chart.folderId),
      })),
    },
    {
      heading: 'Dashboards bound to it',
      rows: found.dashboards.map((dashboard) => ({
        key: dashboard.id,
        icon: 'dashboard' as const,
        name: dashboard.title ?? 'Untitled',
        href: `/explore/dashboards/${encodeURIComponent(dashboard.id)}`,
        where: at(dashboard.folderId),
      })),
    },
  ].filter((group) => group.rows.length > 0);
  const items = (count: number) => `${String(count)} ${count === 1 ? 'item' : 'items'}`;
  const subject = its ?? 'What it declares';
  return {
    kind: 'refused',
    lead: justNow
      ? named === 0
        ? `${subject} started being used just now, by ${items(found.hidden)} in folders you can’t see. Nothing was deleted.`
        : `${subject} started being used just now. Nothing was deleted.`
      : named === 0
        ? `${subject} is used by ${items(found.hidden)} in folders you can’t see. It can be deleted once nothing depends on it.`
        : its === undefined
          ? 'Something still depends on what it declares. Remove what depends on it first.'
          : `${its} is still in use. Remove what depends on it first.`,
    ...(groups.length === 0 ? {} : { groups }),
    ...(found.hidden === 0 ? {} : { hidden: found.hidden }),
  };
}

/** Where a model file is asked of: its folder and its path. */
const modelQuery = (folderId: string, path: string) =>
  `folder=${encodeURIComponent(folderId)}&path=${encodeURIComponent(path)}`;

/** Asks what depends on a model file's cube, for its dialog (state D). */
export const checkModel =
  (folderId: string, path: string, pathOf: (folderId: string) => string | undefined) =>
  async (): Promise<Checked> => {
    const response = await fetch(`/api/model/files/dependents?${modelQuery(folderId, path)}`);
    if (!response.ok) throw await failure(response, 'What uses it couldn’t be read');
    return (
      modelRefusal((await response.json()) as ModelDependents, pathOf) ?? {
        kind: 'confirm',
        text: 'Nothing depends on its cubes.',
      }
    );
  };

/** Deletes a model file: its refusal, where something took it up meanwhile. */
export const removeModel =
  (folderId: string, path: string, pathOf: (folderId: string) => string | undefined) =>
  async (): Promise<Refusal | undefined> => {
    const response = await fetch(`/api/model/files?${modelQuery(folderId, path)}`, {
      method: 'DELETE',
    });
    if (response.status === 409) {
      const said = (await response.json().catch(() => ({}))) as Partial<ModelDependents> & {
        error?: string;
      };
      if (Array.isArray(said.views)) {
        // Asked again for where each is: the refusal names them without
        // their files and folders (T526's review).
        const again = await fetch(`/api/model/files/dependents?${modelQuery(folderId, path)}`);
        const found: ModelDependents = again.ok
          ? ((await again.json()) as ModelDependents)
          : {
              declares: [],
              views: said.views,
              cubes: said.cubes ?? [],
              charts: said.charts ?? [],
              dashboards: said.dashboards ?? [],
              hidden: said.hidden ?? 0,
            };
        const refusal = modelRefusal(found, pathOf, { justNow: true });
        if (refusal !== undefined) return refusal;
      }
      throw new Error(said.error ?? 'It could not be deleted.');
    }
    if (response.status === 422) {
      // xcube's own check of the delete, naming what is bound to it (T428).
      const said = (await response.json().catch(() => ({}))) as {
        errors?: readonly { message?: string }[];
      };
      throw new Error(
        (said.errors ?? []).map((each) => each.message ?? '').join(' ') ||
          'xcube refused the delete.',
      );
    }
    if (!response.ok) throw await failure(response, 'It could not be deleted');
    return undefined;
  };

/** What a folder holds, by kind, as its delete's refusal counts it (T521, AC-366). */
export interface Holdings {
  readonly subfolders: number;
  readonly dashboards: number;
  readonly charts: number;
  readonly models: number;
  readonly dataSources: number;
}

/** "1 subfolder and 2 dashboards": AC-366's order, only the kinds it has. */
function holdingsText(holds: Holdings): string {
  const parts = (
    [
      [holds.subfolders, 'subfolder', 'subfolders'],
      [holds.dashboards, 'dashboard', 'dashboards'],
      [holds.charts, 'chart', 'charts'],
      [holds.models, 'model', 'models'],
      [holds.dataSources, 'data source', 'data sources'],
    ] as const
  )
    .filter(([count]) => count > 0)
    .map(([count, one, many]) => `${String(count)} ${count === 1 ? one : many}`);
  return parts.length < 2
    ? parts.join('')
    : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)!}`;
}

/**
 * Design 14's state E4: a folder that filled after Delete was offered, or
 * one the API was asked of directly. Delete is offered only on an empty one.
 */
export function folderRefusal(holds: Holdings, title: string, open: () => void): Refusal {
  return {
    kind: 'refused',
    lead: `It isn’t empty any more. It holds ${holdingsText(holds)}. Only an empty folder can be deleted.`,
    also: { label: `Open ${title}`, onSelect: open },
  };
}

/** An empty folder's confirmation (state E3): nothing is asked first. */
export const FOLDER_CONFIRMATION = {
  kind: 'confirm',
  text: 'It’s empty, so nothing else goes with it.',
} as const;

/** Deletes a folder: its refusal, where it holds something now (state E4). */
export const removeFolder =
  (id: string, title: string, open: () => void) => async (): Promise<Refusal | undefined> => {
    const response = await fetch(`/api/documents/folder/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    if (response.status === 409) {
      const said = (await response.json().catch(() => ({}))) as {
        holds?: Holdings;
        error?: string;
      };
      if (said.holds !== undefined) return folderRefusal(said.holds, title, open);
      throw new Error(said.error ?? 'It could not be deleted.');
    }
    if (!response.ok) throw await failure(response, 'It could not be deleted');
    return undefined;
  };

/** Deletes a library chart: its refusal, where a dashboard took it up meanwhile (state A4). */
export const removeChart =
  (id: string, signedIn: boolean) => async (): Promise<Refusal | undefined> => {
    const response = await fetch(`/api/documents/chart/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    if (response.status === 409) {
      const said = (await response.json().catch(() => ({}))) as Partial<ChartDependents> & {
        error?: string;
      };
      if (Array.isArray(said.dashboards))
        return chartRefusal(
          { dashboards: said.dashboards, hidden: said.hidden ?? 0 },
          { signedIn, justNow: true },
        );
      throw new Error(said.error ?? 'It could not be deleted.');
    }
    if (!response.ok) throw await failure(response, 'It could not be deleted');
    return undefined;
  };
