import { refreshEveryRefusal } from '@wechart/core';
import { isMap, isScalar, isSeq, LineCounter, parseDocument, type Node } from 'yaml';

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

/** Each `every` a refresh key writes that Cube can't run, with who owns it and its line. */
export function refreshKeyProblemsOf(files: readonly ModelFile[]): CompileError[] {
  const problems: CompileError[] = [];
  for (const file of files) {
    if (!YAML_FILE.test(file.path) || JINJA.test(file.content)) continue;
    const lines = new LineCounter();
    const document = parseDocument(file.content, { lineCounter: lines, merge: true });
    if (document.errors.length > 0) continue;
    const check = (owner: string, key: Node | undefined) => {
      const every = get(key, ['every']);
      if (!isScalar(every) || typeof every.value !== 'string') return;
      const refusal = refreshEveryRefusal(every.value);
      if (refusal === undefined) return;
      const line =
        every.range === undefined || every.range === null
          ? undefined
          : lines.linePos(every.range[0]).line;
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
 */
export function refreshKeySqlOf(files: readonly ModelFile[]): Map<string, string> {
  const found = new Map<string, string>();
  const sqlOf = (key: Node | undefined) => {
    const sql = get(key, ['sql']);
    return isScalar(sql) && typeof sql.value === 'string' ? sql.value : undefined;
  };
  for (const file of files) {
    if (!YAML_FILE.test(file.path) || JINJA.test(file.content)) continue;
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
