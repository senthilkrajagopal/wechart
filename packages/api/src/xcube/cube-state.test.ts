import { describe, expect, it } from 'vitest';

import type { ConnectionHealth } from './connections';
import { cubeStateOf } from './cube-state';

/**
 * T365 (AC-161): whether every running Cube instance uses a data source's
 * settings, from each instance's report (research `xcube-slice-6.md`, "`GET
 * …/connections/{name}/health`"). "Every instance" is every one whose report
 * is under an hour old: an older one is from an instance that's gone, and
 * isn't shown. Nothing asks for a restart: xcube swaps the driver.
 */
const NOW = new Date('2026-09-26T12:00:00.000Z');
const minutesAgo = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000).toISOString();
const report = (over: Partial<ConnectionHealth['instances'][number]> = {}) => ({
  instance: 'cube-1/1/aaaaaa',
  version: 7,
  state: 'live' as const,
  error: null,
  reportedAt: minutesAgo(5),
  current: true,
  ...over,
});
const health = (...instances: ConnectionHealth['instances']): ConnectionHealth => ({
  version: 7,
  instances,
});

describe('whether Cube uses a data source’s settings (T365, AC-161)', () => {
  it('is live when every instance reporting within the hour runs the stored version', () => {
    expect(
      cubeStateOf(
        health(report(), report({ instance: 'cube-2/1/bbbbbb', reportedAt: minutesAgo(59) })),
        NOW,
      ),
    ).toEqual({
      state: 'live',
      version: 7,
      instances: [report(), report({ instance: 'cube-2/1/bbbbbb', reportedAt: minutesAgo(59) })],
    });
  });

  it('waits while any instance within the hour still runs the settings before', () => {
    expect(
      cubeStateOf(
        health(report(), report({ instance: 'cube-2/1/bbbbbb', version: 6, current: false })),
        NOW,
      ).state,
    ).toBe('waiting');
  });

  it('says a swap failed, with its error, where an instance couldn’t take the new settings', () => {
    const failed = report({
      instance: 'cube-2/1/bbbbbb',
      state: 'failed',
      error: 'password authentication failed',
    });
    expect(cubeStateOf(health(report(), failed), NOW)).toEqual({
      state: 'failed',
      version: 7,
      instances: [report(), failed],
    });
  });

  it('waits on a failed report of the settings before, and on one naming no version (T365’s review)', () => {
    const behind = report({
      instance: 'cube-2/1/bbbbbb',
      version: 6,
      current: false,
      state: 'failed',
      error: 'old',
    });
    expect(cubeStateOf(health(report(), behind), NOW).state).toBe('waiting');
    // A failed swap to the new version outranks one still behind.
    const failed = report({ instance: 'cube-3/1/cccccc', state: 'failed', error: 'new' });
    expect(cubeStateOf(health(behind, failed), NOW).state).toBe('failed');
    expect(cubeStateOf(health(report({ version: null, current: false })), NOW).state).toBe(
      'waiting',
    );
  });

  it('keeps a report dated ahead of its own clock', () => {
    const ahead = report({ reportedAt: new Date(NOW.getTime() + 30_000).toISOString() });
    expect(cubeStateOf(health(ahead), NOW)).toEqual({
      state: 'live',
      version: 7,
      instances: [ahead],
    });
  });

  it('leaves out an instance whose report is over an hour old: it is gone', () => {
    const gone = report({
      instance: 'cube-9/1/cccccc',
      version: 5,
      current: false,
      reportedAt: minutesAgo(61),
    });
    expect(cubeStateOf(health(report(), gone), NOW)).toEqual({
      state: 'live',
      version: 7,
      instances: [report()],
    });
  });

  it('says none has used it yet where no instance reported within the hour, and none of it where xcube holds none', () => {
    expect(cubeStateOf(health(), NOW)).toEqual({ state: 'unused', version: 7, instances: [] });
    expect(cubeStateOf(health(report({ reportedAt: minutesAgo(90) })), NOW)).toEqual({
      state: 'unused',
      version: 7,
      instances: [],
    });
    expect(cubeStateOf(undefined, NOW)).toEqual({ state: 'unlanded' });
  });
});
