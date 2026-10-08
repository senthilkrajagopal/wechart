import { afterEach, describe, expect, it, vi } from 'vitest';

import { publishModel, refusedText } from './publish';

/**
 * T427 (AC-322): a refused publish names the breaks in the folders its user
 * may see, and only counts the rest ("n items in folders you can't see would
 * break"): the count and its words reach the page with the named problems.
 */
afterEach(() => {
  vi.unstubAllGlobals();
});

const answering = (status: number, body: unknown) =>
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(body), { status })),
  );

describe('a refused publish (T427, AC-322)', () => {
  it('carries the breaks it names, and the count and words of those it can’t', async () => {
    answering(422, {
      errors: [{ path: 'cubes/orders.yml', message: 'bad', line: 3, column: 5 }],
      hidden: 2,
      error: '2 items in folders you can’t see would break.',
    });
    expect(await publishModel([{ path: 'cubes/orders.yml', content: 'x' }])).toEqual({
      kind: 'refused',
      problems: [{ path: 'cubes/orders.yml', message: 'bad', line: 3, column: 5 }],
      hidden: { count: 2, said: '2 items in folders you can’t see would break.' },
    });
  });

  it('says why it was refused, and the breaks it can’t name as counted', () => {
    const rollup = {
      path: 'a.yml',
      message: 'm',
      preAggregation: { cube: 'a', name: 'r', unknown: [{ list: 'measures', name: 'x' }] },
    };
    expect(refusedText([{ path: 'a.yml', message: 'bad' }])).toBe(
      'Cube refused the model, so nothing was published.',
    );
    expect(refusedText([rollup])).toBe(
      'A pre-aggregation names members the model doesn’t have, so nothing was published.',
    );
    expect(
      refusedText([{ path: 'a.yml', message: 'bad' }], {
        count: 1,
        said: '1 item in folders you can’t see would break.',
      }),
    ).toBe(
      'Cube refused the model, so nothing was published. 1 item in folders you can’t see would break.',
    );
    // Every break hidden: what is said is the count alone.
    expect(
      refusedText([], { count: 2, said: '2 items in folders you can’t see would break.' }),
    ).toBe('Nothing was published: 2 items in folders you can’t see would break.');
  });

  // T723 (AC-424, AC-422): the API's name-in-use refusal is said as that,
  // and as nothing of where: never as Cube's.
  it('says a save refused for a name in use as that, naming only the names', () => {
    const inUse = (name: string) => ({
      path: `cubes/${name}.yml`,
      message: `The name “${name}” is already in use.`,
    });
    expect(refusedText([inUse('orders')])).toBe(
      'The name “orders” is already in use, so nothing was saved.',
    );
    expect(refusedText([inUse('orders'), inUse('Lines'), inUse('items')])).toBe(
      'The names “orders”, “Lines” and “items” are already in use, so nothing was saved.',
    );
    // With breaks in folders the user can't see, still counted (AC-322; T723's review).
    expect(
      refusedText([inUse('orders')], {
        count: 1,
        said: '1 item in folders you can’t see would break.',
      }),
    ).toBe(
      'The name “orders” is already in use, so nothing was saved. 1 item in folders you can’t see would break.',
    );
    // With another problem among them, Cube's refusal is said as before.
    expect(refusedText([inUse('orders'), { path: 'a.yml', message: 'bad' }])).toBe(
      'Cube refused the model, so nothing was published.',
    );
  });

  // T737 (AC-423): a draft's file follows its cube's name; where it went is said.
  it('carries where a draft’s file was moved to, and nothing where none was', async () => {
    answering(200, {
      version: '7',
      moved: [{ from: 'cubes/new_cube_1.yml', to: 'cubes/orders_x.yml' }],
    });
    expect(await publishModel([{ path: 'cubes/new_cube_1.yml', content: 'x' }])).toEqual({
      kind: 'published',
      version: '7',
      moved: [{ from: 'cubes/new_cube_1.yml', to: 'cubes/orders_x.yml' }],
    });
    answering(200, { version: '8' });
    expect(await publishModel([{ path: 'cubes/orders_x.yml', content: 'x' }])).toEqual({
      kind: 'published',
      version: '8',
    });
  });

  it('carries no count when every break is named', async () => {
    answering(422, { errors: [{ path: 'a.yml', message: 'bad' }], hidden: 0 });
    expect(await publishModel([{ path: 'a.yml', content: 'x' }])).toEqual({
      kind: 'refused',
      problems: [{ path: 'a.yml', message: 'bad' }],
    });
  });
});
