import { limitFilterFor, type MarkingPredicate, type TextToken } from '@wechart/core';

/**
 * What a text tile's measure token asks Cube (T389, AC-116). The tokens
 * themselves are read in core (`textPartsOf`), where the API reads them too.
 */
export type { TextToken };

/**
 * The measure alone, limited to its marking's rows by the same filter a
 * marking-limited tile takes — none while the marking holds nothing, or every
 * row (`limitFilterFor`) — and under the dashboard's own filters, as the
 * prototype's tokens are (`filters`, T389's review).
 */
export function measureQueryOf(
  token: Extract<TextToken, { kind: 'measure' }>,
  marking: MarkingPredicate | undefined,
): Record<string, unknown> {
  const limit = marking === undefined ? undefined : limitFilterFor([marking], 'all');
  return {
    measures: [token.member],
    ...(limit === undefined ? {} : { filters: [limit] }),
  };
}
