import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type ReactNode } from 'react';

import { ExportedToast } from '../../dashboard/export/ExportedToast';
import { InfoBar } from '../../shell/InfoBar';
import { NotFound } from '../../shell/NotFound';
import { StatusIcon, type StateKind } from '../../shell/StatusIcon';
import { TableScroll } from '../../shell/TableScroll';
import { shownOf } from '../jobs/BuildPanel';
import {
  EVERY_FOLDER,
  FolderFilter,
  inFolder,
  neverTheirs,
  ScopeNote,
  useJobsFolders,
  type FolderChoice,
} from '../jobs/FolderFilter';
import {
  ACCESS_LOST,
  isRefused,
  ListEmpty,
  ListError,
  ListLoading,
  NoFolderLeft,
  noFolderLeft,
  readErrorOf,
} from '../jobs/ListStates';
import { ChoicePill } from '../jobs/Pill';
import { BuiltWhen } from '../jobs/builds';
import { Status } from '../jobs/StateBadge';
import { OwnerFilter, type ShownOwner } from './OwnerFilter';
import { OwnerLabel } from './OwnerLabel';
import { PauseSwitch } from './PauseSwitch';
import { LastRunStatus, minuteOf, SchedulePane, WechartPane } from './SchedulePane';
import { dayIn, runsOf, timeIn, untilIn, zoneOf, type Schedule } from './schedule';
import { ScheduleForm } from './ScheduleForm';
import {
  failuresWords,
  readWechartSchedules,
  WECHART_SCHEDULES_KEY,
  type WechartSchedule,
} from './wechart';

/**
 * Schedules (T160, AC-154; T551, T552, design 16's screen 2): every
 * pre-aggregation's refresh schedule, a `public: false` cube's included, and
 * every wechart schedule, one row each, so a rollup with both has two; each
 * labelled with its owner as an icon and words, and each opening its pane. A
 * refresh key's is read-only, since the key is part of the model: where it
 * is set — the pre-aggregation in Model — and Jobs are a click away. A
 * wechart schedule is made here, with New schedule, and changed and deleted
 * in its pane, at once, with no proposal (AC-234).
 */

/** The icon a schedule's words wear, where its kind has one (design 07, pin 4; design 16). */
const ICONS: Partial<Record<Schedule['kind'], StateKind>> = {
  'not-scheduled': 'off',
  default: 'info',
  'cube-keys': 'info',
  unrunnable: 'warn',
};

/** Its next run, in its zone (else yours), with UTC and how long until it. */
function NextRun({ schedule, now }: { schedule: Schedule; now: Date }) {
  const { runs, change } = runsOf(schedule, now, 1);
  const zone = zoneOf(schedule);
  const next = runs[0];
  if (next !== undefined)
    return (
      <>
        {`${dayIn(zone, next)}, ${timeIn(zone, next)}`}
        <span className="schedules__sub">{`${timeIn('UTC', next)} UTC · ${untilIn(next, now)}`}</span>
      </>
    );
  if (change !== undefined)
    return (
      <span className="schedules__sub">After the clocks change on {dayIn(zone, change.at)}</span>
    );
  if (schedule.kind === 'sql') return <span className="schedules__sub">When its SQL changes</span>;
  if (schedule.kind === 'cube-keys')
    return <span className="schedules__sub">Depends on its cubes’ keys</span>;
  return <span className="muted">—</span>;
}

/** When Cube last built it: "Built today 14:01", "Not built yet", or "—" where not known. */
function LastRun({ schedule }: { schedule: Schedule }): ReactNode {
  if (schedule.lastBuiltAt === undefined) return <span className="muted">—</span>;
  if (schedule.lastBuiltAt === null) return <span className="schedules__sub">Not built yet</span>;
  return (
    <span className="schedules__sub">
      Built <BuiltWhen iso={schedule.lastBuiltAt} lower />
    </span>
  );
}

/**
 * A wechart schedule's next run, in its zone, with UTC and how long until it
 * (screen 2); where it would be, Suspended after its failures, with its icon
 * (pin 7); before its number, how many have failed in a row (E2).
 */
function WechartNextRun({ schedule, now }: { schedule: WechartSchedule; now: Date }) {
  if (schedule.suspendedAt !== null)
    return (
      <Status
        kind="susp"
        label={`Suspended after ${failuresWords(schedule.failuresInARow || schedule.suspendAfter)}`}
        testId="schedule-state"
        state="suspended"
      />
    );
  const failing =
    schedule.failuresInARow > 0 ? (
      <span className="schedules__sub schedules__failing">
        {`${String(schedule.failuresInARow)} failed in a row · suspends after ${String(schedule.suspendAfter)}`}
      </span>
    ) : null;
  // Paused by hand, by whom, with the idle icon (T556; design 16, P3); its
  // count kept across the pause (R59), and said (T556's review).
  if (schedule.pausedAt !== null)
    return (
      <>
        <Status
          kind="idle"
          label={`Paused · by ${schedule.pausedBy?.name ?? 'someone'}`}
          testId="schedule-state"
          state="paused"
        />
        {failing}
      </>
    );
  const next = schedule.runs?.[0];
  if (next === undefined)
    return (
      <>
        <span className="muted">—</span>
        {failing}
      </>
    );
  const at = new Date(next);
  return (
    <>
      {`${dayIn(schedule.timezone, at)}, ${timeIn(schedule.timezone, at)}`}
      <span className="schedules__sub">{`${timeIn('UTC', at)} UTC · ${untilIn(at, now)}`}</span>
      {failing}
    </>
  );
}

/** One wechart schedule's row (design 16, screen 2 pins 5–8). */
function WechartRow({
  schedule,
  now,
  selected,
  onSelect,
}: {
  schedule: WechartSchedule;
  now: Date;
  selected: boolean;
  onSelect: () => void;
}) {
  const shownAs = shownOf({
    id: schedule.preAggregation,
    ...(schedule.shortName === undefined ? {} : { shortName: schedule.shortName }),
    ...(schedule.folderPath === undefined ? {} : { folderPath: schedule.folderPath }),
  });
  // None before its first run; none either from an answer that lacks it.
  const lastRun = schedule.lastRun ?? null;
  return (
    <tr
      data-schedule-id={schedule.id}
      aria-selected={selected}
      tabIndex={0}
      className="build-panel__row"
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        onSelect();
      }}
    >
      <td className="query-log__query">
        {/* On, or paused by hand (T556; design 16, P3). */}
        <PauseSwitch schedule={schedule} />
        <span data-testid="schedule-name">{shownAs.name}</span>
      </td>
      <td className="jobs-wide">{shownAs.folder ?? 'Shared'}</td>
      <td className="jobs-wide">
        {/* Its name first, then in words, then as written with its zone (pin 6). */}
        <b data-testid="wechart-schedule-name">{schedule.name}</b>
        {schedule.when === undefined ? null : ` · ${schedule.when}`}
        <code className="schedules__sub">{`${schedule.cron} · ${schedule.timezone}`}</code>
      </td>
      <td>
        <WechartNextRun schedule={schedule} now={now} />
      </td>
      <td className="jobs-wide">
        {/* How its last run ended, from Run history (pin 8). */}
        {lastRun === null ? (
          <span className="schedules__sub">Not run yet</span>
        ) : (
          <>
            <LastRunStatus run={lastRun} />
            <span className="schedules__sub">{minuteOf(lastRun.startedAt)}</span>
          </>
        )}
      </td>
      <td>
        <OwnerLabel owner="wechart" />
        <span className="schedules__sub">by {schedule.createdBy.name}</span>
      </td>
    </tr>
  );
}

/** A wechart schedule's state, as Schedules' State filter chooses it (T558). */
type ScheduleState = 'active' | 'paused' | 'suspended';
/**
 * The State filter (T558; the user's answer, R66): Any, or a wechart
 * schedule's state, which Jobs' summary opens on Suspended.
 */
const SCHEDULE_STATES: readonly (readonly [ScheduleState, string])[] = [
  ['active', 'Active'],
  ['paused', 'Paused'],
  ['suspended', 'Suspended'],
];
/** `?state=`, the summary's link; Any for one it doesn't know. */
function scheduleStateOfUrl(): ScheduleState | '' {
  const asked = new URLSearchParams(window.location.search).get('state');
  return SCHEDULE_STATES.some(([state]) => state === asked) ? (asked as ScheduleState) : '';
}

/** What the pane holds: a refresh key's, a wechart schedule's, or New schedule's form. */
type Open =
  | { readonly kind: 'cube'; readonly id: string }
  | { readonly kind: 'wechart'; readonly id: string; readonly held?: WechartSchedule }
  | { readonly kind: 'new' };

export function SchedulesPage() {
  const schedules = useQuery({
    queryKey: ['schedules'],
    queryFn: async () => {
      const response = await fetch('/api/schedules');
      // The API's own words where it gives them: who Schedules is for (T371), with its status (T560).
      if (!response.ok)
        throw await readErrorOf(response, 'The schedules could not be read', 'GET /api/schedules');
      return (await response.json()) as Schedule[];
    },
  });
  // wechart's own schedules, made here (T552, AC-234).
  // Read again every 30 s, so a row's next and last runs move on (T552's review).
  const wechart = useQuery({
    queryKey: WECHART_SCHEDULES_KEY,
    queryFn: readWechartSchedules,
    refetchInterval: 30_000,
  });
  const [selected, setSelected] = useState<Open | null>(null);
  const client = useQueryClient();
  /** Access lost while the page was open (design 16, G5; T560), said once the lists are read again. */
  const [lost, setLost] = useState(false);
  const opened = useRef(selected);
  useEffect(() => {
    opened.current = selected;
  }, [selected]);
  /**
   * Any action on the page the API refuses (403) — Run now, the On switch,
   * Resume, a save, a delete — may find access gone: both lists are read
   * again. Where the schedule it was on (its mutation's `scheduleId`, else
   * the open one) went with them, it is said, and an open pane whose
   * schedule went closes (G5). One still listed was refused for another
   * reason, said in the API's words where it was asked (G4).
   */
  useEffect(
    () =>
      client.getMutationCache().subscribe((event) => {
        if (event.type !== 'updated' || event.action.type !== 'error') return;
        if (!isRefused(event.action.error)) return;
        const asked = event.mutation.options.meta?.['scheduleId'];
        void (async () => {
          await Promise.all([
            client.invalidateQueries({ queryKey: ['schedules'] }),
            client.invalidateQueries({ queryKey: WECHART_SCHEDULES_KEY }),
          ]);
          const now = client.getQueryData<WechartSchedule[]>(WECHART_SCHEDULES_KEY) ?? [];
          const listed = (id: string) => now.some((each) => each.id === id);
          const was = opened.current;
          const target =
            typeof asked === 'string' ? asked : was?.kind === 'wechart' ? was.id : undefined;
          if (target !== undefined && listed(target)) return;
          if (was?.kind === 'wechart' && !listed(was.id)) setSelected(null);
          setLost(true);
        })();
      }),
    [client],
  );
  /**
   * Below 1,024 px the pane is a sheet over the list (design 16, G8): opened,
   * it takes focus at its head; its × gives focus back to the row (rule 85).
   */
  useEffect(() => {
    const narrow =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(max-width: 1023.98px)').matches;
    if (selected !== null && narrow)
      document.querySelector<HTMLElement>('.schedules__pane .admin-pane__title')?.focus();
  }, [selected]);
  const backToList = (
    <button
      type="button"
      className="btn-ghost btn-sm admin-pane__close"
      aria-label="Back to the list"
      onClick={() => {
        const was = selected;
        setSelected(null);
        if (was !== null && was.kind !== 'new')
          requestAnimationFrame(() => {
            document
              .querySelector<HTMLElement>(
                was.kind === 'wechart'
                  ? `tr[data-schedule-id=${JSON.stringify(was.id)}]`
                  : `tr[data-key-id=${JSON.stringify(was.id)}]`,
              )
              ?.focus();
          });
      }}
    >
      ×
    </button>
  );
  // Whose schedules are listed (T557, AC-397; design 16, P4).
  const [owner, setOwner] = useState<ShownOwner>('all');
  // In which state (T558; the user's answer, R66): Jobs' "1 suspended schedule" opens it.
  const [state, setState] = useState(scheduleStateOfUrl);
  // In which folder, as every Jobs tab (T559, AC-297; design 16, pin 3).
  const [folderChoice, setFolderChoice] = useState<FolderChoice>(EVERY_FOLDER);
  const folders = useJobsFolders();
  // What Search schedules holds (T610; design 16, screen 2).
  const [search, setSearch] = useState('');
  const now = new Date();
  const keys = schedules.data ?? [];
  const own = wechart.data ?? [];
  const lists = (of: 'cube' | 'wechart') => owner === 'all' || owner === of;
  const inChosenFolder = (folderId: string | null | undefined) =>
    inFolder(folderId, folderChoice, folders.data?.folders ?? []);
  /** Whether any of a row's words holds what was searched: its rollup, its folder, its name (T610). */
  const sought = search.trim().toLowerCase();
  const found = (...words: (string | undefined)[]) =>
    sought === '' ||
    words.some((each) => each !== undefined && each.toLowerCase().includes(sought));
  /**
   * Whether a wechart schedule is in the chosen state, as its row reads it:
   * one paused and suspended reads Suspended (T558's review), in the chosen
   * folder (T559), and found by what was searched (T610). Every one at Any.
   */
  const inState = (each: WechartSchedule) => {
    const shownAs = shownOf({
      id: each.preAggregation,
      ...(each.shortName === undefined ? {} : { shortName: each.shortName }),
      ...(each.folderPath === undefined ? {} : { folderPath: each.folderPath }),
    });
    return (
      inChosenFolder(each.folderId) &&
      found(each.name, shownAs.name, shownAs.folder ?? 'Shared') &&
      (state === '' ||
        (state === 'suspended'
          ? each.suspendedAt !== null
          : state === 'paused'
            ? each.pausedAt !== null && each.suspendedAt === null
            : each.suspendedAt === null && each.pausedAt === null))
    );
  };
  /** Whether a refresh key is listed: a state is a wechart schedule's, so at Any only, in the chosen folder. */
  const keyListed = (key: Schedule) =>
    state === '' &&
    inChosenFolder(key.folderId) &&
    found(shownOf(key).name, shownOf(key).folder ?? 'Shared');
  const keysListed = keys.filter(keyListed);
  const ownListed = own.filter(inState);
  const pane: ReactNode = (() => {
    if (selected === null) return null;
    if (selected.kind === 'new')
      return (
        <>
          <div className="admin-pane__head">
            {backToList}
            <h2 className="admin-pane__title" tabIndex={-1}>
              New schedule
            </h2>
          </div>
          <ScheduleForm
            refreshKeys={keys}
            onCancel={() => {
              setSelected(null);
            }}
            onSaved={(saved) => {
              setSelected({ kind: 'wechart', id: saved.id, held: saved });
            }}
          />
        </>
      );
    if (selected.kind === 'wechart') {
      const found = own.find((each) => each.id === selected.id) ?? selected.held;
      return found === undefined ? null : (
        <WechartPane
          // Each schedule's pane its own: nothing said on one stays on another's.
          key={found.id}
          schedule={found}
          refreshKeys={keys}
          onDeleted={() => {
            setSelected(null);
          }}
          back={backToList}
        />
      );
    }
    const found = keys.find((each) => each.id === selected.id);
    return found === undefined ? null : (
      <SchedulePane schedule={found} now={now} back={backToList} />
    );
  })();
  /** wechart's schedules each after its rollup's refresh key, and those of rollups with none, last. */
  const placed = new Set<string>();
  const ownOf = (id: string) => {
    const of = own.filter((each) => each.preAggregation === id);
    for (const each of of) placed.add(each.id);
    return of;
  };
  const isSelected = (kind: 'cube' | 'wechart', id: string) =>
    selected !== null && selected.kind === kind && selected.id === id;

  // Schedules to one who writes no folder reads as the app's Not found page (G6, rule 67; T610).
  if (neverTheirs(folders)) return <NotFound />;
  // The last read-write folder gone while the page is open (G5b; T610).
  if (noFolderLeft(schedules) || noFolderLeft(wechart))
    return (
      <div className="admin-page">
        <div className="admin-page__main">
          <div className="schedules__head">
            <h1 className="workspace-title">Schedules</h1>
          </div>
          <NoFolderLeft page="Schedules" />
        </div>
      </div>
    );

  return (
    <div className={pane === null ? 'admin-page' : 'admin-page admin-page--docked'}>
      <div className="admin-page__main">
        <div className="schedules__head">
          <h1 className="workspace-title">Schedules</h1>
          {/* For those who may use Schedules: the page is theirs (pin 1, AC-297). */}
          {schedules.isSuccess || wechart.isSuccess ? (
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                setSelected({ kind: 'new' });
              }}
            >
              New schedule
            </button>
          ) : null}
        </div>
        {/* Who runs each kind of schedule, and where each is changed (pin 2;
            R40.2, R42.3), with no word of phases (T466, UX-111). */}
        <InfoBar>
          <p>
            Cube’s refresh worker rebuilds each pre-aggregation on its refresh key, which is part of
            the model: to change one, edit the model in My workspace and propose it. wechart’s own
            schedules are made here. They build pre-aggregations at times a refresh key can’t
            express, and need no proposal.
          </p>
        </InfoBar>
        {/* For a read-write member: their folders only (design 16, state H3). */}
        <ScopeNote folders={folders.data}>
          Showing schedules of pre-aggregations in the folders where you have read-write access.
        </ScopeNote>
        {/* Each list read apart, and said where it couldn't be: wechart's
            schedules are listed without Cube, and a refresh key's without
            wechart's (T552's review); one refusal said once. Couldn't be
            read, with Retry and Details (design 16, G2); a refusal in the
            API's words (G4; T560). */}
        {schedules.isError ? (
          <ListError
            what="the schedules"
            error={schedules.error}
            onRetry={() => void schedules.refetch()}
          />
        ) : null}
        {wechart.isError && wechart.error.message !== schedules.error?.message ? (
          <ListError
            what="wechart’s schedules"
            error={wechart.error}
            onRetry={() => void wechart.refetch()}
          />
        ) : null}
        {schedules.isPending ? (
          // Skeleton rows while they're read, under the list's heads (G1; T610).
          <ListLoading
            said="Reading the schedules…"
            label="Refresh schedules"
            columns={['Pre-aggregation', 'Folder', 'Schedule', 'Next run', 'Last run', 'Owner']}
            narrow={['Folder', 'Schedule', 'Last run']}
          />
        ) : keys.length === 0 && own.length === 0 ? (
          schedules.isSuccess ? (
            // Nothing in their folders yet (G3).
            <ListEmpty title="No pre-aggregations in your folders">
              None of the models in the folders where you have read-write access defines one yet.
              Add one to a model in My workspace and propose it.
            </ListEmpty>
          ) : null
        ) : (
          <>
            {/* Each owner's count is the rows its choice lists, in the folders
                the API answers for this user (pin 4). */}
            {/* With Pre-aggregations' filter row's styles: Search as tall as its pills (T610's review). */}
            <div className="schedules__filters sources-filters">
              {/* The Folder filter first, as screen 2 draws it (pin 3). */}
              <FolderFilter
                folders={folders.data}
                choice={folderChoice}
                onChange={setFolderChoice}
              />
              <OwnerFilter
                owner={owner}
                counts={{
                  all: keysListed.length + ownListed.length,
                  cube: keysListed.length,
                  wechart: ownListed.length,
                }}
                onChange={setOwner}
              />
              {/* Search schedules, after the owner filter (screen 2; T610). */}
              <input
                type="search"
                className="sources-filters__search"
                aria-label="Search schedules"
                placeholder="Search schedules"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                }}
              />
              <ChoicePill
                label="State"
                choices={[['', 'Any'], ...SCHEDULE_STATES]}
                value={state}
                onChange={setState}
              />
            </div>
            <TableScroll label="Refresh schedules">
              <table className="query-log" aria-label="Refresh schedules">
                <thead>
                  <tr>
                    {['Pre-aggregation', 'Folder', 'Schedule', 'Next run', 'Last run', 'Owner'].map(
                      (column) => (
                        // Below 1,024 px: name, next run and owner (design 16, G8).
                        <th
                          key={column}
                          scope="col"
                          className={
                            ['Folder', 'Schedule', 'Last run'].includes(column)
                              ? 'jobs-wide'
                              : undefined
                          }
                        >
                          {column}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {keys.flatMap((schedule) => {
                    const shownAs = shownOf(schedule);
                    const icon = ICONS[schedule.kind];
                    const open = () => {
                      setSelected({ kind: 'cube', id: schedule.id });
                    };
                    // Read whichever owner is listed, so wechart's keep their places (T557).
                    const itsOwn = ownOf(schedule.id);
                    return [
                      ...(lists('cube') && keyListed(schedule)
                        ? [
                            <tr
                              key={schedule.id}
                              // The sheet's × gives focus back to it (G8).
                              data-key-id={schedule.id}
                              // A row opens its pane (D5): by pointer, or Enter or Space on it.
                              aria-selected={isSelected('cube', schedule.id)}
                              tabIndex={0}
                              className="build-panel__row"
                              onClick={open}
                              onKeyDown={(event) => {
                                if (event.target !== event.currentTarget) return;
                                if (event.key !== 'Enter' && event.key !== ' ') return;
                                event.preventDefault();
                                open();
                              }}
                            >
                              <td className="query-log__query">
                                <span data-testid="schedule-name">{shownAs.name}</span>
                              </td>
                              <td className="jobs-wide">{shownAs.folder ?? 'Shared'}</td>
                              <td className="jobs-wide">
                                <span
                                  className={
                                    icon === undefined ? undefined : `status status--${icon}`
                                  }
                                >
                                  {icon === undefined ? null : <StatusIcon kind={icon} />}
                                  {schedule.when}
                                </span>
                                <code className="schedules__sub">{schedule.written}</code>
                              </td>
                              <td>
                                <NextRun schedule={schedule} now={now} />
                              </td>
                              <td className="jobs-wide">
                                <LastRun schedule={schedule} />
                              </td>
                              <td>
                                <OwnerLabel owner={schedule.owner} />
                              </td>
                            </tr>,
                          ]
                        : []),
                      // A rollup with both kinds has two rows: wechart's after its refresh key's (pin 5).
                      ...(lists('wechart') ? itsOwn.filter(inState) : []).map((each) => (
                        <WechartRow
                          key={`wechart-${each.id}`}
                          schedule={each}
                          now={now}
                          selected={isSelected('wechart', each.id)}
                          onSelect={() => {
                            setSelected({ kind: 'wechart', id: each.id });
                          }}
                        />
                      )),
                    ];
                  })}
                  {own
                    .filter((each) => lists('wechart') && inState(each) && !placed.has(each.id))
                    .map((each) => (
                      <WechartRow
                        key={`wechart-${each.id}`}
                        schedule={each}
                        now={now}
                        selected={isSelected('wechart', each.id)}
                        onSelect={() => {
                          setSelected({ kind: 'wechart', id: each.id });
                        }}
                      />
                    ))}
                </tbody>
              </table>
            </TableScroll>
            {/* What Last run means for a refresh key (design 16, screen 2's foot). */}
            <p className="jobs-foot">
              Times are your local time unless a schedule names its own zone. For a refresh key,
              Last run is when Cube last built the rollup; who started it and how it ended aren’t
              recorded yet, until the refresh worker’s history is.
            </p>
          </>
        )}
      </div>
      {pane === null ? null : (
        <aside className="admin-pane schedules__pane" aria-label="Schedule details">
          {pane}
        </aside>
      )}
      {/* Access lost while the page was open (design 16, G5; T560). */}
      <ExportedToast
        message={lost ? ACCESS_LOST : ''}
        kind="err"
        onDismiss={() => {
          setLost(false);
        }}
      />
    </div>
  );
}
