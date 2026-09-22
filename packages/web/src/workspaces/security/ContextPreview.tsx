import { useEffect, useId, useState } from 'react';

import { wechartClaimIn } from '../../query/securityPreview';
import { StatusIcon } from '../../shell/StatusIcon';

type Read = { context: Record<string, unknown> } | { problem: string };

/** The text in the context field, as a context to preview or why it is not one. */
export function readContext(text: string): Read {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return { problem: `Not JSON: ${error instanceof Error ? error.message : String(error)}` };
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
    return { problem: 'A security context is a JSON object.' };
  const context = parsed as Record<string, unknown>;
  // Refused rather than dropped, so the context the banner names is the one
  // that runs.
  const reserved = wechartClaimIn(context);
  if (reserved !== undefined)
    return { problem: `wechart sets ${reserved} itself when it signs the token: remove it.` };
  // Cube is handed `groups` only when it is a list of names (infra/cube/
  // cube.js, `contextToGroups`); anything else would silently be no groups.
  const groups = context['groups'];
  if (
    groups !== undefined &&
    !(Array.isArray(groups) && groups.every((group) => typeof group === 'string'))
  )
    return { problem: 'groups is a list of group names, such as ["sales"].' };
  return { context };
}

/** A dashboard, opened as the context would see it (the route's `preview`). */
export function previewHref(dashboardId: string, context: Readonly<Record<string, unknown>>) {
  return `/explore/dashboards/${encodeURIComponent(dashboardId)}?preview=${encodeURIComponent(
    JSON.stringify(context),
  )}`;
}

interface Found {
  readonly kind: string;
  readonly id: string;
  readonly title: string;
}

/** Dashboards whose titles hold what was typed, from the catalog's search. */
function useDashboards(text: string): readonly Found[] {
  const needle = text.trim();
  // Kept with the text they answer, so an answer to older text never shows.
  const [found, setFound] = useState<{ needle: string; items: readonly Found[] }>({
    needle: '',
    items: [],
  });
  useEffect(() => {
    if (needle === '') return undefined;
    const aborted = new AbortController();
    const timer = setTimeout(() => {
      void fetch(`/api/search?q=${encodeURIComponent(needle)}`, { signal: aborted.signal })
        .then(async (response) => (response.ok ? ((await response.json()) as Found[]) : []))
        .then((items) => {
          setFound({ needle, items: items.filter((item) => item.kind === 'dashboard') });
        })
        .catch(() => undefined);
    }, 150);
    return () => {
      clearTimeout(timer);
      aborted.abort();
    };
  }, [needle]);
  return found.needle === needle && needle !== '' ? found.items : [];
}

/**
 * The Security workspace's context preview (T172, AC-166), the prototype's
 * "Preview a security context" pane: a security context written as JSON —
 * the claims wechart signs into Cube's token in place of its own — and the
 * dashboards to open under it. The dashboard runs every query as that
 * context, under a banner naming it, until the preview is left.
 */
export function ContextPreview({ groups }: { groups: readonly string[] }) {
  const [text, setText] = useState('{}');
  const [search, setSearch] = useState('');
  const read = readContext(text);
  const found = useDashboards(search);
  const ids = { context: useId(), note: useId(), find: useId() };
  const named = groups.filter((group) => group !== '*');

  return (
    <section className="context-preview" aria-label="Preview a security context">
      <h2>Preview a security context</h2>
      <div className="field">
        <label htmlFor={ids.context}>Security context (JSON)</label>
        <textarea
          id={ids.context}
          rows={6}
          spellCheck={false}
          value={text}
          aria-invalid={'problem' in read}
          aria-describedby={ids.note}
          onChange={(event) => setText(event.target.value)}
        />
        {'problem' in read ? (
          <span id={ids.note} className="context-preview__problem">
            {/* A validation, with its icon (T183, AC-177). */}
            <StatusIcon kind="err" />
            {read.problem}
          </span>
        ) : (
          <span id={ids.note} className="context-preview__note">
            Cube reads <code>groups</code> to decide which policies apply.
            {named.length === 0 ? null : <> The policies name: {named.join(', ')}.</>}
          </span>
        )}
      </div>
      <div className="field">
        <label htmlFor={ids.find}>Find a dashboard</label>
        <input
          id={ids.find}
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>
      {'problem' in read || found.length === 0 ? null : (
        <ul className="context-preview__found">
          {found.map((dashboard) => (
            <li key={dashboard.id}>
              <a href={previewHref(dashboard.id, read.context)}>Preview {dashboard.title}</a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
