import { Fragment, useEffect, useId, useState } from 'react';

import { wechartClaimIn } from '../../query/securityPreview';
import { StateLine, StatusIcon } from '../../shell/StatusIcon';
import { effectiveAccess, type Access, type AccessModel } from './policies';

const NO_MODEL: AccessModel = { declared: [], open: [], reaches: {} };

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

/** How many dashboards the preview offers at once (AC-232): a bounded list. */
const DASHBOARD_LIMIT = 8;

/** Where the edited context is kept for the session (AC-232). */
const CONTEXT_KEY = 'wechart.security.context';

function storedContext(): string {
  try {
    return window.sessionStorage.getItem(CONTEXT_KEY) ?? '{}';
  } catch {
    // Storage refused: the context lasts as long as the page.
    return '{}';
  }
}

function keepContext(text: string) {
  try {
    window.sessionStorage.setItem(CONTEXT_KEY, text);
  } catch {
    // As above: nothing to keep it in.
  }
}

/**
 * The dashboards whose titles hold what was typed, from the catalog's search
 * of dashboards alone — one more than are shown, so whether more match is
 * known rather than guessed — and whether the search has been answered, or
 * failed.
 */
function useDashboards(text: string): {
  readonly items: readonly Found[];
  readonly answered: boolean;
  readonly failed?: string;
} {
  const needle = text.trim();
  // Kept with the text they answer, so an answer to older text never shows.
  const [found, setFound] = useState<{
    needle: string;
    items: readonly Found[];
    failed?: string;
  }>({ needle: '', items: [] });
  useEffect(() => {
    if (needle === '') return undefined;
    const aborted = new AbortController();
    const timer = setTimeout(() => {
      const url = `/api/search?q=${encodeURIComponent(needle)}&kind=dashboard&limit=${String(DASHBOARD_LIMIT + 1)}`;
      void fetch(url, { signal: aborted.signal })
        .then(async (response) => {
          if (!response.ok) {
            setFound({ needle, items: [], failed: `HTTP ${String(response.status)}` });
            return;
          }
          const items = (await response.json()) as Found[];
          setFound({ needle, items: items.filter((item) => item.kind === 'dashboard') });
        })
        .catch(() => undefined);
    }, 150);
    return () => {
      clearTimeout(timer);
      aborted.abort();
    };
  }, [needle]);
  const answered = found.needle === needle && needle !== '';
  return {
    items: answered ? found.items : [],
    answered,
    ...(answered && found.failed !== undefined ? { failed: found.failed } : {}),
  };
}

const VERDICTS: Record<Access['access'], { icon: 'ok' | 'warn' | 'err'; said: string }> = {
  full: { icon: 'ok', said: 'Everything' },
  limited: { icon: 'warn', said: 'Some members or rows' },
  denied: { icon: 'err', said: 'Nothing' },
  // Neither a yes nor a no: a condition only Cube can read decides it.
  unknown: { icon: 'warn', said: 'Cube decides' },
};

/**
 * The Security workspace's context preview (T172, AC-166), the prototype's
 * "Preview a security context" pane: a security context written as JSON —
 * the claims wechart signs into Cube's token in place of its own — and the
 * dashboards to open under it. The dashboard runs every query as that
 * context, under a banner naming it, until the preview is left.
 */
export function ContextPreview({
  groups,
  model = NO_MODEL,
  unread = [],
}: {
  groups: readonly string[];
  /**
   * The model's policies, each with its file, the cubes and views no policy
   * governs, and the cubes each view reaches (AC-232).
   */
  model?: AccessModel;
  /** The model files not read here, whose cubes and views cannot be listed. */
  unread?: readonly string[];
}) {
  // Kept for the session, so coming back from a preview finds it as it was
  // left (AC-232).
  const [text, setTextState] = useState(storedContext);
  const setText = (next: string) => {
    setTextState(next);
    keepContext(next);
  };
  const [search, setSearch] = useState('');
  const read = readContext(text);
  const found = useDashboards(search);
  const ids = { context: useId(), note: useId(), find: useId() };
  const named = groups.filter((group) => group !== '*');
  // Evaluated against the whole context: its groups, and its claims for any
  // policy's conditions.
  const access = 'problem' in read ? [] : effectiveAccess(model, read.context);
  const shown = found.items.slice(0, DASHBOARD_LIMIT);

  return (
    <section className="context-preview admin-pane" aria-label="Preview a security context">
      <h2>Preview a security context</h2>
      {/* A context for each group the policies name, to start from (AC-232). */}
      <div className="context-preview__presets" role="group" aria-label="Preset contexts">
        <button type="button" className="btn-sm" onClick={() => setText('{}')}>
          No groups
        </button>
        {named.map((group) => (
          <button
            key={group}
            type="button"
            className="btn-sm"
            onClick={() => setText(JSON.stringify({ groups: [group] }, null, 2))}
          >
            {group}
          </button>
        ))}
      </div>
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
      {/* What this context gets from each cube and view, and why (AC-232). */}
      {'problem' in read ? null : (
        <section className="context-preview__access" aria-label="Effective access">
          <h3>What this context can read</h3>
          <ul>
            {access.map((each) => (
              <li key={each.object} data-testid={`access-${each.object}`}>
                <StatusIcon kind={VERDICTS[each.access].icon} />
                <span className="context-preview__object">{each.object}</span>{' '}
                <span className="context-preview__verdict">{VERDICTS[each.access].said}</span>{' '}
                <span className="context-preview__why">{each.why}</span>
                {each.paths.map((path) => (
                  // Spaced, so a reader hears each as its own words.
                  <Fragment key={path}>
                    {' '}
                    <a className="context-preview__source" href={modelHref(path)}>
                      {path}
                    </a>
                  </Fragment>
                ))}
              </li>
            ))}
          </ul>
          {unread.length === 0 ? null : (
            // Said, so a cube missing from the list is not read as open.
            <p className="context-preview__note">
              Not read here: {unread.join('; ')}. Cubes and views defined there are not listed.
            </p>
          )}
        </section>
      )}
      <div className="field">
        <label htmlFor={ids.find}>Find a dashboard</label>
        <input
          id={ids.find}
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>
      {'problem' in read || !found.answered ? null : found.failed !== undefined ? (
        // A failure said as one, not as "nothing matched".
        <StateLine kind="err">The search failed ({found.failed}).</StateLine>
      ) : found.items.length === 0 ? (
        // Said, not left empty (AC-232).
        <p className="context-preview__note" data-testid="preview-no-match">
          No dashboard matches “{search.trim()}”.
        </p>
      ) : (
        <>
          <ul className="context-preview__found">
            {shown.map((dashboard) => (
              <li key={dashboard.id}>
                <a href={previewHref(dashboard.id, read.context)}>Preview {dashboard.title}</a>
              </li>
            ))}
          </ul>
          {found.items.length > DASHBOARD_LIMIT ? (
            <p className="context-preview__note">More dashboards match: narrow the search.</p>
          ) : null}
        </>
      )}
    </section>
  );
}

/** A model file, opened in the Model workspace (AC-232). */
export function modelHref(path: string): string {
  return `/model/files/${encodeURIComponent(path)}`;
}
