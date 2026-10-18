import { randomUUID } from 'node:crypto';

import { getDb } from '../db/client';
import { type RateLimitCounter, rateLimitCounter } from './rateLimitStore';

const TEST_KEYS = 'test:';

/**
 * `/mcp`'s real counter in the metadata database, its keys kept apart from
 * every other server's (T780): tests that aren't about the limits send many
 * requests from `inject`'s one address, 127.0.0.1, and would otherwise share
 * its 20 bad-token requests a minute across files.
 */
export function testCounter(): RateLimitCounter {
  const counter = rateLimitCounter(getDb());
  const own = `${TEST_KEYS}${randomUUID()}:`;
  return {
    hit: (key, windowMs) => counter.hit(`${own}${key}`, windowMs),
    removeBefore: (cutoff) => counter.removeBefore(cutoff),
  };
}

/** Removes every count `testCounter` kept. */
export async function forgetTestCounts(): Promise<void> {
  await getDb().deleteFrom('mcp_rate_limit').where('key', 'like', `${TEST_KEYS}%`).execute();
}
