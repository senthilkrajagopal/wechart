import { useQuery } from '@tanstack/react-query';
import { Fragment, useId, useRef, useState } from 'react';

import { StateLine } from '../../shell/StatusIcon';
import { DASHBOARD_LIMIT, modelHref, previewHref, useDashboards } from './ContextPreview';
import { AccessIcon } from '../explore/AccessChip';
import { effectiveAccess, type Access, type AccessModel } from './policies';

const NO_MODEL: AccessModel = { declared: [], open: [], reaches: {} };

/** Where the chosen groups are kept for the session (AC-232), as the JSON editor's context was. */
const GROUPS_KEY = 'wechart.security.groups';

function storedGroups(): string[] {
  try {
    const kept = JSON.parse(window.sessionStorage.getItem(GROUPS_KEY) ?? '[]') as unknown;
    return Array.isArray(kept)
      ? kept.filter((each): each is string => typeof each === 'string')
      : [];
  } catch {
    // Storage refused, or not ours: the groups last as long as the page.
    return [];
  }
}

function keepGroups(groups: readonly string[]) {
  try {
    window.sessionStorage.setItem(GROUPS_KEY, JSON.stringify(groups));
  } catch {
    // As above: nothing to keep them in.
  }
}

interface Reached {
  readonly id: string;
  readonly path: readonly string[];
  readonly reach: 'write' | 'view' | 'above';
  readonly kinds: 'all' | 'dashboards';
}

/**
 * How a folder is reached, as design 08 says it. A folder above a grant is
 * seen view only: every item above a read-write grant, its dashboards alone
 * above a read-only one (AC-262, AC-263; T438's review).
 */
const reachOf = (folder: Reached) =>
  folder.reach === 'write'
    ? 'read-write'
    : folder.reach === 'above' && folder.kinds === 'dashboards'
      ? 'its dashboards, view only'
      : 'view only';

/** What a cube or view gives them, mid-line as design 08 says it ("orders · everything"). */
const GIVES: Record<Access['access'], string> = {
  full: 'everything',
  limited: 'some members or rows',
  denied: 'nothing',
  unknown: 'Cube decides',
};

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${String(response.status)}`);
  return (await response.json()) as T;
}

/**
 * Preview as groups (T438, AC-166; design 08 of 2026-09-27, state E), with
 * sign-in on: one or more AD groups, chosen as chips from the picker the
 * Access panel has; what they reach, each folder by its path and how, as the
 * folder check reckons it; what the model's policies give them; then a
 * dashboard to open as exactly those groups, under a banner naming them.
 * This replaces the JSON editor and "Find a dashboard", which sign-in off
 * keeps.
 */
export function GroupsPreview({
  model = NO_MODEL,
  unread = [],
  policyGroups = [],
}: {
  /** The model's policies, each with its file, and the cubes and views no policy governs. */
  model?: AccessModel;
  /** The groups the policies name, offered as presets (AC-232). */
  policyGroups?: readonly string[];
  /** The model files not read here, whose cubes and views cannot be listed. */
  unread?: readonly string[];
}) {
  const [groups, setGroupsState] = useState<string[]>(storedGroups);
  const setGroups = (next: string[]) => {
    setGroupsState(next);
    keepGroups(next);
  };
  const [typed, setTyped] = useState('');
  const [search, setSearch] = useState('');
  const ids = { group: useId(), find: useId() };

  // The groups set on folders, to pick from (as the Access panel suggests them).
  const known = useQuery({
    queryKey: ['access-known-groups'],
    queryFn: () => getJson<{ groups: string[] }>('/api/access/known-groups'),
  });
  const reach = useQuery({
    queryKey: ['access-reach', groups],
    // Each group its own parameter, so a comma in a name never splits it (T438's review).
    queryFn: () =>
      getJson<{ folders: Reached[] }>(
        `/api/access/reach?${groups.map((group) => `groups=${encodeURIComponent(group)}`).join('&')}`,
      ),
    enabled: groups.length > 0,
  });
  // The groups the policies name, offered as presets (AC-232), and the
  // folders' groups, suggested as the Access panel suggests them.
  const presets = policyGroups.filter((group) => group !== '*' && !groups.includes(group));
  const suggested = [...new Set([...(known.data?.groups ?? []), ...policyGroups])].filter(
    (group) => group !== '*' && !groups.includes(group),
  );
  const picker = useRef<HTMLInputElement>(null);
  const chipsList = useRef<HTMLUListElement>(null);
  const found = useDashboards(search);
  const context = { groups };
  const access = groups.length === 0 ? [] : effectiveAccess(model, context);
  const shown = found.items.slice(0, DASHBOARD_LIMIT);

  const add = (named = typed.trim()) => {
    if (named !== '' && !groups.includes(named)) setGroups([...groups, named]);
    setTyped('');
  };
  /** Removed, with focus to the chip that takes its place, else the picker (T438's review). */
  const remove = (group: string, at: number) => {
    setGroups(groups.filter((each) => each !== group));
    requestAnimationFrame(() => {
      const left = chipsList.current?.querySelectorAll<HTMLButtonElement>('button') ?? [];
      (left[Math.min(at, left.length - 1)] ?? picker.current)?.focus();
    });
  };

  return (
    // Straight on its sections, as state E draws it: the tab names it already (T699, SEC-27).
    <section className="groups-preview admin-pane" aria-label="Preview as groups">
      {/* Groups, as chips, and the picker (state E). */}
      <div className="groups-preview__groups">
        <h3 id={`${ids.group}-heading`}>Groups</h3>
        {groups.length === 0 ? null : (
          <ul
            aria-labelledby={`${ids.group}-heading`}
            className="groups-preview__chips"
            ref={chipsList}
          >
            {groups.map((group, at) => (
              <li key={group} className="filter-chip">
                <code>{group}</code>
                <button
                  type="button"
                  className="filter-chip__remove"
                  aria-label={`Remove ${group}`}
                  onClick={() => remove(group, at)}
                >
                  <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
                    <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        )}
        <form
          className="access-picker"
          onSubmit={(event) => {
            event.preventDefault();
            add();
          }}
        >
          <label htmlFor={ids.group}>AD group</label>
          {/* With its list of suggestions, a combobox. */}
          <input
            id={ids.group}
            ref={picker}
            list={`${ids.group}-suggestions`}
            value={typed}
            autoComplete="off"
            onChange={(event) => setTyped(event.target.value)}
            // Enter adds it: WebKit doesn't submit a form from an input with a
            // list of suggestions (T438's e2e in Safari).
            onKeyDown={(event) => {
              if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
              event.preventDefault();
              add();
            }}
          />
          <datalist id={`${ids.group}-suggestions`}>
            {suggested.map((group) => (
              <option key={group} value={group} />
            ))}
          </datalist>
          <button type="submit" className="btn btn-sm" disabled={typed.trim() === ''}>
            Add
          </button>
        </form>
        {/* A preset for each group the policies name (AC-232). */}
        {presets.length === 0 ? null : (
          <div
            className="context-preview__presets"
            role="group"
            aria-label="Groups the policies name"
          >
            {presets.map((group) => (
              <button key={group} type="button" className="btn-sm" onClick={() => add(group)}>
                {group}
              </button>
            ))}
          </div>
        )}
      </div>

      {/*
        What these groups reach, in one list as design 08 draws it (state E;
        T630): the folders the folder check lets them into, by path and how,
        those granted first, each with its eye or pencil, then those seen from
        above; then what the model's own policies give them within that
        (AC-232). Said as it changes (T438's review).
      */}
      <section
        className="groups-preview__reach context-preview__access"
        aria-labelledby={`${ids.group}-reach`}
        aria-live="polite"
      >
        <h3 id={`${ids.group}-reach`}>What these groups reach</h3>
        {groups.length === 0 ? (
          <p className="context-preview__note">Choose one or more AD groups to preview as.</p>
        ) : (
          <>
            {reach.isError ? (
              <StateLine kind="err">
                What they reach couldn’t be read ({reach.error.message}).
              </StateLine>
            ) : reach.data === undefined ? (
              <p className="context-preview__note">Reading what they reach…</p>
            ) : reach.data.folders.length === 0 ? (
              <p className="context-preview__note">These groups reach no folder.</p>
            ) : null}
            {(reach.data?.folders.length ?? 0) === 0 && access.length === 0 ? null : (
              <ul aria-label="What these groups reach">
                {[
                  ...(reach.data?.folders ?? []).filter((folder) => folder.reach !== 'above'),
                  ...(reach.data?.folders ?? []).filter((folder) => folder.reach === 'above'),
                ].map((folder) =>
                  folder.reach === 'above' ? (
                    <li key={folder.id} className="groups-preview__above">
                      {folder.path.join(' / ')} (above) · {reachOf(folder)}
                    </li>
                  ) : (
                    <li key={folder.id}>
                      <AccessIcon name={folder.reach === 'write' ? 'pencil' : 'eye'} />
                      {folder.path.join(' / ')} · {reachOf(folder)}
                    </li>
                  ),
                )}
                {access.map((each, at) => (
                  <li
                    key={each.object}
                    data-testid={`access-${each.object}`}
                    className={at === 0 ? 'groups-preview__first-object' : undefined}
                  >
                    {/* On one line, as drawn, the name in bold and no icon: "**orders** ·
                        everything · no policy" (state E; T699, SEC-27). */}
                    <span>
                      <b className="context-preview__object">{each.object}</b> ·{' '}
                      <span className="context-preview__verdict">{GIVES[each.access]}</span> ·{' '}
                      <span className="groups-preview__why">{each.why}</span>
                      {each.paths.map((path) => (
                        <Fragment key={path}>
                          {' · '}
                          <a className="context-preview__source" href={modelHref(path)}>
                            {path}
                          </a>
                        </Fragment>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {unread.length === 0 ? null : (
              <p className="context-preview__note">
                Not read here: {unread.join('; ')}. Cubes and views defined there are not listed.
              </p>
            )}
          </>
        )}
      </section>

      {/* The dashboard to open as them, a section as state E heads it (SEC-27). */}
      <div className="field groups-preview__dashboard">
        <h3>
          <label htmlFor={ids.find}>Dashboard to preview</label>
        </h3>
        <input
          id={ids.find}
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>
      {!found.answered ? null : groups.length === 0 ? (
        // As one or more groups, never none (AC-166; T438's review).
        <p className="context-preview__note">Choose a group first, to preview a dashboard as it.</p>
      ) : found.failed !== undefined ? (
        <StateLine kind="err">The search failed ({found.failed}).</StateLine>
      ) : found.items.length === 0 ? (
        <p className="context-preview__note">No dashboard matches “{search.trim()}”.</p>
      ) : (
        <>
          <ul className="context-preview__found">
            {shown.map((dashboard) => (
              <li key={dashboard.id}>
                <a href={previewHref(dashboard.id, context)}>Preview {dashboard.title}</a>
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
