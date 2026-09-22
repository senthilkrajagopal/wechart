import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

import type { ModelFile } from '../server';

/**
 * The kinds of file Cube's own `FileRepository` reads as model files
 * (research/cube/data-modeling.md). It skips nothing else — no dot-file, no
 * directory by name — so neither does this.
 */
const MODEL_FILE = /\.(js|ya?ml|jinja|py)$/;

const codeOf = (error: unknown) => (error as { code?: unknown } | null)?.code;

/**
 * The model files under a directory, named as Cube's `FileRepository` names
 * them — relative to the directory, with `/` — in path order. Nothing for a
 * directory that is not there: a missing seed must not stop the service. Any
 * other failure to read it is an error, not an empty model.
 */
export async function readModelDir(dir: string): Promise<ModelFile[]> {
  let entries: string[];
  try {
    entries = await readdir(dir, { recursive: true });
  } catch (error) {
    if (codeOf(error) === 'ENOENT') return [];
    throw error;
  }
  const named = entries
    .filter((entry) => MODEL_FILE.test(entry))
    .map((entry) => relative(dir, join(dir, entry)).split(sep).join('/'));
  // Files only, as Cube's `stat` does: a directory called `old.yml` is walked, not read.
  const files = (
    await Promise.all(
      named.map(async (path) => ((await stat(join(dir, path))).isFile() ? path : undefined)),
    )
  ).filter((path): path is string => path !== undefined);
  return Promise.all(
    files.sort().map(async (path) => ({ path, content: await readFile(join(dir, path), 'utf8') })),
  );
}
