import { nameProblem } from '@wechart/core';
import { describe, expect, it } from 'vitest';

import { suggestedName, withSuggestedNames } from './suggestNames';

/**
 * T734 (AC-249; R73): a generated cube's name is suggested in the grammar.
 * `__` becomes `_`, and a reserved word or a leading digit gets a `t_` prefix.
 * The scaffold's own names depend on the batch, and a renamed cube needs the
 * joins that target it rewritten (research `cube/introspection-api.md`,
 * "Cube names and the rest of the model", "Generation rules").
 */
const fileOf = (name: string, joins: readonly string[] = []) =>
  [
    'cubes:',
    `  - name: ${name}`,
    `    sql_table: public.${name}`,
    '',
    ...(joins.length === 0
      ? []
      : [
          '    joins:',
          ...joins.flatMap((target) => [
            `      - name: ${target}`,
            `        sql: "{CUBE}.${target}_id = {${target}.id}"`,
            '        relationship: many_to_one',
          ]),
          '',
        ]),
    '    dimensions:',
    '      - name: id',
    '        sql: id',
    '        type: number',
    '        primary_key: true',
    '',
    '    measures:',
    '      - name: count',
    '        type: count',
    '',
    '    pre_aggregations:',
    '      # Pre-aggregation definitions go here.',
    '      # Learn more in the documentation: https://cube.dev/docs/caching/pre-aggregations/getting-started',
    '',
  ].join('\n');
const scaffolded = (name: string, joins: readonly string[] = []) => ({
  cube: name,
  fileName: `${name}.yml`,
  content: fileOf(name, joins),
  unmappedColumns: [],
});

describe('a generated cube’s suggested name (T734, AC-249)', () => {
  it('is R73’s: `__` becomes `_`, and a reserved word or a leading digit gets `t_`', () => {
    expect(['user__events', 'class', '2024_orders', 'a___b', 'orders'].map(suggestedName)).toEqual([
      'user_events',
      't_class',
      't_2024_orders',
      'a_b',
      'orders',
    ]);
    // Each in the grammar.
    for (const name of ['user_events', 't_class', 't_2024_orders'])
      expect(nameProblem(name, 'cube'), name).toBeUndefined();
  });

  it('renames each cube, its file, and every join in the batch that targets it, leaving the rest as Cube wrote it', () => {
    const cubes = [
      scaffolded('user__events', ['class']),
      scaffolded('class'),
      scaffolded('orders', ['class', 'user__events']),
    ];

    expect(withSuggestedNames(cubes)).toEqual([
      {
        cube: 'user_events',
        fileName: 'user_events.yml',
        content: fileOf('user__events', ['class'])
          .replace('  - name: user__events', '  - name: user_events')
          .replace('      - name: class', '      - name: t_class')
          .replace('{class.id}', '{t_class.id}'),
        unmappedColumns: [],
      },
      {
        cube: 't_class',
        fileName: 't_class.yml',
        content: fileOf('class').replace('  - name: class', '  - name: t_class'),
        unmappedColumns: [],
      },
      {
        cube: 'orders',
        fileName: 'orders.yml',
        content: fileOf('orders', ['class', 'user__events'])
          .replace('      - name: class', '      - name: t_class')
          .replace('{class.id}', '{t_class.id}')
          .replace('      - name: user__events', '      - name: user_events')
          .replace('{user__events.id}', '{user_events.id}'),
        unmappedColumns: [],
      },
    ]);
  });

  // T734's review: a suggestion never takes another cube's name in the batch.
  // Numbered as Cube's scaffold numbers a name the batch has (research,
  // "Generation rules": `_2`, `_3`…), in any case.
  it('numbers a suggestion another cube of the batch holds, and its joins with it', () => {
    const cubes = [scaffolded('class'), scaffolded('t_class'), scaffolded('T_class_2')];
    expect(withSuggestedNames(cubes).map(({ cube, fileName }) => [cube, fileName])).toEqual([
      ['t_class_3', 't_class_3.yml'],
      ['t_class', 't_class.yml'],
      ['T_class_2', 'T_class_2.yml'],
    ]);
    const joined = withSuggestedNames([
      scaffolded('t_class'),
      scaffolded('class'),
      scaffolded('orders', ['class', 't_class']),
    ]);
    expect(joined[2]?.content).toBe(
      fileOf('orders', ['class', 't_class'])
        .replace('      - name: class', '      - name: t_class_2')
        .replace('{class.id}', '{t_class_2.id}'),
    );
  });

  // T734's review: a file the YAML library can't read is left as Cube wrote it.
  it('leaves a file it cannot read as it was, under the suggested name', () => {
    const broken = {
      cube: 'class',
      fileName: 'class.yml',
      content: 'cubes:\n  - name: class\n    sql: `x`\n',
      unmappedColumns: [],
    };
    expect(withSuggestedNames([broken])).toEqual([
      { ...broken, cube: 't_class', fileName: 't_class.yml' },
    ]);
  });

  // T734's review: Cube's own lines are kept, long ones and flow maps too.
  it('keeps a long join and a flow map as Cube wrote them', () => {
    const long = 'customer_billing_addresses';
    const content = [
      'cubes:',
      '  - name: class',
      '    joins:',
      `      - name: ${long}`,
      `        sql: "{CUBE}.customer_billing_address_id = {${long}.id}"`,
      '    dimensions:',
      '      - {name: id, sql: id, type: number, primary_key: true}',
      '',
    ].join('\n');
    const [renamed] = withSuggestedNames([
      { cube: 'class', fileName: 'class.yml', content, unmappedColumns: [] },
    ]);
    expect(renamed?.content).toBe(content.replace('  - name: class', '  - name: t_class'));
  });

  it('leaves a batch whose names are in the grammar exactly as Cube answered it', () => {
    const cubes = [scaffolded('stores'), scaffolded('visits', ['stores'])];
    expect(withSuggestedNames(cubes)).toEqual(cubes);
  });
});
