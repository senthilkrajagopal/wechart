import { describe, expect, it } from 'vitest';

import { annotationsOf } from './annotations';

/**
 * T482 / AC-134, design 03 note 4: what a file holds that a form edit can
 * lose — its comments, anchors and aliases — each with the YAML lines it is
 * on, so the editor can name them before any edit, and show them in the YAML.
 */
describe('a model file’s comments, anchors and aliases, by line', () => {
  it('names a block of comment lines once, by its first line, with the lines it spans', () => {
    const text = [
      'cubes:',
      '  - name: orders',
      '    # Cube hides primary keys from metadata unless told otherwise. This one',
      '    # is public so the sample model has a high-cardinality dimension.',
      '    public: true',
    ].join('\n');
    expect(annotationsOf(text)).toEqual([
      {
        kind: 'comment',
        text: 'Cube hides primary keys from metadata unless told otherwise. This one',
        from: 3,
        to: 4,
      },
    ]);
  });

  it('finds a comment after a value, and none inside quotes', () => {
    const text = [
      'cubes:',
      '  - name: orders # the base table',
      '    sql: "SELECT 1 # not a comment"',
      "    title: 'Orders #1'",
      '    description: a#b',
    ].join('\n');
    expect(annotationsOf(text)).toEqual([
      { kind: 'comment', text: 'the base table', from: 2, to: 2 },
    ]);
  });

  it('reads a block scalar’s lines as its text, not as comments', () => {
    const text = [
      'cubes:',
      '  - name: orders',
      '    sql: |',
      '      SELECT *',
      '      # part of the SQL',
      '      FROM orders',
      '    # after it',
      '    title: Orders',
    ].join('\n');
    expect(annotationsOf(text)).toEqual([{ kind: 'comment', text: 'after it', from: 7, to: 7 }]);
  });

  it('finds anchors and aliases by name, on their lines, and keeps the file’s order', () => {
    const text = [
      '# The shared filters',
      'x-filters: &shared',
      '  - sql: "{CUBE}.status = \'*done\'"',
      'cubes:',
      '  - name: orders',
      '    filters: *shared',
    ].join('\n');
    expect(annotationsOf(text)).toEqual([
      { kind: 'comment', text: 'The shared filters', from: 1, to: 1 },
      { kind: 'anchor', text: 'shared', from: 2, to: 2 },
      { kind: 'alias', text: 'shared', from: 6, to: 6 },
    ]);
  });

  it('reads no mark inside quotes', () => {
    const text = ['cubes:', '  - name: orders', '    sql: "SELECT * FROM t WHERE a = &b"'].join(
      '\n',
    );
    expect(annotationsOf(text)).toEqual([]);
  });

  it('separates two comment blocks with code between them', () => {
    const text = ['# one', 'cubes:', '  # two', '  - name: a'].join('\n');
    expect(annotationsOf(text).map((each) => [each.text, each.from, each.to])).toEqual([
      ['one', 1, 1],
      ['two', 3, 3],
    ]);
  });

  /** T482's review: only where a node starts is `*` an alias and `&` an anchor. */
  it('reads no mark inside a plain value', () => {
    const text = [
      'cubes:',
      '  - name: orders',
      '    description: Orders *excluding* returns & refunds',
      '    title: a&b',
      '    filters: [ *shared, &one x ]',
    ].join('\n');
    expect(annotationsOf(text).map((each) => [each.kind, each.text, each.from])).toEqual([
      ['alias', 'shared', 5],
      ['anchor', 'one', 5],
    ]);
  });

  /** T482's review: a block scalar under a list item's key ends at that item's next key. */
  it('ends a list item’s block scalar at the item’s next key', () => {
    const text = [
      'cubes:',
      '  - sql: |',
      '      SELECT 1',
      '      # part of the SQL',
      '    # about the name',
      '    name: &n orders',
      '  - name: *n',
    ].join('\n');
    expect(annotationsOf(text).map((each) => [each.kind, each.text, each.from])).toEqual([
      ['comment', 'about the name', 5],
      ['anchor', 'n', 6],
      ['alias', 'n', 7],
    ]);
  });

  /** T482's review: a quoted value may run over lines; what it holds is not a comment. */
  it('reads a quoted value that runs over lines as its text', () => {
    const text = [
      'cubes:',
      '  - name: orders',
      '    description: "Orders, not',
      '      # a comment, but the text"',
      "    title: 'one",
      "      #two' # a comment",
    ].join('\n');
    expect(annotationsOf(text)).toEqual([{ kind: 'comment', text: 'a comment', from: 6, to: 6 }]);
  });

  it('finds nothing in a file with none', () => {
    expect(annotationsOf('cubes:\n  - name: a\n    sql_table: t\n')).toEqual([]);
  });
});
