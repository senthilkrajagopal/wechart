import { nameKey } from '@wechart/core';
import { parse } from 'yaml';

import { declaredIn } from './split';

/**
 * One name per item (T704; AC-421; R71 1, 6): cubes and views share one
 * namespace and data sources have another, each name once across every
 * landed item, compared in any case. The views Cube makes of a view's
 * `split: true` cubes, `<view>_<alias or cube>`, take names too (R72; research
 * `xcube-256d632371.md`, "Two namespaces, compared in any case"; xcube's
 * `splitViewNames`).
 */

/** The names a model file declares: its cube's or view's, and each split view's. */
export function namesDeclaredIn(content: string): string[] {
  const names = declaredIn(content).map(({ name }) => name);
  let doc: unknown;
  try {
    doc = parse(content);
  } catch {
    return names;
  }
  const views = (doc as { views?: unknown } | null)?.views;
  for (const view of Array.isArray(views) ? (views as unknown[]) : []) {
    const { name, cubes } = (view ?? {}) as { name?: unknown; cubes?: unknown };
    if (typeof name !== 'string' || !Array.isArray(cubes)) continue;
    for (const entry of cubes as unknown[]) {
      const each = (entry ?? {}) as Record<string, unknown>;
      if (each['split'] !== true) continue;
      const path = each['join_path'] ?? each['joinPath'];
      const alias =
        typeof each['alias'] === 'string'
          ? each['alias']
          : typeof path === 'string'
            ? (path.split('.').pop() ?? '').trim()
            : '';
      names.push(`${name}_${alias}`);
    }
  }
  return names;
}

/** What a change replaces, which keeps its names: files by id or by `<folderId>/<path>`, data sources by id. */
export interface Except {
  readonly files: ReadonlySet<string>;
  readonly paths?: ReadonlySet<string>;
  readonly dataSources: ReadonlySet<string>;
}

/** The names of each namespace. */
export interface Names {
  /** Cubes and views, split views' included. */
  readonly items: readonly string[];
  readonly dataSources: readonly string[];
}

/**
 * Each namespace's landed names: those the shared folders' model files and
 * data sources hold, all but the items a change replaces, whose names it
 * keeps (an edit copy lands over its original, AC-422).
 */
export function landedNamesOf({
  files,
  dataSources,
  except = { files: new Set(), dataSources: new Set() },
}: {
  readonly files: readonly {
    readonly id: string;
    readonly folderId?: string;
    readonly path?: string;
    readonly content: string;
  }[];
  readonly dataSources: readonly { readonly id: string; readonly name: string }[];
  readonly except?: Except;
}): Names {
  return {
    items: files
      .filter(
        (file) =>
          !except.files.has(file.id) &&
          !(except.paths?.has(`${file.folderId ?? ''}/${file.path ?? ''}`) ?? false),
      )
      .flatMap((file) => namesDeclaredIn(file.content)),
    dataSources: dataSources
      .filter((source) => !except.dataSources.has(source.id))
      .map((source) => source.name),
  };
}

/** Each name asked that `landed` holds in its namespace, in any case: once, in the order asked. */
export function heldIn(landed: Names, asked: Names): string[] {
  const held: string[] = [];
  const seen = new Set<string>();
  for (const [space, namespace, names] of [
    ['item', new Set(landed.items.map(nameKey)), asked.items],
    ['data-source', new Set(landed.dataSources.map(nameKey)), asked.dataSources],
  ] as const)
    for (const name of names) {
      const key = `${space}/${nameKey(name)}`;
      if (namespace.has(nameKey(name)) && !seen.has(key)) {
        seen.add(key);
        held.push(name);
      }
    }
  return held;
}
