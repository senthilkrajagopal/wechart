import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';

import { declaredIn, splitFile, splitFiles, splitStored, startModel } from './split';

/**
 * T448 / AC-337: THE SYSTEM SHALL keep one cube or one view per model file:
 * the move to items mode splits a file declaring several into one file each,
 * named for what it declares, and a publish of a file declaring more than one
 * is refused, naming them.
 * `Fails when: after the move a stored model file declares two or more cubes
 * or views, or a split file's cube serves different members than before; …`
 *
 * One file is one xcube item, which holds exactly one cube or view
 * (`xcube-slice-3a.md`, "Items"; R30).
 */
const MANY = [
  '# The sales model, in one file.',
  'cubes:',
  '  - name: orders',
  '    sql_table: public.orders',
  '    # Counted once per order line.',
  '    measures:',
  '      - name: count',
  '        type: count',
  '    dimensions:',
  '      - name: status',
  '        sql: status',
  '        type: string',
  '  - name: customers',
  '    sql_table: public.customers',
  '    measures:',
  '      - name: count',
  '        type: count',
  'views:',
  '  - name: sales',
  '    cubes:',
  '      - join_path: orders',
  '        includes: "*"',
  '',
].join('\n');

const ALL = { path: 'cubes/sales.yml', content: MANY };

describe('what a model file declares', () => {
  it('names each cube and view, in order', () => {
    expect(declaredIn(MANY)).toEqual([
      { kind: 'cube', name: 'orders' },
      { kind: 'cube', name: 'customers' },
      { kind: 'view', name: 'sales' },
    ]);
  });

  it('is nothing for a file that doesn’t parse, or holds no list', () => {
    expect(declaredIn('cubes: [\n')).toEqual([]);
    expect(declaredIn('# nothing yet\n')).toEqual([]);
  });
});

describe('splitting a file that declares several (T448, AC-337)', () => {
  it('makes one file each, named for what it declares, in the same folder', () => {
    const split = splitFile(ALL, new Set([ALL.path]));

    expect(split.map((file) => file.path)).toEqual([
      'cubes/orders.yml',
      'cubes/customers.yml',
      'cubes/sales.yml',
    ]);
    for (const file of split) expect(declaredIn(file.content)).toHaveLength(1);
  });

  it('keeps each one’s definition, members and comments included', () => {
    const before = parse(MANY) as { cubes: unknown[]; views: unknown[] };
    const [orders, customers, sales] = splitFile(ALL, new Set([ALL.path]));

    expect(parse(orders?.content ?? '')).toEqual({ cubes: [before.cubes[0]] });
    expect(parse(customers?.content ?? '')).toEqual({ cubes: [before.cubes[1]] });
    expect(parse(sales?.content ?? '')).toEqual({ views: [before.views[0]] });
    expect(orders?.content).toContain('# Counted once per order line.');
    // The file's opening comment stays at the top of the first.
    expect(orders?.content.startsWith('# The sales model, in one file.\n')).toBe(true);
    expect(customers?.content).not.toContain('# The sales model');
  });

  it('leaves a file declaring one, or none, as it is', () => {
    const one = { path: 'cubes/orders.yml', content: 'cubes:\n  - name: orders\n' };
    const none = { path: 'cubes/empty.yml', content: 'cubes: []\n' };

    expect(splitFile(one, new Set([one.path]))).toEqual([one]);
    expect(splitFile(none, new Set([none.path]))).toEqual([none]);
  });

  it('leaves a Jinja template, or a file that doesn’t parse, as it is', () => {
    const template = {
      path: 'cubes/t.yml',
      content: 'cubes:\n  - name: a\n  - name: b\n    sql: "{{ x }}"\n',
    };
    const broken = { path: 'cubes/b.yml', content: 'cubes:\n  - name: a\n  - name: [\n' };

    expect(splitFile(template, new Set())).toEqual([template]);
    expect(splitFile(broken, new Set())).toEqual([broken]);
  });

  it('splits a file whose cubes share an anchor, each piece whole on its own', () => {
    const shared = {
      path: 'cubes/shared.yml',
      content: [
        'cubes:',
        '  - name: first',
        '    sql_table: public.a',
        '    measures: &counted',
        '      - name: count',
        '        type: count',
        '  - name: second',
        '    sql_table: public.b',
        '    measures: *counted',
        '',
      ].join('\n'),
    };
    const before = parse(shared.content) as { cubes: unknown[] };

    const pieces = splitFile(shared, new Set([shared.path]));

    expect(pieces.map((piece) => parse(piece.content))).toEqual([
      { cubes: [before.cubes[0]] },
      { cubes: [before.cubes[1]] },
    ]);
  });

  it('leaves a file that isn’t YAML as it is, whatever it holds', () => {
    const script = { path: 'cubes/a.js', content: 'cubes:\n  - name: a\n  - name: b\n' };

    expect(splitFile(script, new Set())).toEqual([script]);
  });

  it('never takes another file’s path', () => {
    const taken = new Set([ALL.path, 'cubes/orders.yml']);

    expect(splitFile(ALL, taken).map((file) => file.path)).toEqual([
      'cubes/orders-2.yml',
      'cubes/customers.yml',
      'cubes/sales.yml',
    ]);
  });
});

describe('splitting the stored model at start (T448)', () => {
  it('replaces each stored file that declares several with its pieces, and says so', async () => {
    const one = { path: 'cubes/products.yml', content: 'cubes:\n  - name: products\n' };
    let files = [ALL, one];
    const replaced: string[] = [];
    const store = {
      list: async () => files,
      replace: async (path: string, pieces: readonly { path: string; content: string }[]) => {
        replaced.push(path);
        files = [...files.filter((file) => file.path !== path), ...pieces];
      },
    };
    const said: string[] = [];

    await splitStored(store, (message) => said.push(message));

    expect(replaced).toEqual([ALL.path]);
    expect(files.map((file) => file.path).sort()).toEqual([
      'cubes/customers.yml',
      'cubes/orders.yml',
      'cubes/products.yml',
      'cubes/sales.yml',
    ]);
    for (const file of files) expect(declaredIn(file.content)).toHaveLength(1);
    expect(said).toEqual([
      'Split cubes/sales.yml into cubes/orders.yml, cubes/customers.yml, cubes/sales.yml: a model file holds one cube or view.',
    ]);

    // Once split, a restart splits nothing.
    await splitStored(store, (message) => said.push(message));
    expect(replaced).toEqual([ALL.path]);
  });
});

describe('the model at start: the store split, then the directory seeded (T448)', () => {
  /** A store as Postgres keeps it: a seed never writes over a path it has. */
  const storeOf = (initial: readonly { path: string; content: string }[]) => {
    let files = [...initial];
    return {
      get files() {
        return files;
      },
      list: async () => files,
      seed: async (seeds: readonly { path: string; content: string }[]) => {
        for (const seed of seeds)
          if (!files.some((file) => file.path === seed.path)) files = [...files, seed];
      },
      replace: async (path: string, pieces: readonly { path: string; content: string }[]) => {
        files = [...files.filter((file) => file.path !== path), ...pieces];
      },
    };
  };

  it('splits a file the store already holds whole into the names the directory’s would take, once each', async () => {
    // Stored before T448, and edited since: the store's copy is the one kept.
    const edited = {
      ...ALL,
      content: MANY.replace('type: string', 'type: string\n        title: Stage'),
    };
    const store = storeOf([edited]);

    await startModel(store, [ALL], () => undefined);

    expect(store.files.map((file) => file.path).sort()).toEqual([
      'cubes/customers.yml',
      'cubes/orders.yml',
      'cubes/sales.yml',
    ]);
    // Each cube declared once, from the store's edited copy.
    const names = store.files.flatMap((file) => declaredIn(file.content).map((each) => each.name));
    expect(names.sort()).toEqual(['customers', 'orders', 'sales']);
    expect(store.files.find((file) => file.path === 'cubes/orders.yml')?.content).toContain(
      'Stage',
    );
  });

  it('seeds a fresh store with the directory’s files, split', async () => {
    const store = storeOf([]);

    await startModel(store, [ALL], () => undefined);

    expect(store.files.map((file) => file.path).sort()).toEqual([
      'cubes/customers.yml',
      'cubes/orders.yml',
      'cubes/sales.yml',
    ]);
  });
});

describe('splitting a whole set', () => {
  it('splits each file that declares several, and keeps the rest', () => {
    const one = { path: 'cubes/products.yml', content: 'cubes:\n  - name: products\n' };
    const { files, split } = splitFiles([ALL, one]);

    expect(files.map((file) => file.path).sort()).toEqual([
      'cubes/customers.yml',
      'cubes/orders.yml',
      'cubes/products.yml',
      'cubes/sales.yml',
    ]);
    expect(split).toEqual([
      { path: ALL.path, into: ['cubes/orders.yml', 'cubes/customers.yml', 'cubes/sales.yml'] },
    ]);
  });
});
