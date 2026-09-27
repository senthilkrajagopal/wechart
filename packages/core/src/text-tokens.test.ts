import { describe, expect, it } from 'vitest';

import {
  firstTokenIn,
  textPartsOf,
  textRenamed,
  tokenMembersOf,
  type TextToken,
} from './text-tokens';

/**
 * T389 / AC-116: WHEN a text tile contains a marking token, THE SYSTEM SHALL
 * render the marking's summary or count, and a measure token limited by a
 * marking SHALL show the measure over the marked rows, or over all data when
 * nothing is marked.
 * `Fails when: a token renders as literal text, or a limited measure ignores
 * the marking.`
 *
 * The tokens are direction.md's ("Markdown tokens"):
 * `{{marking:Name.summary}}`, `{{marking:Name.count}}` and
 * `{{measure:id | marking:Name}}`.
 */
describe('a text tile’s tokens', () => {
  it('finds each token in its text, and leaves the rest as text', () => {
    expect(
      textPartsOf(
        'Picked {{marking:Status picks.count}} of {{ measure:orders.count }}, {{measure:orders.total_amount | marking:Status picks}}: {{marking:Status picks.summary}}',
      ),
    ).toEqual([
      'Picked ',
      { kind: 'marking', name: 'Status picks', show: 'count' },
      ' of ',
      { kind: 'measure', member: 'orders.count' },
      ', ',
      { kind: 'measure', member: 'orders.total_amount', marking: 'Status picks' },
      ': ',
      { kind: 'marking', name: 'Status picks', show: 'summary' },
    ] satisfies (string | TextToken)[]);
  });

  it('reads a marking named with dots or a pipe, and spaces after the colons', () => {
    expect(
      textPartsOf(
        '{{marking: Q3.2 | best .count}} {{measure: orders.count | marking: Q3.2 | best}}',
      ),
    ).toEqual([
      { kind: 'marking', name: 'Q3.2 | best', show: 'count' },
      ' ',
      { kind: 'measure', member: 'orders.count', marking: 'Q3.2 | best' },
    ]);
  });

  it('leaves braces that are no token as the text they are', () => {
    expect(textPartsOf('{{nothing}} and {{marking:Name}} and {single}')).toEqual([
      '{{nothing}} and {{marking:Name}} and {single}',
    ]);
    // A limit naming no marking is no token, rather than a measure over everything.
    expect(textPartsOf('{{measure:orders.count | marking: }}')).toEqual([
      '{{measure:orders.count | marking: }}',
    ]);
    expect(textPartsOf('')).toEqual([]);
  });

  it('says where the first token is, past braces that are none', () => {
    expect(firstTokenIn('{{x}} is *{{marking:A.count}}*')).toEqual({ index: 10, length: 19 });
    expect(firstTokenIn('none here')).toBe(undefined);
  });
});

/**
 * T389's review, AC-272 and AC-275: a measure token names a member as a chart
 * does, so the API reads it to bind it at publish and to count it as a use.
 */
describe('the members a text names', () => {
  it('lists each measure token’s member once', () => {
    expect(
      tokenMembersOf(
        '{{measure:orders.count}} {{measure:orders.count | marking:A}} {{measure:customers.total}} {{marking:A.count}}',
      ),
    ).toEqual(['orders.count', 'customers.total']);
  });

  it('renames each measure token’s member and leaves every other character', () => {
    const text =
      'Orders: **{{measure:orders.count | marking:A}}** of {{ measure:orders.count }}, {{x}}';

    expect(textRenamed(text, (member) => member.replace(/^orders\./, 'fsales__orders.'))).toBe(
      'Orders: **{{measure:fsales__orders.count | marking:A}}** of {{ measure:fsales__orders.count }}, {{x}}',
    );
    expect(textRenamed(text, (member) => member)).toBe(text);
  });
});
