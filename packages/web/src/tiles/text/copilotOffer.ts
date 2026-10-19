import type { CopilotOffer } from './InsertMenu';

/**
 * AI summaries (F47) and Security › AI (F48) are parked (the user,
 * 2026-10-18; commit 200a3f22). While they are, the insert menu lists no
 * Copilot group for anyone: the page a Super-Admin's disabled row points at
 * doesn't exist this phase. Un-parking is this one line.
 */
export const AI_PARKED = true;

/**
 * The insert menu's Copilot group for who is signed in (AC-535; decision
 * T881-1): AI isn't set up in wechart (AC-547), so a Super-Admin sees
 * Summarize… disabled with where to set it up, and anyone else no group —
 * and while AI is parked, nobody sees any.
 */
export function copilotOfferFor(
  me: { readonly superAdmin: boolean } | undefined,
  parked: boolean = AI_PARKED,
): CopilotOffer {
  if (parked) return undefined;
  return me?.superAdmin === true ? 'setup' : undefined;
}
