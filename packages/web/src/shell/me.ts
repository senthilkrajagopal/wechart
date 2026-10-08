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

/**
 * Whether the user has a workspace, so may create and edit at all (T343,
 * AC-276, AC-277; T760): the single user with sign-in off, a Super-Admin,
 * and a read-write member of some folder. A user read-only everywhere has
 * none, and is offered no action that creates or edits.
 */
export function hasWorkspace(me: Me): boolean {
  return me.security === 'off' || me.superAdmin || me.readWrite === true;
}

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
