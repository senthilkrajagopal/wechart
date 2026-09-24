import type { MarkingPredicate } from './predicate';

/**
 * Whether a marking applies to a tile (AC-103).
 *
 * A marking is dashboard-wide; a tile queries one cube or view. When the
 * marking names a member the tile cannot reach — no join path to it — the tile
 * is *not linked* to that marking, and says so.
 *
 * **Checked before a query is sent, not after one fails.** Both of the
 * criterion's failing states are about what the user is told. A query error
 * blames them for something they did not do: the marking is fine, the tile is
 * fine, they simply do not meet. And silence is worse — a tile sitting
 * unbrushed among brushed ones looks like a tile with nothing marked in it,
 * which is a different and wrong answer.
 *
 * **Where the member list comes from, and one caveat.** The caller supplies
 * the members this tile can resolve, from the cube or view's meta and, for
 * join-path questions, `/v1/dry-run`. `docs/research/cube/access-control.md`
 * records that dry-run returns "the normalized queries from *before* RLS and
 * `queryRewrite`" — so a member that a security context would hide still looks
 * resolvable here. That is acceptable for *linking* (the question is whether a
 * join path exists), but it means this must never be read as an authorisation
 * check.
 */
export type Applicability =
  | { readonly linked: true }
  | {
      readonly linked: false;
      /** The members this tile cannot reach, in the order they were named. */
      readonly missing: readonly string[];
      /** What the tile says on itself. */
      readonly label: string;
    };

export function markingApplicability(
  predicate: MarkingPredicate,
  resolvableMembers: readonly string[],
  /** A member's title from the model, which the label names it by (AC-220). */
  titleOf?: (member: string) => string | undefined,
): Applicability {
  const wanted: string[] = [];

  const want = (member: string) => {
    // Named once however many marked items mention it: two marked items
    // needing the same missing join are one problem, not two.
    if (!wanted.includes(member)) wanted.push(member);
  };

  for (const item of predicate.items) for (const part of item) want(part.member);
  for (const range of predicate.ranges) want(range.member);

  const resolvable = new Set(resolvableMembers);
  const missing = wanted.filter((member) => !resolvable.has(member));

  /**
   * An empty marking lands here too, and correctly: it names no members, so
   * nothing is missing and the tile is linked. A separate early return for it
   * was written first and removed — mutation testing showed deleting it
   * changed nothing, because it was saying what this line already says.
   *
   * The behaviour still matters even though the branch does not: labelling
   * every tile on an untouched dashboard "not linked" would be the noisiest
   * possible reading of the rule, and there is a test holding it.
   */
  if (missing.length === 0) return { linked: true };

  return {
    linked: false,
    missing,
    label: `Not linked to this marking: this tile cannot reach ${missing
      .map((member) => titleOf?.(member) ?? member)
      .join(', ')}.`,
  };
}
