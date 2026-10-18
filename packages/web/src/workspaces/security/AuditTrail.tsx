import { useQuery } from '@tanstack/react-query';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

import { clockOf, exactOf, utcOf, whenOf as momentOf } from '../../shell/formatTime';
import { StateLine } from '../../shell/StatusIcon';
import { TableScroll } from '../../shell/TableScroll';
import { FOLDERS_QUERY, targetPathOf } from '../explore/folders';

/**
 * The audit trail (T369, AC-295; design 08 of 2026-09-27, pins 2–9 and
 * states A–C): the Super-Admin's record of every sign-in, access change,
 * proposal, approval, rejection, restore and data-source change. Four
 * filters that combine, shown as chips; local time to the second, UTC on
 * hover; each event as icon and label; newest first, always, a page at a
 * time; the full record in the inspector; the retention said.
 */
export const EVENTS = [
  ['sign-in', 'Sign-in'],
  ['access-change', 'Access change'],
  ['proposal', 'Proposal'],
  ['approval', 'Approval'],
  ['rejection', 'Rejection'],
  ['restore', 'Restore'],
  ['data-source-change', 'Data-source change'],
  // A publish the check refused, with every break (T427, AC-322; state B).
  ['publish-refused', 'Publish refused'],
  // A SQL run, its literals replaced (T534, AC-382; design 15, state J).
  ['sql-run', 'SQL run'],
  // Builds started from Jobs, cancels, and wechart schedules' changes (T505,
  // AC-294; design 16, state I).
  ['build-started', 'Build started'],
  ['build-cancelled', 'Build cancelled'],
  ['schedule-change', 'Schedule change'],
  // A personal access token made or revoked (T767, T768, AC-442; design 18, state I).
  ['token-made', 'Token made'],
  ['token-revoked', 'Token revoked'],
  // Every MCP tool call, reads included (T781, AC-478; design 18, state I).
  ['mcp-call', 'MCP call'],
] as const;
export type AuditEvent = (typeof EVENTS)[number][0];
const EVENT_LABEL = Object.fromEntries(EVENTS) as Record<AuditEvent, string>;

/** In design 08's order (pin 2; T699, SEC-08); All stays the default. */
const TIMES = [
  ['day', 'Last 24 hours'],
  ['week', 'Last 7 days'],
  ['month', 'Last 30 days'],
  ['all', 'All'],
  ['custom', 'Custom'],
] as const;
export type AuditTime = (typeof TIMES)[number][0];
const TIME_LABEL = Object.fromEntries(TIMES) as Record<AuditTime, string>;
const TIME_SPAN: Partial<Record<AuditTime, number>> = {
  day: 86_400_000,
  week: 7 * 86_400_000,
  month: 30 * 86_400_000,
};

/** What the trail is filtered by: each part the page's address holds (pin 1). */
export interface AuditFilters {
  readonly user?: string | undefined;
  readonly events: readonly AuditEvent[];
  readonly folder?: string | undefined;
  readonly subfolders: boolean;
  readonly time: AuditTime;
  /** A custom range's ends, as `datetime-local` gives them. */
  readonly since?: string | undefined;
  readonly until?: string | undefined;
}
export const NO_FILTERS: AuditFilters = { events: [], subfolders: false, time: 'all' };

/**
 * The filters as the page's address holds them, so a filtered trail can be
 * linked and reloaded (pin 1): `/security/audit?user=&event=&folder=…`.
 */
export function auditSearchOf(filters: AuditFilters): string {
  const search = new URLSearchParams();
  if (filters.user !== undefined) search.set('user', filters.user);
  if (filters.events.length > 0) search.set('event', filters.events.join(','));
  if (filters.folder !== undefined) {
    search.set('folder', filters.folder);
    if (filters.subfolders) search.set('subfolders', '1');
  }
  if (filters.time !== 'all') search.set('time', filters.time);
  if (filters.time === 'custom') {
    if (filters.since) search.set('since', filters.since);
    if (filters.until) search.set('until', filters.until);
  }
  return search.toString();
}

/** An address's filters: what it doesn't know is left out, never guessed. */
export function auditFiltersFrom(search: URLSearchParams): AuditFilters {
  // Each kind once, in the picker's order (T369's review).
  const asked = new Set((search.get('event') ?? '').split(','));
  const events = EVENTS.map(([event]) => event).filter((event) => asked.has(event));
  const time = TIMES.some(([value]) => value === search.get('time'))
    ? (search.get('time') as AuditTime)
    : 'all';
  const folder = search.get('folder') || undefined;
  // A custom end that isn't a time is left out, never asked (T369's review).
  const end = (name: 'since' | 'until') => {
    const value = search.get(name);
    return time === 'custom' && value && isoOf(value) !== undefined ? { [name]: value } : {};
  };
  return {
    ...(search.get('user') ? { user: search.get('user')! } : {}),
    events,
    ...(folder === undefined ? {} : { folder }),
    subfolders: folder !== undefined && search.get('subfolders') === '1',
    time,
    ...end('since'),
    ...end('until'),
  };
}

interface Person {
  readonly key: string;
  readonly name: string;
  readonly identity?: string;
}
interface Record_ {
  readonly id: string;
  readonly at: string;
  readonly actor: Person | null;
  readonly event: AuditEvent;
  readonly folderId: string | null;
  readonly folderPath: readonly { readonly id: string; readonly title: string }[] | null;
  /** In a workspace, at any depth: never drawn as if it were shared. */
  readonly inWorkspace?: true;
  readonly item: { readonly kind: string; readonly id: string; readonly title: string } | null;
  readonly summary: string;
  readonly details: Readonly<Record<string, unknown>> | null;
}
interface Page {
  readonly records: readonly Record_[];
  readonly next?: string;
  readonly total: number;
  readonly retentionDays: number;
}

const PAGE = 50;
const KIND_LABEL: Record<string, string> = {
  folder: 'Folder',
  dashboard: 'Dashboard',
  chart: 'Chart',
  model: 'Model',
  'data-source': 'Data source',
  'pre-aggregation': 'Pre-aggregation',
  schedule: 'Schedule',
  'access-token': 'Access token',
};

/** What was done to a wechart schedule, as its record's heading says it (design 16, I1). */
const SCHEDULE_CHANGES: Readonly<Record<string, string>> = {
  made: 'Made',
  changed: 'Changed',
  suspended: 'Suspended',
  // Paused by hand (T556, AC-396).
  paused: 'Paused',
  resumed: 'Resumed',
  deleted: 'Deleted',
};

/** Who, as the trail names them: the identity the provider sent, else the name. */
const who = (actor: Person | null) => (actor === null ? '—' : (actor.identity ?? actor.name));

/** A `datetime-local` value as the API's time, or none for one that isn't a time. */
const isoOf = (local: string | undefined): string | undefined => {
  if (local === undefined || local === '') return undefined;
  const at = new Date(local);
  return Number.isNaN(at.getTime()) ? undefined : at.toISOString();
};

/**
 * Where a relative range ("Last 7 days") begins: from now for the first
 * page, and for the pages after it the first page's, so each page asks the
 * same range (T369's review).
 */
const sinceOf = (filters: AuditFilters): string | undefined => {
  const span = TIME_SPAN[filters.time];
  if (span !== undefined) return new Date(Date.now() - span).toISOString();
  return filters.time === 'custom' ? isoOf(filters.since) : undefined;
};

/** The query a set of filters asks, a page at a time. */
function queryOf(filters: AuditFilters, after: string | undefined, since: string | undefined) {
  const query = new URLSearchParams();
  if (filters.user !== undefined) query.set('users', filters.user);
  if (filters.events.length > 0) query.set('events', filters.events.join(','));
  if (filters.folder !== undefined) {
    query.set('folder', filters.folder);
    if (filters.subfolders) query.set('subfolders', 'true');
  }
  if (since !== undefined) query.set('since', since);
  const until = filters.time === 'custom' ? isoOf(filters.until) : undefined;
  if (until !== undefined) query.set('until', until);
  query.set('limit', String(PAGE));
  if (after !== undefined) query.set('after', after);
  return query.toString();
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok)
    throw new Error(`The audit trail could not be read (${String(response.status)}).`);
  return (await response.json()) as T;
}

/**
 * "Today 15:02:11", "Yesterday 16:40:12", then "24 Sep 09:40:55" (pin 4),
 * never en-GB's "24 Sept"; its title the exact local time with UTC beside it
 * (T477; the coordinator's Q8, Q9).
 */
function whenOf(iso: string): { shown: string; utc: string; exact: string } {
  const at = new Date(iso);
  return {
    shown: momentOf(at, new Date(), { seconds: true }),
    utc: utcOf(at),
    exact: exactOf(at),
  };
}

/** "1 year", "2 years", "90 days": how long records are kept (pin 8). */
function periodOf(days: number): string {
  if (days % 365 === 0) return days === 365 ? '1 year' : `${String(days / 365)} years`;
  return days === 1 ? '1 day' : `${String(days)} days`;
}

/** Design 18's plug: an MCP call, and the MCP badge (state I). */
const PLUG = 'M5.5 1.8v3.4M10.5 1.8v3.4M3.8 5.2h8.4v2.6a4.2 4.2 0 0 1-8.4 0zM8 12v2.4';

/**
 * Each event's icon beside its label, never colour alone (pin 5, rule 3):
 * design 08's glyphs (its `i-*` symbols; T699, SEC-06), named by them, and
 * designs 15's and 16's for the kinds they add.
 */
const EVENT_ICONS: Record<AuditEvent, { name: string; paths: readonly string[]; width?: number }> =
  {
    'sign-in': {
      name: 'login',
      paths: ['M9 2.5h3.5a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H9M2 8h8M7 5l3 3-3 3'],
      width: 1.4,
    },
    'access-change': {
      name: 'lock',
      paths: [
        'M4.5 7h7a1.5 1.5 0 0 1 1.5 1.5v4a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 3 12.5v-4A1.5 1.5 0 0 1 4.5 7z',
        'M5.5 7V5a2.5 2.5 0 0 1 5 0v2',
      ],
    },
    proposal: { name: 'send', paths: ['M2 8l11-5-4 11-2-4.5z'], width: 1.4 },
    approval: { name: 'check', paths: ['M3 8.5l3 3 7-7'], width: 1.7 },
    rejection: {
      name: 'xo',
      paths: [
        'M8 1.8a6.2 6.2 0 1 0 0 12.4A6.2 6.2 0 0 0 8 1.8z',
        'M5.8 5.8l4.4 4.4M10.2 5.8l-4.4 4.4',
      ],
      width: 1.4,
    },
    restore: {
      name: 'hist',
      paths: ['M2.5 8a5.5 5.5 0 1 0 1.6-3.9M2.3 2.5v2.8h2.8', 'M8 5v3.2l2.2 1.4'],
      width: 1.4,
    },
    'data-source-change': {
      name: 'db',
      paths: [
        'M3 4c0-1.1 2.2-2 5-2s5 .9 5 2-2.2 2-5 2-5-.9-5-2z',
        'M3 4v8c0 1.1 2.2 2 5 2s5-.9 5-2V4M3 8c0 1.1 2.2 2 5 2s5-.9 5-2',
      ],
      width: 1.4,
    },
    'publish-refused': {
      name: 'refused',
      paths: ['M8 2a6 6 0 1 0 0 12A6 6 0 0 0 8 2zM3.8 3.8l8.4 8.4'],
    },
    // A terminal's prompt, as design 15 draws the SQL tab's.
    'sql-run': { name: 'sql', paths: ['M2.5 3.5h11v9h-11zM5 6.5 7 8l-2 1.5M8.5 10h2.5'] },
    // Design 16's: play, a struck circle, and a calendar (state I).
    'build-started': { name: 'play', paths: ['M5 3.2v9.6L12.6 8z'] },
    'build-cancelled': {
      name: 'cancel',
      paths: ['M8 1.8a6.2 6.2 0 1 0 0 12.4A6.2 6.2 0 0 0 8 1.8zM3.8 12.2l8.4-8.4'],
    },
    'schedule-change': {
      name: 'schedule',
      paths: ['M2.2 3.2h11.6v10.6H2.2zM2.2 6.5h11.6M5.3 1.8v2.8M10.7 1.8v2.8M7.4 10h1.2'],
    },
    // Design 18's key (state I).
    'token-made': {
      name: 'key',
      paths: [
        'M2.2 10.5a2.8 2.8 0 1 0 5.6 0a2.8 2.8 0 1 0-5.6 0z',
        'M7 8.5l6-6M11 4.5l1.8 1.8M9.4 6.1l1.4 1.4',
      ],
    },
    // Design 18's revoked: a struck circle, drawn in outline as the trail's icons are.
    'token-revoked': {
      name: 'revoked',
      paths: ['M1.5 8a6.5 6.5 0 1 0 13 0a6.5 6.5 0 1 0-13 0z', 'M4.6 11.4l6.8-6.8'],
    },
    // Design 18's plug (state I).
    'mcp-call': { name: 'plug', paths: [PLUG], width: 1.4 },
  };

/** The token an event caused through MCP names, if it was (T781, AC-442). */
function viaMcpOf(record: Record_): string | undefined {
  const via = record.details?.['viaMcp'] as { token?: { name?: unknown } } | undefined;
  return typeof via?.token?.name === 'string' ? via.token.name : undefined;
}

/** The MCP badge beside an event caused through MCP (design 18, state I). */
function McpBadge({ token }: { token: string | undefined }) {
  if (token === undefined) return null;
  return (
    <span className="badge audit-trail__mcp" title={`Caused through MCP, by the token ${token}`}>
      <svg
        viewBox="0 0 16 16"
        width="12"
        height="12"
        aria-hidden="true"
        data-icon="plug"
        className="audit-trail__icon"
      >
        <path d={PLUG} fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinejoin="round" />
      </svg>
      <span>MCP</span>
    </span>
  );
}

function EventIcon({ event }: { event: AuditEvent }) {
  const icon = EVENT_ICONS[event];
  return (
    <svg
      viewBox="0 0 16 16"
      width="14"
      height="14"
      aria-hidden="true"
      data-icon={icon.name}
      className="audit-trail__icon"
    >
      {icon.paths.map((path) => (
        <path
          key={path}
          d={path}
          fill="none"
          stroke="currentColor"
          strokeWidth={icon.width ?? 1.5}
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}

export function AuditTrail({
  filters,
  onFilters,
}: {
  readonly filters: AuditFilters;
  readonly onFilters: (next: AuditFilters) => void;
}) {
  const key = JSON.stringify(filters);
  /**
   * The pages seen for these filters, by where each began: back is one step.
   * Past the first, each asks the first page's range (`since`). Other
   * filters start again at the first page (T369's review).
   */
  const [pages, setPages] = useState<{
    key: string;
    after: (string | undefined)[];
    since?: string | undefined;
  }>({ key, after: [undefined] });
  const paged = pages.key === key ? pages : { key, after: [undefined], since: undefined };
  const after = paged.after;
  const current = after.at(-1);
  const [openId, setOpenId] = useState<string | null>(null);
  const filterBar = useRef<HTMLDivElement>(null);
  /** Where focus goes once these filters are drawn: a removed chip's place (T369's review). */
  const refocus = useRef<{ key: string; to: () => HTMLElement | null | undefined } | null>(null);
  useEffect(() => {
    if (refocus.current?.key !== key) return;
    const to = refocus.current.to;
    refocus.current = null;
    to()?.focus();
  });

  const people = useQuery({
    queryKey: ['audit-people'],
    queryFn: () => getJson<Person[]>('/api/audit/people'),
  });
  const folders = useQuery(FOLDERS_QUERY);
  const page = useQuery({
    queryKey: ['audit', key, current, paged.since],
    queryFn: async () => {
      // A relative range counted from now for the first page; the pages
      // after it ask the first's (T369's review).
      const since = current === undefined ? sinceOf(filters) : paged.since;
      const read = await getJson<Page>(`/api/audit?${queryOf(filters, current, since)}`);
      return { ...read, since };
    },
    // The page before stays while the next is read, but never another
    // filter's rows under these chips (T369's review).
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[1] === key ? previous : undefined,
  });
  const waiting = page.isPlaceholderData;
  const ids = useId();

  const set = (next: AuditFilters, focusAfter?: () => HTMLElement | null | undefined) => {
    setOpenId(null);
    const nextKey = JSON.stringify(next);
    setPages({ key: nextKey, after: [undefined] });
    if (focusAfter !== undefined) refocus.current = { key: nextKey, to: focusAfter };
    onFilters(next);
  };
  /** The first filter, where focus goes when no chip is left to take it. */
  const firstFilter = () => filterBar.current?.querySelector<HTMLElement>('input, select, button');
  const chipRemovers = () => [
    ...(filterBar.current?.parentElement?.querySelectorAll<HTMLElement>(
      '.audit-trail__chips .filter-chip__remove',
    ) ?? []),
  ];
  const folderName = (id: string) => targetPathOf(folders.data ?? [], id) ?? 'a folder';
  const person = (keyed: string) => {
    const found = people.data?.find((each) => each.key === keyed);
    return found === undefined ? keyed : who(found);
  };

  const chips: { label: string; text: string; clear: AuditFilters }[] = [];
  if (filters.user !== undefined)
    chips.push({
      label: 'User',
      text: person(filters.user),
      clear: { ...filters, user: undefined },
    });
  if (filters.events.length > 0)
    chips.push({
      label: 'Event',
      text: filters.events.map((event) => EVENT_LABEL[event]).join(', '),
      clear: { ...filters, events: [] },
    });
  if (filters.folder !== undefined)
    chips.push({
      label: 'Folder',
      text: `${folderName(filters.folder)}${filters.subfolders ? ' and subfolders' : ''}`,
      clear: { ...filters, folder: undefined, subfolders: false },
    });
  if (filters.time !== 'all')
    chips.push({
      label: 'Time',
      text:
        filters.time === 'custom'
          ? [filters.since, filters.until].map((each) => each || '…').join(' to ')
          : TIME_LABEL[filters.time],
      clear: { ...filters, time: 'all', since: undefined, until: undefined },
    });

  const records = page.data?.records ?? [];
  const opened = records.find((record) => record.id === openId);
  const allFolders = [...(folders.data ?? [])]
    .map(
      (folder) => [folder.id, targetPathOf(folders.data ?? [], folder.id) ?? folder.title] as const,
    )
    .toSorted((a, b) => a[1].localeCompare(b[1]));

  return (
    <div className={`audit-trail${opened === undefined ? '' : ' audit-trail--open'}`}>
      <div className="audit-trail__list">
        {/* Four filters that combine (pin 2). */}
        <div className="sources-filters audit-trail__filters" ref={filterBar}>
          <Pill label="User">
            {(id) => (
              <UserFilter
                id={id}
                people={people.data ?? []}
                chosen={filters.user}
                onChoose={(user) => set({ ...filters, user })}
              />
            )}
          </Pill>
          <EventPicker chosen={filters.events} onChoose={(events) => set({ ...filters, events })} />
          <Pill label="Folder">
            {(id) => (
              <select
                id={id}
                value={filters.folder ?? ''}
                onChange={(event) =>
                  set({
                    ...filters,
                    folder: event.target.value || undefined,
                    ...(event.target.value === '' ? { subfolders: false } : {}),
                  })
                }
              >
                <option value="">Any</option>
                <option value="root">Shared</option>
                {allFolders.map(([id_, path]) => (
                  <option key={id_} value={id_}>
                    {path}
                  </option>
                ))}
              </select>
            )}
          </Pill>
          <label className="audit-trail__subfolders">
            <input
              type="checkbox"
              checked={filters.subfolders}
              disabled={filters.folder === undefined}
              onChange={(event) => set({ ...filters, subfolders: event.target.checked })}
            />
            Include subfolders
          </label>
          <Pill label="Time">
            {(id) => (
              <select
                id={id}
                value={filters.time}
                onChange={(event) => set({ ...filters, time: event.target.value as AuditTime })}
              >
                {TIMES.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            )}
          </Pill>
          {filters.time === 'custom' ? (
            <span className="audit-trail__range">
              <label>
                From{' '}
                <input
                  type="datetime-local"
                  step={1}
                  value={filters.since ?? ''}
                  onChange={(event) => set({ ...filters, since: event.target.value })}
                />
              </label>
              <label>
                To{' '}
                <input
                  type="datetime-local"
                  step={1}
                  value={filters.until ?? ''}
                  onChange={(event) => set({ ...filters, until: event.target.value })}
                />
              </label>
            </span>
          ) : null}
        </div>

        {/* The active filters as chips that combine, the count at the row's end (pin 3; T699, SEC-07). */}
        <div className="audit-trail__chips">
          {chips.length === 0 ? null : (
            <ul aria-label="Active filters">
              {chips.map((chip, at) => (
                <li key={chip.label} className="filter-chip">
                  {chip.label}: {chip.text}
                  <button
                    type="button"
                    className="filter-chip__remove"
                    aria-label={`Remove ${chip.label}`}
                    // Focus to the chip taking its place, else the filters (T369's review).
                    onClick={() =>
                      set(chip.clear, () => {
                        const left = chipRemovers();
                        return left[Math.min(at, left.length - 1)] ?? firstFilter();
                      })
                    }
                  >
                    <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
                      <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" />
                    </svg>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {chips.length === 0 ? null : (
            <button
              type="button"
              className="link-button"
              onClick={() => set(NO_FILTERS, firstFilter)}
            >
              Clear filters
            </button>
          )}
          <p className="audit-trail__count" role="status">
            {page.data === undefined
              ? ''
              : `${page.data.total.toLocaleString('en-US')} ${page.data.total === 1 ? 'record' : 'records'} · newest first`}
          </p>
        </div>

        {page.isError ? (
          // State C: Retry and Details (T474's review; direction.md rule 18).
          <div className="audit-trail__error">
            <StateLine kind="err">Couldn’t read the audit trail.</StateLine>
            <button type="button" className="btn btn-sm" onClick={() => void page.refetch()}>
              Retry
            </button>
            <details>
              <summary>Details</summary>
              {page.error.message}
            </details>
          </div>
        ) : null}
        {page.data === undefined && page.isPending ? (
          // Skeleton rows while the first page is read (state C).
          <div className="audit-trail__skeleton" aria-hidden="true">
            {[0, 1, 2, 3].map((row) => (
              <span key={row} />
            ))}
          </div>
        ) : null}
        {page.data !== undefined && records.length === 0 ? (
          <p className="audit-trail__none">
            No records match these filters.{' '}
            {chips.length === 0 ? null : (
              <button
                type="button"
                className="link-button"
                onClick={() => set(NO_FILTERS, firstFilter)}
              >
                Clear filters
              </button>
            )}
          </p>
        ) : null}
        {records.length === 0 ? null : (
          <TableScroll label="Audit trail">
            <table
              className="query-log audit-trail__table"
              aria-label="Audit trail"
              aria-busy={waiting}
            >
              <thead>
                <tr>
                  {['Time', 'User', 'Event', 'Folder', 'Item', 'Details'].map((column) => (
                    // The order is fixed: nothing sorts, and the header says so (pin 9).
                    <th
                      key={column}
                      scope="col"
                      title="Always newest first"
                      {...(column === 'Time' ? { 'aria-sort': 'descending' as const } : {})}
                    >
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {records.map((record) => {
                  const when = whenOf(record.at);
                  return (
                    <tr
                      key={record.id}
                      className={record.id === openId ? 'is-selected' : undefined}
                    >
                      <td className="audit-trail__time">
                        <time dateTime={record.at} title={when.exact}>
                          {when.shown}
                        </time>
                      </td>
                      {/* An identity, in the code face (pin 6; T699, SEC-05). */}
                      <td>{record.actor === null ? '—' : <code>{who(record.actor)}</code>}</td>
                      <td>
                        <span className="audit-trail__event">
                          <EventIcon event={record.event} />
                          <span>{EVENT_LABEL[record.event] ?? record.event}</span>
                        </span>
                        {/* Caused through MCP (T781, AC-442; design 18, state I). */}
                        <McpBadge token={viaMcpOf(record)} />
                      </td>
                      <td>{folderText(record, false)}</td>
                      <td>
                        {record.item === null
                          ? '—'
                          : // Cube Store is one of its kind: its name alone (T536; state J).
                            record.item.kind === 'cube-store'
                            ? record.item.title
                            : `${KIND_LABEL[record.item.kind] ?? record.item.kind} · ${record.item.title}`}
                        {/* A run on a workspace copy, recorded at its original's folder (state J). */}
                        {record.event === 'sql-run' && record.details?.['inWorkspace'] === true
                          ? ' · copy in My workspace'
                          : null}
                      </td>
                      <td>
                        {/* The whole record, in the inspector (pin 7). */}
                        <button
                          type="button"
                          id={`${ids}-row-${record.id}`}
                          className="link-button audit-trail__summary"
                          aria-expanded={record.id === openId}
                          {...(record.id === openId ? { 'aria-controls': `${ids}-record` } : {})}
                          onClick={() => setOpenId(record.id === openId ? null : record.id)}
                        >
                          <SummaryText record={record} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableScroll>
        )}

        {/* A page at a time, never scrolling forever (pin 9). */}
        <div className="audit-trail__pager">
          {/* Still while a page is read, so a second press never skips one (T369's review). */}
          <button
            type="button"
            className="btn btn-sm"
            disabled={after.length <= 1 || waiting}
            onClick={() => setPages({ key, after: after.slice(0, -1), since: paged.since })}
          >
            Newer
          </button>
          <button
            type="button"
            className="btn btn-sm"
            disabled={page.data?.next === undefined || waiting}
            onClick={() => {
              const next = page.data?.next;
              if (next !== undefined)
                setPages({ key, after: [...after, next], since: page.data?.since });
            }}
          >
            Older
          </button>
        </div>
        {page.data === undefined ? null : (
          // The retention the deployment sets, said (pin 8, AC-296).
          <p className="audit-trail__retention">
            Records older than {periodOf(page.data.retentionDays)} are removed. The deployment sets
            this period (<code>api.auditRetentionDays: {page.data.retentionDays}</code>).
          </p>
        )}
      </div>
      {opened === undefined ? null : (
        <Inspector
          id={`${ids}-record`}
          record={opened}
          onClose={() => {
            setOpenId(null);
            // Back to the row it was opened from (T369's review).
            document.getElementById(`${ids}-row-${opened.id}`)?.focus();
          }}
        />
      )}
    </div>
  );
}

/**
 * A record's one-line summary, an access change's group identifiers in the
 * code face, as design 08 writes "Added read-write group `emea-analysts`"
 * (pin 4; T699, SEC-05).
 */
function SummaryText({ record }: { record: Record_ }) {
  const details = record.details ?? {};
  const named =
    record.event === 'access-change'
      ? [details['readWrite'], details['readOnly']]
          .flatMap((change) => {
            const { before, after } = (change ?? {}) as { before?: unknown; after?: unknown };
            return [...(groupsOf(before) ?? []), ...(groupsOf(after) ?? [])];
          })
          .filter((group, at, all) => group !== '' && all.indexOf(group) === at)
          .toSorted((a, b) => b.length - a.length)
      : [];
  if (named.length === 0) return <>{record.summary}</>;
  const escaped = named.map((group) => group.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const parts = record.summary.split(new RegExp(`(?<![\\w-])(${escaped.join('|')})(?![\\w-])`));
  return <>{parts.map((part, at) => (at % 2 === 1 ? <code key={at}>{part}</code> : part))}</>;
}

/**
 * User, a combobox of the identities in the records (design 08 pin 2; T699,
 * SEC-09): a native input with its list, so what is typed or picked is the
 * filter once it names someone, and nothing typed is Anyone.
 */
function UserFilter({
  id,
  people,
  chosen,
  onChoose,
}: {
  id: string;
  people: readonly Person[];
  chosen: string | undefined;
  onChoose: (user: string | undefined) => void;
}) {
  const listId = useId();
  const shownOf = (key: string | undefined) => {
    const person = people.find((each) => each.key === key);
    return person === undefined ? '' : who(person);
  };
  // What's typed, following the filter where it changes elsewhere (a chip,
  // Clear filters), and its person once the people are read, as on a reload
  // with one chosen (T699's review), unless something else has been typed.
  const shown = shownOf(chosen);
  const [typed, setTyped] = useState(shown);
  const [following, setFollowing] = useState({ chosen, shown });
  if (following.chosen !== chosen || following.shown !== shown) {
    if (following.chosen !== chosen || typed === following.shown) setTyped(shown);
    setFollowing({ chosen, shown });
  }
  // An identity typed before the people were read is the filter once they
  // are; the field then follows it, as it already says.
  useEffect(() => {
    const person = people.find((each) => who(each) === typed.trim());
    if (person !== undefined && person.key !== chosen) onChoose(person.key);
  }, [people, typed, chosen, onChoose]);
  return (
    <>
      <input
        id={id}
        // With its list, a combobox (HTML's own role for it).
        type="text"
        list={listId}
        placeholder="Anyone"
        autoComplete="off"
        value={typed}
        onChange={(event) => {
          const text = event.target.value;
          setTyped(text);
          if (text.trim() === '') {
            setFollowing({ chosen: undefined, shown: '' });
            onChoose(undefined);
            return;
          }
          const person = people.find((each) => who(each) === text.trim());
          if (person !== undefined && person.key !== chosen) {
            setFollowing({ chosen: person.key, shown: who(person) });
            onChoose(person.key);
          }
        }}
      />
      <datalist id={listId}>
        {people.map((each) => (
          <option key={each.key} value={who(each)} />
        ))}
      </datalist>
    </>
  );
}

/** Where a record happened: its path below Shared, or with it for the inspector. */
function folderText(
  record: Pick<Record_, 'folderId' | 'folderPath' | 'inWorkspace'>,
  withShared: boolean,
): string {
  if (record.folderId === null) return '—';
  if (record.folderPath === null)
    return record.inWorkspace === true || record.folderId.startsWith('ws:')
      ? 'A workspace'
      : 'A folder no longer there';
  const names = record.folderPath.map((folder) => folder.title);
  if (withShared) return ['Shared', ...names].join(' / ');
  return names.length === 0 ? 'Shared' : names.join(' / ');
}

/** A filter pill: its name and a native select, as design 01's list has them (T496). */
function Pill({ label, children }: { label: string; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <span className="select-pill">
      <label htmlFor={id}>{label}</label>
      {children(id)}
    </span>
  );
}

/** Event: several of the seven kinds at once (pin 2). */
function EventPicker({
  chosen,
  onChoose,
}: {
  chosen: readonly AuditEvent[];
  onChoose: (events: AuditEvent[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLSpanElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  useEffect(() => {
    if (!open) return undefined;
    // Focus into it as it opens, on its first kind (T405, rule 85).
    box.current?.querySelector<HTMLInputElement>('fieldset input')?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      button.current?.focus();
    };
    const onPress = (event: PointerEvent) => {
      if (event.target instanceof Node && !box.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPress);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPress);
    };
  }, [open]);
  return (
    <span className="audit-trail__events" ref={box}>
      <button
        ref={button}
        type="button"
        className="select-pill audit-trail__events-button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((was) => !was)}
      >
        Event{' '}
        <b>
          {chosen.length === 0
            ? 'Any'
            : chosen.length === 1
              ? EVENT_LABEL[chosen[0]!]
              : `${String(chosen.length)} kinds`}
        </b>
      </button>
      <fieldset id={panelId} className="audit-trail__events-panel" hidden={!open}>
        <legend className="visually-hidden">Events</legend>
        {EVENTS.map(([event, label]) => (
          <label key={event}>
            <input
              type="checkbox"
              checked={chosen.includes(event)}
              onChange={(change) =>
                onChoose(
                  change.target.checked
                    ? EVENTS.map(([each]) => each).filter(
                        (each) => each === event || chosen.includes(each),
                      )
                    : chosen.filter((each) => each !== event),
                )
              }
            />
            <EventIcon event={event} />
            {label}
          </label>
        ))}
      </fieldset>
    </span>
  );
}

/** The full record (pin 7; states A and B): never edited or deleted here. */
function Inspector({ id, record, onClose }: { id: string; record: Record_; onClose: () => void }) {
  const when = whenOf(record.at);
  const details = record.details ?? {};
  // A schedule change says what it was: "Schedule change · Changed" (design 16, I1).
  const change =
    record.event === 'schedule-change' && typeof details['change'] === 'string'
      ? SCHEDULE_CHANGES[details['change']]
      : undefined;
  const label = `${EVENT_LABEL[record.event] ?? record.event}${change === undefined ? '' : ` · ${change}`}`;
  const role = typeof details['role'] === 'string' ? details['role'] : undefined;
  // Focus to the record as it opens, since it follows the whole table (T369's review).
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), [record.id]);
  // Escape in it closes it, as its × does (T405, rule 85).
  const section = useRef<HTMLElement>(null);
  const closing = useRef(onClose);
  useEffect(() => {
    closing.current = onClose;
  }, [onClose]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (!(event.target instanceof Node) || section.current?.contains(event.target) !== true)
        return;
      event.preventDefault();
      closing.current();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  return (
    <section
      ref={section}
      id={id}
      className="audit-trail__inspector"
      aria-label={`${label} ${folderText(record, false)} · ${when.shown}`}
    >
      <header className="audit-trail__inspector-head">
        <h3 ref={heading} tabIndex={-1}>
          <EventIcon event={record.event} /> {label}
        </h3>
        <button
          type="button"
          className="btn-ghost btn-sm"
          aria-label="Close the record"
          onClick={onClose}
        >
          ×
        </button>
      </header>
      <p className="audit-trail__inspector-where">
        {folderText(record, false)}
        {record.item === null ? '' : ` · ${record.item.title}`} · {when.shown}{' '}
        <span className="audit-trail__utc">({when.utc})</span>
      </p>
      <dl className="source-settings__rows audit-trail__kv">
        <dt>By</dt>
        {/* In the code face, as design 08's inspector has it (T699, SEC-03). */}
        <dd>{record.actor === null ? '—' : <code>{who(record.actor)}</code>}</dd>
        {role === undefined ? null : (
          <>
            <dt>Role</dt>
            <dd>{role}</dd>
          </>
        )}
        {record.event === 'schedule-change' ? (
          <>
            <dt>Schedule</dt>
            <dd>{record.item?.title ?? '—'} · wechart</dd>
            <dt>Builds</dt>
            <dd>
              <code>{typeof details['shownName'] === 'string' ? details['shownName'] : '—'}</code>
            </dd>
          </>
        ) : null}
        <dt>Folder</dt>
        <dd>{folderText(record, true)}</dd>
        {/* By wechart's scheduler: after how many failures, with Cube's last error (Q12). */}
        {record.event === 'schedule-change' && details['change'] === 'suspended' ? (
          <>
            <dt>Failures in a row</dt>
            <dd>{typeof details['failures'] === 'number' ? String(details['failures']) : '—'}</dd>
            <dt>Last error</dt>
            <dd>{typeof details['error'] === 'string' ? details['error'] : '—'}</dd>
          </>
        ) : null}
        {/* Resumed from its suspension: since when, and the error then (T505's review). */}
        {record.event === 'schedule-change' &&
        details['change'] === 'resumed' &&
        typeof details['suspendedAt'] === 'string' ? (
          <>
            <dt>Suspended since</dt>
            <dd>
              <time dateTime={details['suspendedAt']} title={whenOf(details['suspendedAt']).exact}>
                {whenOf(details['suspendedAt']).shown}
              </time>
            </dd>
            <dt>Last error then</dt>
            <dd>{typeof details['error'] === 'string' ? details['error'] : '—'}</dd>
          </>
        ) : null}
        {/* Resumed from a pause by hand: since when, and by whom (T556). */}
        {record.event === 'schedule-change' &&
        details['change'] === 'resumed' &&
        typeof details['pausedAt'] === 'string' ? (
          <>
            <dt>Paused since</dt>
            <dd>
              <time dateTime={details['pausedAt']} title={whenOf(details['pausedAt']).exact}>
                {whenOf(details['pausedAt']).shown}
              </time>
            </dd>
            <dt>Paused by</dt>
            <dd>
              {(details['pausedBy'] as { name?: unknown } | null | undefined)?.name?.toString() ??
                '—'}
            </dd>
          </>
        ) : null}
      </dl>
      {record.event === 'schedule-change' && Array.isArray(details['settings']) ? (
        <ScheduleSettings settings={details['settings']} />
      ) : record.event === 'access-change' ? (
        <>
          <Groups name="Read-write groups" change={details['readWrite']} />
          <Groups name="Read-only groups" change={details['readOnly']} />
        </>
      ) : record.event === 'data-source-change' && Array.isArray(details['changes']) ? (
        <Settings
          changes={details['changes']}
          tested={typeof details['testId'] === 'string'}
          testedAt={typeof details['testedAt'] === 'string' ? details['testedAt'] : undefined}
        />
      ) : record.event === 'publish-refused' && Array.isArray(details['breaks']) ? (
        <Breaks breaks={details['breaks']} shown={details['shown']} actor={record.actor} />
      ) : record.event === 'sql-run' ? (
        <SqlRun details={details} />
      ) : (
        <p>{record.summary}</p>
      )}
      <p className="audit-trail__immutable">
        Records can’t be edited or deleted here. They’re removed only by the retention period.
      </p>
    </section>
  );
}

const SQL_OUTCOMES: Readonly<Record<string, string>> = {
  finished: 'Finished',
  refused: 'Not run',
  timeout: 'Stopped at 30 seconds',
  cancelled: 'Cancelled',
  failed: 'Database error',
  busy: 'Not run · xcube was busy',
  unavailable: 'Not run · xcube couldn’t run it',
  lost: 'Not finished · its server stopped mid-run',
};

/**
 * A SQL run's record (T534, AC-382; design 15, state J): its outcome, rows
 * and time, and its SQL with every literal replaced by `?`; none where it
 * couldn't be read, so its literals couldn't be found. Never the database's
 * own words, which may quote one.
 */
function SqlRun({ details }: { details: Record<string, unknown> }) {
  const outcome = typeof details['outcome'] === 'string' ? details['outcome'] : '';
  const cut =
    details['truncated'] === 'rows'
      ? 'Limited to 10,000 rows'
      : details['truncated'] === 'bytes'
        ? 'Limited to 10 MB'
        : undefined;
  const rows = typeof details['rowCount'] === 'number' ? details['rowCount'] : null;
  const ms = typeof details['durationMs'] === 'number' ? details['durationMs'] : null;
  const sql = typeof details['sql'] === 'string' ? details['sql'] : null;
  return (
    <>
      <dl className="source-settings__rows">
        <dt>Outcome</dt>
        <dd>{cut ?? SQL_OUTCOMES[outcome] ?? outcome}</dd>
        <dt>Rows</dt>
        <dd>{rows === null ? '—' : rows.toLocaleString('en')}</dd>
        <dt>Duration</dt>
        <dd>
          {ms === null
            ? '—'
            : `${(ms / 1000).toLocaleString('en', { maximumFractionDigits: 2 })} s`}
        </dd>
      </dl>
      <h4>SQL, literals replaced</h4>
      {sql === null ? (
        <p data-testid="audit-sql">
          Not kept: it couldn’t be read, so its literals couldn’t be found and replaced.
        </p>
      ) : (
        <>
          <pre className="audit-trail__sql" data-testid="audit-sql">
            {sql}
          </pre>
          <p className="audit-trail__note">
            Each string, number and date is replaced by ?. Names of tables and columns stay. The SQL
            as written is only in its author’s own runs.
          </p>
        </>
      )}
    </>
  );
}

/** A list of groups as the record keeps it: null inherits the parent's. */
const groupsOf = (value: unknown): string[] | null =>
  Array.isArray(value) ? value.filter((each): each is string => typeof each === 'string') : null;

/** An access change's list, before and after, the groups in the code face (state, pin 6). */
function Groups({ name, change }: { name: string; change: unknown }) {
  const { before, after } = (change ?? {}) as { before?: unknown; after?: unknown };
  const was = groupsOf(before);
  const is = groupsOf(after);
  const listed = (groups: string[] | null) =>
    groups === null ? 'Inherited' : groups.length === 0 ? 'None' : null;
  // Before and After as two columns, a group to a line, as design 08's
  // inspector draws them (T699, SEC-12).
  return (
    <div role="group" aria-label={name} className="audit-trail__groups">
      <h4>{name}</h4>
      <div className="audit-trail__before-after">
        <div>
          <span className="audit-trail__column">Before</span>
          <span className="audit-trail__glist">
            {listed(was) === null ? (
              was!.map((group) => <code key={group}>{group}</code>)
            ) : (
              <span>{listed(was)}</span>
            )}
          </span>
        </div>
        <div>
          <span className="audit-trail__column">After</span>
          <span className="audit-trail__glist">
            {listed(is) === null ? (
              [
                ...is!.map((group) =>
                  was !== null && !was.includes(group) ? (
                    <ins key={group}>+ {group}</ins>
                  ) : (
                    <code key={group}>{group}</code>
                  ),
                ),
                // A group taken away, struck through (design 08, state B).
                ...(was ?? [])
                  .filter((group) => !is!.includes(group))
                  .map((group) => <del key={`removed-${group}`}>{group}</del>),
              ]
            ) : (
              <span>{listed(is)}</span>
            )}
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * A refused publish's every break, named even where its user saw only a
 * count, each with its file, its folder, the line and column where given and
 * its error; then what its user was shown (T427, AC-322; design 08, state B).
 */
function Breaks({
  breaks,
  shown,
  actor,
}: {
  breaks: readonly unknown[];
  shown: unknown;
  actor: Person | null;
}) {
  const rows = breaks.filter(
    (
      each,
    ): each is {
      path: string;
      message: string;
      folderId: string;
      folderPath?: Record_['folderPath'];
      inWorkspace?: true;
      line?: number;
      column?: number;
    } =>
      typeof each === 'object' &&
      each !== null &&
      typeof (each as { path?: unknown }).path === 'string' &&
      typeof (each as { message?: unknown }).message === 'string' &&
      typeof (each as { folderId?: unknown }).folderId === 'string',
  );
  // "1 break named, 1 counted", as state B says it.
  const { named, counted } = (shown ?? {}) as { named?: unknown; counted?: unknown };
  const said =
    typeof named === 'number' && typeof counted === 'number'
      ? `${String(named)} ${named === 1 ? 'break' : 'breaks'} named, ${String(counted)} counted`
      : '';
  return (
    <dl className="source-settings__rows">
      <dt>Breaks</dt>
      <dd>
        <ul aria-label="Breaks" className="audit-trail__breaks">
          {rows.map((row, at) => {
            const where = folderText(
              {
                folderId: row.folderId,
                folderPath: row.folderPath ?? null,
                ...(row.inWorkspace === true ? { inWorkspace: true as const } : {}),
              },
              false,
            );
            const place =
              typeof row.line === 'number'
                ? ` line ${String(row.line)}${typeof row.column === 'number' ? `:${String(row.column)}` : ''},`
                : '';
            return (
              <li key={`${row.path}-${String(at)}`}>
                <code>{row.path}</code> ({where}){place} {row.message}
              </li>
            );
          })}
        </ul>
      </dd>
      {said === '' ? null : (
        <>
          <dt>Shown to {actor?.name ?? 'its user'}</dt>
          <dd>{said}</dd>
        </>
      )}
    </dl>
  );
}

/**
 * A wechart schedule's settings, before and after it was made, changed or
 * deleted (T505; design 16, state I): one that kept its value says so.
 */
function ScheduleSettings({ settings }: { settings: readonly unknown[] }) {
  const rows = settings.filter(
    (each): each is { setting: string; before: string | null; after: string | null } =>
      typeof each === 'object' &&
      each !== null &&
      typeof (each as { setting?: unknown }).setting === 'string',
  );
  return (
    <>
      <h4>What changed</h4>
      <table className="query-log" aria-label="What changed">
        <thead>
          <tr>
            <th scope="col">
              <span className="visually-hidden">Setting</span>
            </th>
            <th scope="col">Before</th>
            <th scope="col">After</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.setting}>
              <td>{row.setting}</td>
              {row.before !== null && row.before === row.after ? (
                <td colSpan={2} className="audit-trail__unchanged">
                  {row.before}, unchanged
                </td>
              ) : (
                <>
                  <td>{row.before ?? '—'}</td>
                  <td>{row.after ?? '—'}</td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

/** A data-source change's settings, before and after; a secret only "Replaced" (state A). */
function Settings({
  changes,
  tested,
  testedAt,
}: {
  changes: readonly unknown[];
  tested: boolean;
  testedAt?: string | undefined;
}) {
  const rows = changes.filter(
    (each): each is { setting: string; before: string | null; after: string | null } =>
      typeof each === 'object' &&
      each !== null &&
      typeof (each as { setting?: unknown }).setting === 'string',
  );
  return (
    <>
      <table className="query-log" aria-label="Changed settings">
        <thead>
          <tr>
            <th scope="col">Setting</th>
            <th scope="col">Before</th>
            <th scope="col">After</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.setting}>
              <td>{row.setting}</td>
              <td>{row.before ?? '—'}</td>
              <td>
                {row.after === 'replaced' ? (
                  // A secret replaced, never shown: a badge with its padlock (state A; T699, SEC-11).
                  <span className="badge audit-trail__replaced">
                    <svg
                      viewBox="0 0 16 16"
                      width="12"
                      height="12"
                      aria-hidden="true"
                      data-icon="lock"
                    >
                      <path
                        d="M4.5 7h7a1.5 1.5 0 0 1 1.5 1.5v4a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 3 12.5v-4A1.5 1.5 0 0 1 4.5 7zM5.5 7V5a2.5 2.5 0 0 1 5 0v2"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                      />
                    </svg>
                    Replaced
                  </span>
                ) : (
                  (row.after ?? '—')
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {/* With its icon, and the test's time where the record keeps it (state A; security-Q6). */}
      {tested ? (
        <StateLine kind="ok" role="status" className="audit-trail__tested">
          {`Saved after a passing test${testedAt === undefined ? '' : ` · ${clockOf(new Date(testedAt), { seconds: true })}`}`}
        </StateLine>
      ) : null}
    </>
  );
}
