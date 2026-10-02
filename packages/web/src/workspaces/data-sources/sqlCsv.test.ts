import { describe, expect, it } from 'vitest';

import { csvFileName, csvOf } from './sqlCsv';

/**
 * T535 (AC-380; R50-11; design 15's B2): Download CSV writes the rows the
 * run returned, the column names first, from the result in hand: the query
 * isn't run again. Values as they came, NULL an empty field.
 */
describe('a run’s CSV (T535, AC-380)', () => {
  it('holds the column names, then exactly the rows, as they came', () => {
    expect(
      csvOf(
        [
          { name: 'order_id', type: 'int8' },
          { name: 'customer', type: 'text' },
          { name: 'amount', type: 'numeric' },
          { name: 'note', type: 'text' },
        ],
        [
          ['100482', 'Nordwind Handels GmbH', '18420.00', null],
          ['100317', 'Lumen, "Retail" SA', '17950.50', 'line one\nline two'],
          [7, true, { a: 1 }, ''],
        ],
      ),
    ).toBe(
      [
        'order_id,customer,amount,note',
        '100482,Nordwind Handels GmbH,18420.00,',
        '100317,"Lumen, ""Retail"" SA",17950.50,"line one\nline two"',
        '7,true,"{""a"":1}",',
        '',
      ].join('\r\n'),
    );
  });

  it('marks text a spreadsheet would run as a formula as text, and leaves numbers as they are (T535’s review)', () => {
    expect(
      csvOf(
        [
          { name: '=HYPERLINK("x")', type: 'text' },
          { name: 'n', type: 'numeric' },
        ],
        [
          ['=1+2', '-12.50'],
          ['+cmd', -3],
          ['-x', '+4e2'],
          ['@SUM(A1)', '1'],
          ['\tlead', null],
          ['\rlead', '0'],
          ['a=b', '-'],
        ],
      ),
    ).toBe(
      [
        `"'=HYPERLINK(""x"")",n`,
        "'=1+2,-12.50",
        "'+cmd,-3",
        "'-x,+4e2",
        "'@SUM(A1),1",
        "'\tlead,",
        `"'\rlead",0`,
        "a=b,'-",
        '',
      ].join('\r\n'),
    );
  });

  it('keeps duplicate column names as they are', () => {
    expect(
      csvOf(
        [
          { name: 'a', type: 'int4' },
          { name: 'a', type: 'int4' },
        ],
        [[1, 2]],
      ),
    ).toBe('a,a\r\n1,2\r\n');
  });

  it('is named for the data source and the run’s start, in the user’s own time', () => {
    expect(csvFileName('emea_replica', new Date(2026, 9, 1, 14, 32, 5))).toBe(
      'emea_replica-2026-10-01-143205.csv',
    );
  });
});
