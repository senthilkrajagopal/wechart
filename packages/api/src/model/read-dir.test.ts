import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { readModelDir } from './read-dir';

/**
 * T137: the model files Cube reads from disk, read in to seed wechart's store.
 * Each is named as Cube's own `FileRepository` names it — relative to the
 * model directory, `cubes/orders.yml` — and only the kinds it reads: `.js`,
 * `.yml`, `.yaml`, `.jinja` and `.py` (research/cube/data-modeling.md).
 */
let dir = '';

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'wechart-model-'));
  await mkdir(join(dir, 'cubes'));
  await mkdir(join(dir, 'views'));
  await writeFile(join(dir, 'cubes', 'orders.yml'), 'cubes:\n  - name: orders\n');
  await writeFile(join(dir, 'views', 'summary.yaml'), 'views:\n  - name: summary\n');
  await writeFile(join(dir, 'cubes', 'dynamic.py'), 'from cube import TemplateContext\n');
  await writeFile(join(dir, 'README.md'), 'not a model file\n');
  await writeFile(join(dir, 'cubes', '.orders.yml.swp'), 'an editor’s scratch\n');
  // Cube's FileRepository skips no dot-file, only other extensions
  // (research/cube/data-modeling.md, "File layout"): so neither does wechart.
  await writeFile(join(dir, 'cubes', '.draft.yml'), 'cubes:\n  - name: draft\n');
  // A directory is not a file, whatever it is called.
  await mkdir(join(dir, 'views', 'old.yml'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('reading the model directory', () => {
  it('reads every model file, named as Cube names it, in path order', async () => {
    const files = await readModelDir(dir);

    expect(files).toEqual([
      { path: 'cubes/.draft.yml', content: 'cubes:\n  - name: draft\n' },
      { path: 'cubes/dynamic.py', content: 'from cube import TemplateContext\n' },
      { path: 'cubes/orders.yml', content: 'cubes:\n  - name: orders\n' },
      { path: 'views/summary.yaml', content: 'views:\n  - name: summary\n' },
    ]);
  });

  it('reads nothing, rather than failing the service, from a directory that is not there', async () => {
    expect(await readModelDir(join(dir, 'missing'))).toEqual([]);
  });

  it('fails, rather than reading nothing, where the directory is there but can’t be read', async () => {
    // A file where the directory should be: not "missing", so not quietly empty.
    await expect(readModelDir(join(dir, 'README.md'))).rejects.toThrow(/ENOTDIR/);
  });
});
