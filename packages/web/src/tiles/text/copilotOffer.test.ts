import { describe, expect, it } from 'vitest';

import { AI_PARKED, copilotOfferFor } from './copilotOffer';

/**
 * F47 and F48 are parked (the user, 2026-10-18; commit 200a3f22): Security ›
 * AI doesn't exist this phase, so the insert menu's Copilot group — and a
 * Super-Admin's disabled "Summarize…" pointing at that page (decision
 * T881-1) — is hidden for everyone while AI is parked. One flag un-parks it.
 */
describe('the insert menu’s Copilot offer while AI is parked', () => {
  it('is parked', () => {
    expect(AI_PARKED).toBe(true);
  });

  it('offers nothing, to a Super-Admin or anyone else', () => {
    expect(copilotOfferFor({ superAdmin: true })).toBeUndefined();
    expect(copilotOfferFor({ superAdmin: false })).toBeUndefined();
    expect(copilotOfferFor(undefined)).toBeUndefined();
  });

  it('once un-parked, shows a Super-Admin the row to set AI up (AC-535)', () => {
    expect(copilotOfferFor({ superAdmin: true }, false)).toBe('setup');
    expect(copilotOfferFor({ superAdmin: false }, false)).toBeUndefined();
  });
});
