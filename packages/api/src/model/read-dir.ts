import { readdir, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

import type { ModelFile } from '../server';

/**
 * The kinds of file Cube's own `FileRepository` reads as model files
 * (research/cube/data-modeling.md).
 */
const MODEL_FILE = /\.(js|ya?ml|jinja|py)$/;

/**
 * The model files under a directory, named as Cube's `FileRepository` names
 * them — relative to the directory, with `/` — in path order. Nothing for a
 * directory that is not there: a missing seed must not stop the service.
 */
export async function readModelDir(dir: string): Promise<ModelFile[]> {
  let entries: string[];
  try {
    entries = await readdir(dir, { recursive: true });
  } catch {
    return [];
  }
  const names = entries
    .filter(
      (entry) => MODEL_FILE.test(entry) && !entry.split(sep).some((part) => part.startsWith('.')),
    )
    .map((entry) => relative(dir, join(dir, entry)).split(sep).join('/'))
    .sort();
  return Promise.all(
    names.map(async (path) => ({ path, content: await readFile(join(dir, path), 'utf8') })),
  );
}
