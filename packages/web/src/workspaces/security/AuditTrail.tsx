import { useQuery } from '@tanstack/react-query';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

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
] as const;
export type AuditEvent = (typeof EVENTS)[number][0];
const EVENT_LABEL = Object.fromEntries(EVENTS) as Record<AuditEvent, string>;

const TIMES = [
  ['all', 'All'],
  ['day', 'Last 24 hours'],
  ['week', 'Last 7 days'],
  ['month', 'Last 30 days'],
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

/** "Today 15:02:11", "Yesterday 16:40:12", then "24 Sep 09:40:55" (pin 4). */
function whenOf(iso: string): { shown: string; utc: string } {
  const at = new Date(iso);
  const time = at.toLocaleTimeString('en-GB', { hour12: false });
  const day = new Date(at);
  day.setHours(0, 0, 0, 0);
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);
  const days = Math.round((midnight.getTime() - day.getTime()) / 86_400_000);
  const date =
    days === 0
      ? 'Today'
      : days === 1
        ? 'Yesterday'
        : at.toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'short',
            ...(at.getFullYear() === new Date().getFullYear() ? {} : { year: 'numeric' }),
          });
  return { shown: `${date} ${time}`, utc: `${iso.slice(0, 19).replace('T', ' ')} UTC` };
}

/** "1 year", "2 years", "90 days": how long records are kept (pin 8). */
function periodOf(days: number): string {
  if (days % 365 === 0) return days === 365 ? '1 year' : `${String(days / 365)} years`;
  return days === 1 ? '1 day' : `${String(days)} days`;
}

/** Each event's icon beside its label, never colour alone (pin 5, rule 3). */
function EventIcon({ event }: { event: AuditEvent }) {
  const path: Record<AuditEvent, string> = {
    'sign-in': 'M6 3h6v10H6M2 8h7M7 5.5 9.5 8 7 10.5',
    'access-change': 'M4 7V5a4 4 0 0 1 8 0v2M3 7h10v7H3z',
    proposal: 'M8 12V3M4.5 6.5 8 3l3.5 3.5M3 13h10',
    approval: 'M3 8.5 6.5 12 13 4.5',
    rejection: 'M4 4l8 8M12 4l-8 8',
    restore: 'M3 8a5 5 0 1 0 1.5-3.5M3 2.5V5h2.5',
    'data-source-change':
      'M3 4c0-1.1 2.2-2 5-2s5 .9 5 2v8c0 1.1-2.2 2-5 2s-5-.9-5-2zM3 4c0 1.1 2.2 2 5 2s5-.9 5-2',
    'publish-refused': 'M8 2a6 6 0 1 0 0 12A6 6 0 0 0 8 2zM3.8 3.8l8.4 8.4',
    // A terminal's prompt, as design 15 draws the SQL tab's.
    'sql-run': 'M2.5 3.5h11v9h-11zM5 6.5 7 8l-2 1.5M8.5 10h2.5',
  };
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path d={path[event]} fill="none" stroke="currentColor" strokeWidth="1.5" />
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
  const firstFilter = () => filterBar.current?.querySelector<HTMLElement>('select, button');
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
              <select
                id={id}
                value={filters.user ?? ''}
                onChange={(event) => set({ ...filters, user: event.target.value || undefined })}
              >
                <option value="">Anyone</option>
                {(people.data ?? []).map((each) => (
                  <option key={each.key} value={each.key}>
                    {who(each)}
                  </option>
                ))}
              </select>
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

        {/* The active filters as chips that combine (pin 3). */}
        {chips.length === 0 ? null : (
          <div className="audit-trail__chips">
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
            <button
              type="button"
              className="link-button"
              onClick={() => set(NO_FILTERS, firstFilter)}
            >
              Clear filters
            </button>
          </div>
        )}

        {page.isError ? (
          <div className="audit-trail__error">
            <StateLine kind="err">{page.error.message}</StateLine>
            <button type="button" className="btn btn-sm" onClick={() => void page.refetch()}>
              Retry
            </button>
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
        <p className="audit-trail__count" role="status">
          {page.data === undefined
            ? ''
            : `${String(page.data.total)} ${page.data.total === 1 ? 'record' : 'records'} · newest first`}
        </p>

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
                        <time dateTime={record.at} title={when.utc}>
                          {when.shown}
                        </time>
                      </td>
                      <td>{who(record.actor)}</td>
                      <td>
                        <span className="audit-trail__event">
                          <EventIcon event={record.event} />
                          <span>{EVENT_LABEL[record.event] ?? record.event}</span>
                        </span>
                      </td>
                      <td>{folderText(record, false)}</td>
                      <td>
                        {record.item === null
                          ? '—'
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
                          {record.summary}
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
  const label = EVENT_LABEL[record.event] ?? record.event;
  const details = record.details ?? {};
  const role = typeof details['role'] === 'string' ? details['role'] : undefined;
  // Focus to the record as it opens, since it follows the whole table (T369's review).
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), [record.id]);
  return (
    <section
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
      <dl className="source-settings__rows">
        <dt>By</dt>
        <dd>{who(record.actor)}</dd>
        {role === undefined ? null : (
          <>
            <dt>Role</dt>
            <dd>{role}</dd>
          </>
        )}
        <dt>Folder</dt>
        <dd>{folderText(record, true)}</dd>
      </dl>
      {record.event === 'access-change' ? (
        <>
          <Groups name="Read-write groups" change={details['readWrite']} />
          <Groups name="Read-only groups" change={details['readOnly']} />
        </>
      ) : record.event === 'data-source-change' && Array.isArray(details['changes']) ? (
        <Settings changes={details['changes']} tested={typeof details['testId'] === 'string'} />
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
  return (
    <div role="group" aria-label={name} className="audit-trail__groups">
      <h4>{name}</h4>
      <div className="audit-trail__before-after">
        <span>Before</span>
        <span>
          {listed(was) ??
            was!.map((group, at) => (
              <span key={group}>
                {at === 0 ? '' : ' '}
                <code>{group}</code>
              </span>
            ))}
        </span>
        <span>After</span>
        <span>
          {listed(is) ?? [
            ...is!.map((group, at) => {
              const added = was !== null && !was.includes(group);
              return (
                <span key={group}>
                  {at === 0 ? '' : ' '}
                  {added ? <ins>+ {group}</ins> : <code>{group}</code>}
                </span>
              );
            }),
            // A group taken away, struck through (design 08, state B).
            ...(was ?? [])
              .filter((group) => !is!.includes(group))
              .map((group) => (
                <span key={`removed-${group}`}>
                  {' '}
                  <del>{group}</del>
                </span>
              )),
          ]}
        </span>
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

/** A data-source change's settings, before and after; a secret only "Replaced" (state A). */
function Settings({ changes, tested }: { changes: readonly unknown[]; tested: boolean }) {
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
              <td>{row.after === 'replaced' ? 'Replaced' : (row.after ?? '—')}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {tested ? <p className="audit-trail__tested">Saved after a passing test</p> : null}
    </>
  );
}
