import { useRouter, useRouterState } from '@tanstack/react-router';
import { useState } from 'react';

import { SqlWorkspace } from './SqlWorkspace';

/**
 * The workspace at its address (T801, AC-446; design 17, state A): `/sql`
 * names the open tab, `?tab=…`, so a reload opens that tab with its data
 * source and text. Opening another tab replaces the address rather than
 * adding to history, so Back leaves the workspace (lane SQL's call). The
 * address is read once, as the workspace opens.
 */
export function SqlSurface() {
  const router = useRouter();
  const searched = useRouterState({ select: (state) => state.location.searchStr });
  const [asked] = useState(() => new URLSearchParams(searched).get('tab') ?? undefined);
  return (
    <SqlWorkspace
      tab={asked}
      onOpenTab={(id) => {
        if (router.state.location.pathname !== '/sql') return;
        router.history.replace(`/sql?tab=${encodeURIComponent(id)}`);
      }}
    />
  );
}
