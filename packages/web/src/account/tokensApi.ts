/**
 * The user's own personal access tokens, as the API answers them (T767,
 * T768; AC-430, AC-431): never any part of a token's text, except the one
 * answer that makes it.
 */
export type TokenScope = 'read' | 'workspace-edit' | 'proposals-and-jobs';

/** The three scopes in the page's order, as design 18 names them (AC-469). */
export const SCOPES: readonly { readonly id: TokenScope; readonly label: string }[] = [
  { id: 'read', label: 'Read' },
  { id: 'workspace-edit', label: 'Workspace edit' },
  { id: 'proposals-and-jobs', label: 'Proposals and jobs' },
];

/** The expiries a token may have, in days, 30 chosen at the start (AC-468). */
export const TOKEN_DAYS = [7, 30, 90] as const;
export type TokenDays = (typeof TOKEN_DAYS)[number];
export const DEFAULT_DAYS: TokenDays = 30;
/** A token's name's limit, in characters (AC-430; design 18's Q2). */
export const TOKEN_NAME_LIMIT = 100;

export interface AccessToken {
  readonly id: string;
  readonly name: string;
  readonly scopes: readonly TokenScope[];
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly lastUsedAt: string | null;
}

/** A token under "No longer working" (T768, AC-431). */
export interface StoppedToken extends AccessToken {
  readonly state: 'revoked' | 'expired';
  readonly stoppedAt: string;
  readonly revokedBy: { readonly name: string } | null;
}

export interface TokenList {
  readonly tokens: readonly AccessToken[];
  readonly stopped: readonly StoppedToken[];
}

/** A token just made: the one answer that holds its text (AC-430). */
export interface MadeToken {
  readonly token: AccessToken;
  readonly text: string;
}

export const TOKENS_QUERY = {
  queryKey: ['access-tokens'] as const,
  queryFn: async ({ signal }: { signal?: AbortSignal }): Promise<TokenList> => {
    const response = await fetch('/api/account/tokens', signal === undefined ? {} : { signal });
    if (!response.ok) throw new Error('Your tokens couldn’t be read.');
    const list = (await response.json()) as Partial<TokenList>;
    return { tokens: list.tokens ?? [], stopped: list.stopped ?? [] };
  },
};

/** Sends one change to a token; a refusal throws with the API's reason, or `fallback`. */
async function act(url: string, method: 'DELETE' | 'POST', fallback: string): Promise<void> {
  let response: Response;
  try {
    response = await fetch(url, { method });
  } catch {
    throw new Error(`${fallback}: wechart didn’t answer.`);
  }
  if (response.ok) return;
  const answer = (await response.json().catch(() => null)) as { error?: string } | null;
  throw new Error(answer?.error ?? `${fallback} (${String(response.status)}).`);
}

/** Revokes one of the user's own tokens (T768, T771; AC-431). */
export const revokeToken = (id: string) =>
  act(`/api/account/tokens/${encodeURIComponent(id)}`, 'DELETE', 'The token wasn’t revoked');

/** Takes a stopped token off "No longer working"; its audit record stays (AC-431). */
export const removeToken = (id: string) =>
  act(`/api/account/tokens/${encodeURIComponent(id)}/remove`, 'POST', 'The token wasn’t removed');

/** Makes a token; a refusal throws with the API's reason. */
export async function makeToken(asked: {
  readonly name: string;
  readonly scopes: readonly TokenScope[];
  readonly days: TokenDays;
}): Promise<MadeToken> {
  let response: Response;
  try {
    response = await fetch('/api/account/tokens', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(asked),
    });
  } catch {
    // Design 18, B3.
    throw new Error('The token wasn’t made: wechart didn’t answer. Nothing was kept.');
  }
  const answer = (await response.json().catch(() => null)) as
    (Partial<MadeToken> & { error?: string }) | null;
  if (!response.ok || answer?.token === undefined || typeof answer.text !== 'string')
    throw new Error(
      answer?.error ?? `The token wasn’t made (${String(response.status)}). Nothing was kept.`,
    );
  return { token: answer.token, text: answer.text };
}
