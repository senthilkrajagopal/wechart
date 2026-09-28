import type { Me } from './AccountMenu';

/**
 * Who is signed in, one query every reader shares (T500's review): the
 * gate that asks as the page loads fills it, so the bar and the pages know
 * at once. A failed answer is an error, never an empty "who".
 */
export const ME_QUERY = {
  queryKey: ['me'] as const,
  queryFn: async ({ signal }: { signal?: AbortSignal }): Promise<Me> => {
    const response = await fetch('/api/me', signal === undefined ? {} : { signal });
    if (!response.ok)
      throw new Error(`Who is signed in could not be read (${String(response.status)}).`);
    const me = (await response.json()) as unknown;
    if (!isMe(me)) throw new Error('Who is signed in could not be read.');
    return me;
  },
};

/** An answer from `/api/me` that says who and in which mode. */
export function isMe(value: unknown): value is Me {
  const me = value as Partial<Me> | null;
  return (
    typeof me === 'object' &&
    me !== null &&
    typeof me.name === 'string' &&
    (me.security === 'off' || me.security === 'oidc')
  );
}
