import { createContext } from 'react';

/**
 * The security context a dashboard is being previewed as (T172, AC-166), for
 * the queries asked deep inside it — a filter's own values — without passing
 * it through every widget between. Undefined: no preview, wechart's own.
 */
export const SecurityPreview = createContext<Readonly<Record<string, unknown>> | undefined>(
  undefined,
);

/**
 * The claims wechart sets in the token it signs, which a previewed context
 * cannot: its own `wechart…` keys (which model Cube compiles), and the claims
 * that say whether the token is valid. The API drops them too
 * (`previewClaimsOf` in the API's `cube/client.ts`); the two lists agree.
 */
const TOKEN_CLAIMS = new Set(['iat', 'exp', 'nbf', 'iss', 'aud']);

/** The first claim in a context that wechart sets itself, if any. */
export function wechartClaimIn(context: Readonly<Record<string, unknown>>): string | undefined {
  return Object.keys(context).find((key) => key.startsWith('wechart') || TOKEN_CLAIMS.has(key));
}

/**
 * A previewed context as it runs: an object's claims, less those wechart sets
 * itself — so a preview arriving by its address, not through the Security
 * workspace, is named by its banner as it is asked. Undefined when it is not
 * an object.
 */
export function previewClaimsOf(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(
      ([key]) => !key.startsWith('wechart') && !TOKEN_CLAIMS.has(key),
    ),
  );
}
