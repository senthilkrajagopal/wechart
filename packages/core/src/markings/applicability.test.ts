import { describe, expect, it } from 'vitest';

import { markingApplicability } from './applicability';
import { EMPTY_PREDICATE, withItem, withRange } from './predicate';

/**
 * T109 / AC-103: WHEN a tile's cube or view cannot resolve every member of a
 * marking's predicate, THE SYSTEM SHALL leave that tile unmarked and label it
 * as not linked to that marking.
 * `Fails when: the tile shows a query error, or is silently left unbrushed
 * with no label.`
 *
 * Both failing states are about what the user is told, and they are the two
 * ways of telling them badly. A query error blames them for something they did
 * not do — the marking is fine, the tile is fine, they simply do not meet. And
 * silence is worse: a tile sitting unbrushed among brushed ones looks like a
 * tile with nothing marked in it, which is a different and wrong answer.
 *
 * So the check happens *before* any query is sent. A predicate naming a member
 * this cube cannot reach is not a query to try and recover from; it is a query
 * not to send.
 */
const status = [{ member: 'orders.status', value: 'paid' }];
const region = [{ member: 'customers.region', value: 'east' }];

const ordersOnly = ['orders.status', 'orders.count', 'orders.created'];

describe('whether a marking applies to a tile', () => {
  it('links when every member resolves', () => {
    const result = markingApplicability(withItem(EMPTY_PREDICATE, status), ordersOnly);

    expect(result.linked).toBe(true);
  });

  it('does not link when a member cannot be resolved', () => {
    const result = markingApplicability(withItem(EMPTY_PREDICATE, region), ordersOnly);

    expect(result.linked).toBe(false);
  });

  it('names the member that could not be resolved', () => {
    /**
     * "Not linked" alone tells someone their dashboard is not doing what they
     * expected and nothing about why. The member name is what turns it into
     * something fixable — usually a missing join.
     */
    const result = markingApplicability(withItem(EMPTY_PREDICATE, region), ordersOnly);

    expect(result.linked === false && result.missing).toEqual(['customers.region']);
    expect(result.linked === false && result.label).toContain('customers.region');
  });

  it('lists every unresolvable member, not just the first', () => {
    // Two missing joins are a different conversation from one, and finding
    // out about the second only after fixing the first is a poor way to have
    // it.
    const predicate = withItem(withItem(EMPTY_PREDICATE, region), [
      { member: 'products.line', value: 'Instruments' },
    ]);

    const result = markingApplicability(predicate, ordersOnly);

    expect(result.linked === false && result.missing).toEqual([
      'customers.region',
      'products.line',
    ]);
  });

  it('does not repeat a member that appears in several marked items', () => {
    const predicate = withItem(withItem(EMPTY_PREDICATE, region), [
      { member: 'customers.region', value: 'west' },
    ]);

    expect(markingApplicability(predicate, ordersOnly).linked === false).toBe(true);
    const result = markingApplicability(predicate, ordersOnly);
    expect(result.linked === false && result.missing).toEqual(['customers.region']);
  });

  it('checks the members of a tuple, all of them', () => {
    // One marked item can name two dimensions, and a tile that resolves only
    // one of them cannot draw that item.
    const pair = [
      { member: 'orders.status', value: 'paid' },
      { member: 'customers.region', value: 'east' },
    ];

    const result = markingApplicability(withItem(EMPTY_PREDICATE, pair), ordersOnly);

    expect(result.linked === false && result.missing).toEqual(['customers.region']);
  });

  it('checks the members of a bounded range too', () => {
    const ranged = withRange(EMPTY_PREDICATE, { member: 'products.price', from: 1, to: 9 });

    const result = markingApplicability(ranged, ordersOnly);

    expect(result.linked === false && result.missing).toEqual(['products.price']);
  });

  it('links an empty marking to everything, because it asks nothing of the tile', () => {
    /**
     * An empty marking names no members, so there is nothing a tile could fail
     * to resolve. Labelling every tile "not linked" on an untouched dashboard
     * would be the noisiest possible reading of the rule.
     */
    expect(markingApplicability(EMPTY_PREDICATE, ordersOnly).linked).toBe(true);
    expect(markingApplicability(EMPTY_PREDICATE, []).linked).toBe(true);
  });

  it('does not link when the tile resolves nothing at all', () => {
    // A tile whose members are not known yet — meta still loading — is not
    // linked rather than assumed linked: the safe answer is the one that does
    // not send a query naming members nobody has confirmed.
    const result = markingApplicability(withItem(EMPTY_PREDICATE, status), []);

    expect(result.linked).toBe(false);
  });
});
