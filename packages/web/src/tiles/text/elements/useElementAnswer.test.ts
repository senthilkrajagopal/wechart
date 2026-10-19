import { describe, expect, it } from 'vitest';

import { TileLoadError } from '../../../query/loadTile';
import { phaseOf } from './useElementAnswer';

/**
 * AC-525 (the coordinator, checkpoint 3): the tile's ⋯ offers Retry only
 * while a failure Retry can help with exists; a member the viewer may not
 * query (a 403, a hidden member) is no such failure, so it reports as
 * answered, not failed.
 */
describe('an element’s phase, told to its tile', () => {
  it('is loading while asked, failed on an error Retry can help with, and in otherwise', () => {
    expect(phaseOf({ pending: true, placeholder: false, error: undefined })).toBe('loading');
    expect(phaseOf({ pending: false, placeholder: true, error: undefined })).toBe('loading');
    expect(
      phaseOf({ pending: false, placeholder: false, error: new TileLoadError('no', {}, 500) }),
    ).toBe('error');
    expect(phaseOf({ pending: false, placeholder: false, error: undefined })).toBe('ready');
  });

  it('is not failed when the viewer may not query its member: Retry can’t help', () => {
    expect(
      phaseOf({
        pending: false,
        placeholder: false,
        error: new TileLoadError('Forbidden', {}, 403),
      }),
    ).toBe('ready');
  });
});
