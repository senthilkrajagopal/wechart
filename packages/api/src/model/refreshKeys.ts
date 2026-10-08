import { refreshEveryRefusal } from '@wechart/core';
import {
  isAlias,
  isMap,
  isScalar,
  isSeq,
  LineCounter,
  parseDocument,
  type Document,
  type Node,
} from 'yaml';

import { ROOT_FOLDER_ID } from '../repos/catalog';
import type { ModelFile } from '../server';
import type { CompileError } from './validate';

/**
 * Refresh keys whose `every` Cube's refresh worker can't run (T258, AC-153).
 *
 * Cube's compile check only parses a cron, so one it can't run is published,
 * and then every query the rollup serves fails, and so does the worker's
 * refresh of it; on a cube's own key, every query on the cube
 * (research/cube/refresh-key-schedule.md, "Findings that change the plan";
 * "Gotchas" 1 and 7). Read from the files, as Cube reads them; a file Cube
 * renders first (Jinja) or can't parse is not read here, and says nothing.
 */

/** Cube renders a YAML file matching this with Jinja first (as publish.ts refuses them). */
const JINJA = /{%|%}|{{|}}/;
const YAML_FILE = /\.ya?ml$/;

/** A key as the file writes it, snake_case or camelCase (Cube camelizes). */
const KEYS = {
  preAggregations: ['pre_aggregations', 'preAggregations'],
  refreshKey: ['refresh_key', 'refreshKey'],
};

function get(node: unknown, keys: readonly string[]): Node | undefined {
  if (!isMap(node)) return undefined;
  for (const key of keys) {
    const found = node.get(key, true) as Node | undefined;
    if (found !== undefined && found !== null) return found;
  }
  return undefined;
}

const nameOf = (node: unknown): string | undefined => {
  const name = get(node, ['name']);
  return isScalar(name) && typeof name.value === 'string' ? name.value : undefined;
};

/** A merge key, `<<`: the yaml library reads it as a symbol when merges are on. */
const isMergeKey = (key: unknown) =>
  isScalar(key) &&
  (key.value === '<<' || (typeof key.value === 'symbol' && key.value.description === '<<'));

/**
 * A key's `every` as Cube reads it, through YAML aliases and merges, as
 * Problems reads the parsed value (T377; T258's review): the value, and the
 * node where it is written in this key, the alias or the merge where one is
 * used, for its line. An own `every` wins over a merged one.
 */
function everyOf(
  document: Document,
  key: Node | undefined,
  seen: Set<unknown> = new Set(),
): { value: unknown; at: Node } | undefined {
  // The whole key an alias: said where the alias is used.
  if (isAlias(key)) {
    const found = everyOf(document, key.resolve(document), seen);
    return found === undefined ? undefined : { value: found.value, at: key };
  }
  const map = key;
  if (!isMap(map) || seen.has(map)) return undefined;
  seen.add(map);
  for (const pair of map.items)
    if (isScalar(pair.key) && pair.key.value === 'every') {
      const value = isAlias(pair.value) ? pair.value.resolve(document) : pair.value;
      return isScalar(value) ? { value: value.value, at: pair.value as Node } : undefined;
    }
  for (const pair of map.items) {
    if (!isMergeKey(pair.key)) continue;
    const sources = isSeq(pair.value) ? pair.value.items : [pair.value];
    for (const source of sources) {
      const found = everyOf(document, source as Node, seen);
      if (found !== undefined) return { value: found.value, at: pair.key as Node };
    }
  }
  return undefined;
}

/**
 * A map's key as Cube reads the parsed file, through aliases and merges (T377's
 * review): the map itself an alias, its own key, else a merged map's.
 */
function resolvedGet(
  document: Document,
  node: unknown,
  keys: readonly string[],
  seen: Set<unknown> = new Set(),
): Node | undefined {
  const map = isAlias(node) ? node.resolve(document) : node;
  if (!isMap(map) || seen.has(map)) return undefined;
  seen.add(map);
  const own = get(map, keys);
  if (own !== undefined) return own;
  for (const pair of map.items) {
    if (!isMergeKey(pair.key)) continue;
    const sources = isSeq(pair.value) ? pair.value.items : [pair.value];
    for (const source of sources) {
      const found = resolvedGet(document, source, keys, seen);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

/** Each `every` a refresh key writes that Cube can't run, with who owns it and its line. */
export function refreshKeyProblemsOf(files: readonly ModelFile[]): CompileError[] {
  const problems: CompileError[] = [];
  for (const file of files) {
    if (!YAML_FILE.test(file.path) || JINJA.test(file.content)) continue;
    const lines = new LineCounter();
    const document = parseDocument(file.content, { lineCounter: lines, merge: true });
    if (document.errors.length > 0) continue;
    const get = (node: unknown, keys: readonly string[]) => resolvedGet(document, node, keys);
    const nameOf = (node: unknown): string | undefined => {
      const name = get(node, ['name']);
      const value = isAlias(name) ? name.resolve(document) : name;
      return isScalar(value) && typeof value.value === 'string' ? value.value : undefined;
    };
    const check = (owner: string, key: Node | undefined) => {
      const every = everyOf(document, key);
      if (every === undefined || typeof every.value !== 'string') return;
      const refusal = refreshEveryRefusal(every.value);
      if (refusal === undefined) return;
      const line =
        every.at.range === undefined || every.at.range === null
          ? undefined
          : lines.linePos(every.at.range[0]).line;
      problems.push({
        path: file.path,
        ...(line === undefined ? {} : { line }),
        message: `${owner}: ${refusal}`,
      });
    };
    const cubes = get(document.contents, ['cubes']);
    if (!isSeq(cubes)) continue;
    for (const cube of cubes.items) {
      const name = nameOf(cube) ?? 'without a name';
      check(`Cube ${name}`, get(cube, KEYS.refreshKey));
      const rollups = get(cube, KEYS.preAggregations);
      if (!isSeq(rollups)) continue;
      for (const rollup of rollups.items)
        check(
          `Pre-aggregation ${nameOf(rollup) ?? 'without a name'}`,
          get(rollup, KEYS.refreshKey),
        );
    }
  }
  return problems;
}

/**
 * Each pre-aggregation's refresh-key SQL, by `cube.name`: its own key's, or its
 * cube's where it declares none (T273's review). `/v1/meta?extended` drops a
 * key's `sql`, so `{sql, every}` reads there as `{every}`; the research says to
 * read it from the YAML wechart owns (research/cube/refresh-key-schedule.md,
 * "What /v1/meta?extended shows"). Only a plain string: SQL built by code is
 * not read.
 *
 * A folder's cube is Cube's under its own name, as every folder's is (T709,
 * AC-328); a folder with no xcube id in `folders` isn't published, and is
 * left out.
 */
export function refreshKeySqlOf(
  files: readonly ModelFile[],
  folders: ReadonlyMap<string, string> = new Map(),
): Map<string, string> {
  const found = new Map<string, string>();
  const sqlOf = (key: Node | undefined) => {
    const sql = get(key, ['sql']);
    return isScalar(sql) && typeof sql.value === 'string' ? sql.value : undefined;
  };
  for (const file of files) {
    if (!YAML_FILE.test(file.path) || JINJA.test(file.content)) continue;
    const folderId = file.folderId ?? ROOT_FOLDER_ID;
    if (folderId !== ROOT_FOLDER_ID && !folders.has(folderId)) continue;
    const document = parseDocument(file.content, { merge: true });
    if (document.errors.length > 0) continue;
    const cubes = get(document.contents, ['cubes']);
    if (!isSeq(cubes)) continue;
    for (const cube of cubes.items) {
      const cubeName = nameOf(cube);
      const rollups = get(cube, KEYS.preAggregations);
      if (cubeName === undefined || !isSeq(rollups)) continue;
      const cubeKey = get(cube, KEYS.refreshKey);
      for (const rollup of rollups.items) {
        const name = nameOf(rollup);
        const own = get(rollup, KEYS.refreshKey);
        const sql = own === undefined ? sqlOf(cubeKey) : sqlOf(own);
        if (name !== undefined && sql !== undefined) found.set(`${cubeName}.${name}`, sql);
      }
    }
  }
  return found;
}
