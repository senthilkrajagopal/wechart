import { describe, expect, it } from 'vitest';

import { changesetOf } from './changesets';

/**
 * T426: a publish is sent to xcube as a changeset on the items it changes
 * (research `xcube-slice-3a.md`, "POST …/changesets"): an upsert for each
 * item new or edited, a delete for each name no longer declared. Each file is
 * one root item until models live in folders (T334).
 */
const ORDERS = { path: 'cubes/orders.yml', content: 'cubes:\n  - name: orders\n' };
const SALES = { path: 'views/sales.yml', content: 'views:\n  - name: sales\n' };
const item = (file: { content: string }, name: string, kind: 'cube' | 'view' = 'cube') => ({
  folderId: 'froot',
  name,
  kind,
  yaml: file.content,
});

describe('a publish’s changeset (T426)', () => {
  it('upserts an item edited or new, and nothing else', () => {
    const edited = { ...ORDERS, content: 'cubes:\n  - name: orders\n    title: Orders\n' };
    const added = { path: 'cubes/lines.yml', content: 'cubes:\n  - name: lines\n' };

    expect(changesetOf([ORDERS, SALES], [edited, SALES, added])).toEqual({
      upserts: [item(edited, 'orders'), item(added, 'lines')],
      deletes: [],
    });
  });

  it('deletes a name no longer declared, as when a cube is renamed in its file', () => {
    const renamed = { ...ORDERS, content: 'cubes:\n  - name: purchases\n' };

    expect(changesetOf([ORDERS, SALES], [renamed, SALES])).toEqual({
      upserts: [item(renamed, 'purchases')],
      deletes: [{ folderId: 'froot', name: 'orders' }],
    });
  });

  it('is empty when nothing an item holds changed', () => {
    expect(changesetOf([ORDERS, SALES], [SALES, ORDERS])).toEqual({ upserts: [], deletes: [] });
  });

  it('never carries what is never sent: a template or a file that isn’t YAML', () => {
    const template = { path: 'cubes/t.yml', content: 'cubes:\n  - name: t\n    sql: "{{ x }}"\n' };
    const script = { path: 'cubes/a.js', content: 'cube(`a`, {})' };

    expect(changesetOf([ORDERS], [ORDERS, template, script])).toEqual({
      upserts: [],
      deletes: [],
    });
  });
});
