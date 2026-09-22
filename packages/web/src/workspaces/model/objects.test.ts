import { describe, expect, it } from 'vitest';

import { objectsOf } from './objects';

/**
 * T137 / AC-131: WHEN the user opens the Model workspace, THE SYSTEM SHALL
 * list the model files and show the cubes, views, measures, dimensions,
 * segments, hierarchies, joins and pre-aggregations each file defines.
 * Fails when: a file's object is missing from the listing.
 *
 * What a file defines, read from its text with Cube's own YAML reading
 * (research/yaml.md, `CUBE_PARSE`).
 */
const CUBE = `cubes:
  - name: orders
    sql_table: public.orders
    joins:
      - name: customers
        sql: '{CUBE}.customer_id = {customers}.id'
        relationship: many_to_one
    dimensions:
      - name: id
        sql: id
        type: number
        primary_key: true
      - name: status
        sql: status
        type: string
    measures:
      - name: count
        type: count
    segments:
      - name: shipped
        sql: "{CUBE}.status = 'shipped'"
    hierarchies:
      - name: by_status
        levels: [status]
    pre_aggregations:
      - name: by_day
        measures: [count]
`;

describe('what a file defines', () => {
  it('lists a cube with every kind of member AC-131 names', () => {
    expect(objectsOf('cubes/orders.yml', CUBE)).toEqual({
      objects: [
        {
          kind: 'cube',
          name: 'orders',
          members: [
            { kind: 'measure', name: 'count' },
            { kind: 'dimension', name: 'id' },
            { kind: 'dimension', name: 'status' },
            { kind: 'segment', name: 'shipped' },
            { kind: 'hierarchy', name: 'by_status' },
            { kind: 'join', name: 'customers' },
            { kind: 'pre-aggregation', name: 'by_day' },
          ],
        },
      ],
    });
  });

  it('lists every cube and view a file holds', () => {
    const text = `cubes:
  - name: a
  - name: b
views:
  - name: summary
    cubes:
      - join_path: a
        includes: "*"
`;
    expect(objectsOf('both.yml', text).objects.map(({ kind, name }) => [kind, name])).toEqual([
      ['cube', 'a'],
      ['cube', 'b'],
      ['view', 'summary'],
    ]);
  });

  it('lists a view’s own members, and the members it includes from its cubes', () => {
    const text = `views:
  - name: summary
    cubes:
      - join_path: orders
        includes:
          - count
          - name: status
            alias: order_status
      - join_path: orders.customers
        includes: "*"
    measures:
      - name: share
        sql: "{count} / 2"
        type: number
`;
    expect(objectsOf('views/summary.yml', text).objects).toEqual([
      {
        kind: 'view',
        name: 'summary',
        members: [
          { kind: 'measure', name: 'share' },
          { kind: 'include', name: 'orders.count' },
          { kind: 'include', name: 'orders.status' },
          { kind: 'include', name: 'orders.customers.*' },
        ],
      },
    ]);
  });

  it('holds a Jinja template as a template, rather than reading it as YAML', () => {
    // Cube renders Jinja before it reads the YAML (research/cube/data-modeling.md).
    const loop = 'cubes:\n{% for name in ["a", "b"] %}\n  - name: {{ name }}\n{% endfor %}\n';

    expect(objectsOf('cubes/generated.yml', loop)).toEqual({ objects: [], code: 'Jinja' });
    expect(objectsOf('cubes/plain.yml.jinja', 'cubes:\n  - name: a\n')).toEqual({
      objects: [],
      code: 'Jinja',
    });
  });

  it('says a file’s values cannot be read, rather than failing the whole listing', () => {
    const read = objectsOf('cubes/x.yml', 'cubes:\n  - name: a\n    sql_table: *ba\n');

    expect(read.objects).toEqual([]);
    expect(read.problem).toBe('Unresolved alias (the anchor must be set before the alias): ba');
  });

  it('says where a file cannot be read, rather than listing nothing', () => {
    const read = objectsOf('cubes/broken.yml', 'cubes:\n  - name: [unclosed\n');

    expect(read.objects).toEqual([]);
    expect(read.problem).toMatch(/line \d+/);
  });

  it('says a JavaScript or Python file is code, whose objects are not listed from its text', () => {
    // Read-only in the editor with a reason (AC-140, T146); nothing to parse here.
    expect(objectsOf('cubes/generated.js', 'cube(`x`, {});')).toEqual({
      objects: [],
      code: 'JavaScript',
    });
    expect(objectsOf('globals.py', 'from cube import TemplateContext')).toEqual({
      objects: [],
      code: 'Python',
    });
  });
});
