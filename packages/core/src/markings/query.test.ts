import { describe, expect, it } from 'vitest';

import { EMPTY_PREDICATE, type MarkingPredicate } from './predicate';
import { asUtc, limitFilterFor } from './query';

/**
 * T113 / AC-107: WHEN a tile is limited by one or more markings, THE SYSTEM
 * SHALL restrict its query to those markings, combined as All markings (AND)
 * or Any marking (OR) according to its setting, and SHALL skip markings that
 * are empty (direction.md rule 33).
 * `Fails when: a tile limited by two markings with one empty returns no rows,
 * or OR behaves as AND.`
 *
 * In the query, not in the rows: a limited tile asks Cube a narrower question
 * and draws the answer. Filtering the rows afterwards would leave every
 * aggregate computed over everything — a "total" that was not the total of
 * what is shown.
 */
const status = (...values: string[]): MarkingPredicate => ({
  items: values.map((value) => [{ member: 'orders.status', value }]),
  ranges: [],
});

const row = (id: string, region: string) => [
  { member: 'orders.id', value: id },
  { member: 'orders.region', value: region },
];

const rowsOf = (...rows: ReturnType<typeof row>[]): MarkingPredicate => ({
  items: rows,
  ranges: [],
});

describe('what a marking adds to a limited tile’s query', () => {
  it('asks for the marked values of one member', () => {
    // Values in a canonical order rather than the order they were clicked in;
    // that is AC-105's, tested below.
    expect(limitFilterFor([status('shipped', 'completed')], 'all')).toEqual({
      member: 'orders.status',
      operator: 'equals',
      values: ['completed', 'shipped'],
    });
  });

  it('asks for whole rows as an OR of ANDs, where an item names several members', () => {
    // A marked table row is identified by its key and whatever else the
    // tuple carries; two such rows are alternatives, not a conjunction.
    expect(limitFilterFor([rowsOf(row('1', 'west'), row('2', 'east'))], 'all')).toEqual({
      or: [
        {
          and: [
            { member: 'orders.id', operator: 'equals', values: ['1'] },
            { member: 'orders.region', operator: 'equals', values: ['west'] },
          ],
        },
        {
          and: [
            { member: 'orders.id', operator: 'equals', values: ['2'] },
            { member: 'orders.region', operator: 'equals', values: ['east'] },
          ],
        },
      ],
    });
  });

  it('asks for a range as its two ends', () => {
    const between: MarkingPredicate = {
      items: [],
      ranges: [{ member: 'orders.count', from: 10, to: 40 }],
    };

    expect(limitFilterFor([between], 'all')).toEqual({
      and: [
        { member: 'orders.count', operator: 'gte', values: ['10'] },
        { member: 'orders.count', operator: 'lte', values: ['40'] },
      ],
    });
  });

  it('combines two markings with AND, or with OR, as the tile is set', () => {
    const two = [status('shipped'), rowsOf(row('1', 'west'))];

    expect(limitFilterFor(two, 'all')).toEqual({
      and: [
        { member: 'orders.status', operator: 'equals', values: ['shipped'] },
        {
          and: [
            { member: 'orders.id', operator: 'equals', values: ['1'] },
            { member: 'orders.region', operator: 'equals', values: ['west'] },
          ],
        },
      ],
    });

    expect(limitFilterFor(two, 'any')).toEqual({
      or: [
        { member: 'orders.status', operator: 'equals', values: ['shipped'] },
        {
          and: [
            { member: 'orders.id', operator: 'equals', values: ['1'] },
            { member: 'orders.region', operator: 'equals', values: ['west'] },
          ],
        },
      ],
    });
  });

  it('skips an empty marking rather than letting it narrow anything', () => {
    // The criterion's own failing state: two markings, one empty, must not
    // return no rows.
    expect(limitFilterFor([status('shipped'), EMPTY_PREDICATE], 'all')).toEqual({
      member: 'orders.status',
      operator: 'equals',
      values: ['shipped'],
    });
  });

  /**
   * AC-105: WHEN the same set of items is marked again, THE SYSTEM SHALL
   * produce an identical Cube query to the previous time, so the result can be
   * served from cache.
   * `Fails when: marking the same two bars in the other order asks Cube a
   * different question.`
   *
   * A marking is a set; the order its items arrived in is the user's clicking
   * history, which Cube has no opinion about. Left unsorted, clicking A then B
   * and B then A would be two cache entries for one question — and the second
   * would go to the database for an answer already in memory.
   */
  it('asks the same question for the same set of marks, whatever order they came in', () => {
    expect(limitFilterFor([status('shipped', 'completed')], 'all')).toEqual(
      limitFilterFor([status('completed', 'shipped')], 'all'),
    );

    expect(limitFilterFor([rowsOf(row('1', 'west'), row('2', 'east'))], 'all')).toEqual(
      limitFilterFor([rowsOf(row('2', 'east'), row('1', 'west'))], 'all'),
    );
  });

  /**
   * A time bucket is a *span*, not an instant.
   * `docs/research/cube/markings-query-support.md` §1.2: "A time bucket like
   * `orders.order_date.month` cannot be a filter member"; each bucket is
   * `inDateRange` with `["<start>.000","<end>.999"]`, the bounds the SDK's own
   * `drillDown` computes for a clicked mark.
   */
  it('asks for a marked time bucket as the range it covers, not as an instant', () => {
    const march: MarkingPredicate = {
      items: [[{ member: 'orders.ordered_at', granularity: 'month', value: '2026-03-01' }]],
      ranges: [],
    };

    expect(limitFilterFor([march], 'all')).toEqual({
      member: 'orders.ordered_at',
      operator: 'inDateRange',
      values: ['2026-03-01T00:00:00.000', '2026-03-31T23:59:59.999'],
    });
  });

  /**
   * Cube writes a bucket's value with no zone ("2026-03-01T00:00:00.000"),
   * wall-clock in the query's time zone — UTC, as wechart asks. Read as the
   * browser's local time, the span slid by the machine's offset, and a marked
   * March limited tiles to 1 March 08:00 onwards in California (T119, found
   * while negating it).
   */
  // The same, whatever zone the machine running the test is in (T119's
  // review, M5): the test below passes on a UTC machine with or without it.
  it('marks a time Cube wrote without a zone as UTC, and leaves one that names its zone', () => {
    expect(asUtc('2026-03-01T00:00:00.000')).toBe('2026-03-01T00:00:00.000Z');
    expect(asUtc('2026-03-01T00:00:00.000Z')).toBe('2026-03-01T00:00:00.000Z');
    expect(asUtc('2026-03-01T00:00:00.000+05:30')).toBe('2026-03-01T00:00:00.000+05:30');
    expect(asUtc('2026-03-01')).toBe('2026-03-01');
  });

  it('reads a bucket value Cube writes without a zone as UTC, wherever the browser is', () => {
    const march: MarkingPredicate = {
      items: [
        [{ member: 'orders.ordered_at', granularity: 'month', value: '2026-03-01T00:00:00.000' }],
      ],
      ranges: [],
    };

    expect(limitFilterFor([march], 'all')).toEqual({
      member: 'orders.ordered_at',
      operator: 'inDateRange',
      values: ['2026-03-01T00:00:00.000', '2026-03-31T23:59:59.999'],
    });
  });

  it('keeps a bucket beside the other members of the same marked item', () => {
    const cell: MarkingPredicate = {
      items: [
        [
          { member: 'products.category', value: 'Beverages' },
          { member: 'orders.ordered_at', granularity: 'day', value: '2026-03-04' },
        ],
      ],
      ranges: [],
    };

    expect(limitFilterFor([cell], 'all')).toEqual({
      and: [
        {
          member: 'orders.ordered_at',
          operator: 'inDateRange',
          values: ['2026-03-04T00:00:00.000', '2026-03-04T23:59:59.999'],
        },
        { member: 'products.category', operator: 'equals', values: ['Beverages'] },
      ],
    });
  });

  /**
   * §1.5: "The docs only say 'use `notSet`' for NULL checks… **Emit
   * `notSet`/`set` for documented behavior.**" `equals ['']` compiles to
   * `col = ''`, which matches empty strings and never NULLs — so a details
   * tile limited by a marking holding a null category would silently drop
   * exactly the rows the user marked.
   */
  it('asks for a marked NULL as notSet, not as an empty string', () => {
    const missing: MarkingPredicate = {
      items: [[{ member: 'customers.region', value: null }]],
      ranges: [],
    };

    expect(limitFilterFor([missing], 'all')).toEqual({
      member: 'customers.region',
      operator: 'notSet',
    });
  });

  it('keeps a marked NULL beside the other marked values of that member', () => {
    const both: MarkingPredicate = {
      items: [
        [{ member: 'customers.region', value: 'west' }],
        [{ member: 'customers.region', value: null }],
      ],
      ranges: [],
    };

    // §1.6: "With other values on the same member", an `or` of the `equals`
    // and the `notSet` — a NULL cannot join the values list.
    expect(limitFilterFor([both], 'all')).toEqual({
      or: [
        { member: 'customers.region', operator: 'equals', values: ['west'] },
        { member: 'customers.region', operator: 'notSet' },
      ],
    });
  });

  it('is nothing at all when every marking limiting the tile is empty', () => {
    // Nothing to add to the query: what the tile then shows is AC-109's.
    expect(limitFilterFor([EMPTY_PREDICATE, EMPTY_PREDICATE], 'all')).toBeUndefined();
    expect(limitFilterFor([], 'any')).toBeUndefined();
  });
});
