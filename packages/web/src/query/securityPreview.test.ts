import { describe, expect, it } from 'vitest';

import { previewClaimsOf, wechartClaimIn } from './securityPreview';

/**
 * T172 / AC-166, from its review: the banner names the context that runs. A
 * preview arriving by its address — typed, bookmarked, shared — carries only
 * what the API will sign, since the API drops wechart's own claims and the
 * token's.
 */
describe('a previewed context as it runs', () => {
  it('drops the claims wechart sets itself, keeping the context’s own', () => {
    expect(
      previewClaimsOf({
        groups: ['sales'],
        sub: 'rep-7',
        wechartModel: 'x',
        wechartRevision: 9,
        exp: 1,
        iat: 1,
        nbf: 1,
        iss: 'x',
        aud: 'x',
      }),
    ).toEqual({ groups: ['sales'], sub: 'rep-7' });
  });

  it('is no preview when it is not an object', () => {
    expect(previewClaimsOf(['sales'])).toBeUndefined();
    expect(previewClaimsOf(null)).toBeUndefined();
    expect(previewClaimsOf('{"groups":["sales"]}')).toBeUndefined();
  });

  it('names the first claim wechart sets itself', () => {
    expect(wechartClaimIn({ groups: [], exp: 1 })).toBe('exp');
    expect(wechartClaimIn({ groups: [], sub: 'rep-7' })).toBeUndefined();
  });
});
