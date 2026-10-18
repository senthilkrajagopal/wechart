import { describe, expect, it } from 'vitest';

import { dialectFor, statementAt } from './statementAt';

/**
 * T803 (AC-387): with none selected, only the statement at the cursor runs,
 * bounded by semicolons outside string literals and comments.
 * Fails when: with the cursor in the second of two statements, anything but
 * that statement reaches the database.
 */
const TEXT = "SELECT 1; SELECT ';' AS a; -- x;";
const at = (text: string, cursor: number) => {
  const found = statementAt(text, cursor);
  return found === null ? null : text.slice(found.from, found.to);
};

describe('the statement at the cursor (T803, AC-387)', () => {
  it('is the one the cursor is in, a semicolon in a string or comment bounding nothing', () => {
    expect(at(TEXT, TEXT.indexOf('AS a'))).toBe("SELECT ';' AS a");
    expect(statementAt(TEXT, TEXT.indexOf('AS a'))?.text).toBe("SELECT ';' AS a");
  });

  it('is the first where the cursor is in the first', () => {
    expect(at(TEXT, 3)).toBe('SELECT 1');
  });

  it('is the whole text where there is no semicolon', () => {
    expect(at('SELECT 1\nFROM t', 4)).toBe('SELECT 1\nFROM t');
  });

  it('is the one just ended where the cursor sits after its semicolon, with nothing after it', () => {
    const text = 'SELECT 1;\nSELECT 2;';
    expect(at(text, text.length)).toBe('SELECT 2');
    expect(at(text, text.indexOf(';') + 1)).toBe('SELECT 1');
  });

  it('skips semicolons in block comments and quoted names', () => {
    const text = 'SELECT 1 /* ; */ AS "a;b"; SELECT 2';
    expect(at(text, 2)).toBe('SELECT 1 /* ; */ AS "a;b"');
    expect(at(text, text.length - 1)).toBe('SELECT 2');
  });

  it('in a stretch of only a comment after the last semicolon, is the statement before it', () => {
    expect(at(TEXT, TEXT.length)).toBe("SELECT ';' AS a");
  });

  it('reads strings as the source’s database does (T803’s review)', () => {
    const dollar = 'SELECT $$a;b$$ AS x; SELECT 2';
    expect(statementAt(dollar, 3, dialectFor('postgres'))?.text).toBe('SELECT $$a;b$$ AS x');
    const escaped = "SELECT 'it\\'s;' AS x; SELECT 2";
    expect(statementAt(escaped, 3, dialectFor('mysql'))?.text).toBe("SELECT 'it\\'s;' AS x");
    const ticked = 'SELECT 1 AS `a;b`; SELECT 2';
    expect(statementAt(ticked, 3, dialectFor('mysql'))?.text).toBe('SELECT 1 AS `a;b`');
  });

  it('keeps a comment in its statement, and finds none in an empty text', () => {
    const text = '-- the first\nSELECT 1;\nSELECT 2';
    expect(at(text, 5)).toBe('-- the first\nSELECT 1');
    expect(statementAt('  \n ', 1)).toBeNull();
  });
});
