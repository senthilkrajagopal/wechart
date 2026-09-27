import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { CubeState, cubeStateLabel, type CubeStateView } from './CubeState';

/**
 * T365 (AC-161): whether every running Cube instance uses a data source's
 * settings, as `GET /api/data-sources/:id/cube-state` says: each instance
 * reporting within the hour, on the stored version and live. xcube swaps the
 * driver while Cube runs, so nothing ever asks for a restart. As every state
 * in the app, an icon and words, never colour alone (direction.md rule 22).
 */
type Instance = Extract<CubeStateView, { instances: unknown }>['instances'][number];
const instance = (over: Partial<Instance> = {}): Instance => ({
  instance: 'cube-1/1/aaaaaa',
  version: 7,
  state: 'live',
  error: null,
  reportedAt: '2026-09-26T11:55:00.000Z',
  current: true,
  ...over,
});

describe('whether Cube uses a data source’s settings (T365, AC-161)', () => {
  it.each([
    [{ state: 'live', version: 7, instances: [instance()] }, 'ok', 'Cube uses these settings'],
    [
      { state: 'waiting', version: 7, instances: [instance({ current: false, version: 6 })] },
      'run',
      'Waiting for Cube to pick up the change',
    ],
    [
      {
        state: 'failed',
        version: 7,
        instances: [instance({ state: 'failed', error: 'password authentication failed' })],
      },
      'err',
      'Cube couldn’t take these settings',
    ],
    [
      { state: 'unused', version: 7, instances: [] },
      'idle',
      'No Cube instance has reported on it in the last hour',
    ],
    [{ state: 'unlanded' }, 'warn', 'Not yet published to Cube'],
  ] as [CubeStateView, string, string][])('%o reads %s, “%s”', (view, kind, label) => {
    expect(cubeStateLabel(view)).toEqual({ kind, label });
  });

  it('shows a failed instance’s error, and how many instances it heard from', () => {
    render(
      <CubeState
        view={{
          state: 'failed',
          version: 7,
          instances: [
            instance(),
            instance({
              instance: 'cube-2/1/bbbbbb',
              state: 'failed',
              error: 'password authentication failed',
            }),
          ],
        }}
      />,
    );

    const badge = screen.getByTestId('cube-state');
    expect(badge.textContent).toBe('Cube couldn’t take these settings');
    expect(badge.getAttribute('data-state')).toBe('failed');
    expect(badge.querySelector('svg')).not.toBeNull();
    expect(screen.getByRole('listitem').textContent).toBe('password authentication failed');
    expect(screen.getByText('2 Cube instances reported within the hour').tagName).toBe('P');
  });

  it('never asks for a restart', () => {
    for (const view of [
      { state: 'live', version: 1, instances: [instance()] },
      { state: 'waiting', version: 1, instances: [instance({ current: false })] },
      { state: 'failed', version: 1, instances: [instance({ state: 'failed', error: 'x' })] },
      { state: 'unused', version: 1, instances: [] },
      { state: 'unlanded' },
    ] as CubeStateView[]) {
      const { container, unmount } = render(<CubeState view={view} />);
      expect(container.textContent ?? '').not.toMatch(/restart/i);
      unmount();
    }
  });
});
