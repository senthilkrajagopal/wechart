import { useQuery } from '@tanstack/react-query';
import { withMemberLabels } from '@wechart/core';
import { useMemo, useState } from 'react';

import { drawChartBody, ReadOnlyDashboard, specFor } from '../../dashboard/DashboardPage';
import { dashboardOf, type StoredDocument } from '../../dashboard/model/stored';
import { chartIdsOf } from '../../dashboard/model/document';
import { ReviewMarks } from '../../dashboard/grid/reviewMarks';
import { tileChangesOf } from './tileChanges';
import { measureTypesOf } from '../../editor/fields';
import { allMembers } from '../../filters/FilterBar';
import { formatsFrom, pickedWithFormats } from '../../dashboard/chartSpec';
import { metaQueryOf } from '../../query/meta';
import { StateLine, StatusIcon } from '../../shell/StatusIcon';
import { ChartTile } from '../../tiles/ChartTile';
import { TileError } from '../../tiles/TileError';
import { TileSkeleton } from '../../tiles/TileSkeleton';
import { DecisionPanel } from './DecisionPanel';
import {
  clockText,
  momentText,
  proposalQuery,
  shownItems,
  type ProposalDetail,
  type ProposalItem,
} from './review';
import { folderText, KIND_ICON, KIND_LABEL, REVIEWS_QUERY } from './reviews';
import { SettingsDiff } from './SettingsDiff';
import { YamlDiff } from './YamlDiff';

/** A fixed-width dashboard's page width, as `.dashboard-page[data-width='fixed']` draws it. */
const FIXED_WIDTH = 1440;

/** "WW" for Wren Writer: the avatar's letters (design 05, pin 5). */
function initialsOf(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .filter((word) => word !== '');
  return words
    .slice(0, 2)
    .map((word) => word[0]!.toUpperCase())
    .join('');
}

/**
 * A side panel's control (T544, AC-390): a button that says, by
 * `aria-expanded`, whether its panel is open, and stays on its rail when the
 * panel is collapsed. The panel stays mounted, hidden, so what is under way
 * in it — a reason typed, Approve's question — survives a collapse.
 */
function PanelToggle({
  label,
  open,
  side,
  controls,
  onToggle,
}: {
  readonly label: string;
  readonly open: boolean;
  /** Which edge the panel is on: its chevron points the way it folds. */
  readonly side: 'start' | 'end';
  readonly controls: string;
  readonly onToggle: () => void;
}) {
  const folds = side === 'start' ? (open ? '«' : '»') : open ? '»' : '«';
  return (
    <button
      type="button"
      className="btn-ghost btn-sm review-view__toggle"
      aria-label={label}
      aria-expanded={open}
      aria-controls={controls}
      title={open ? `Collapse ${label.toLowerCase()}` : `Expand ${label.toLowerCase()}`}
      onClick={onToggle}
    >
      <span aria-hidden="true">{folds}</span>
    </button>
  );
}

/**
 * A proposal's review view (T356, AC-286, AC-288; design 05's main screen,
 * states G–L; references.md surface 6; rules 77–79, 85; principle 9): the
 * reviewer decides on the thing itself.
 * - The head: back to Reviews, what it is and where it goes, its state, and
 *   where it is in the queue, with Previous and Next.
 * - What is in it: the item, and what goes with it, each new or replacing a
 *   version, with why they go together (a dashboard's own charts are part of
 *   it).
 * - The item drawn: a dashboard or chart read-only, Proposed or Current, as
 *   readers in the folder would see it; a data source's settings beside the
 *   folder's; a model's YAML against the folder's file (T350, state G).
 * - The inspector: who, when, what they said, what it replaces where, and
 *   Approve and Reject, only here.
 */
export function ReviewView({
  proposalId,
  onOpen,
  now = new Date(),
}: {
  readonly proposalId: string;
  /** Open another proposal's review: Previous and Next. */
  readonly onOpen: (id: string) => void;
  readonly now?: Date;
}) {
  const detail = useQuery(proposalQuery(proposalId));
  const lists = useQuery({ ...REVIEWS_QUERY, retry: false });
  const [said, setSaid] = useState('');
  const [chosen, setChosen] = useState<string | undefined>(undefined);
  // Each side panel open or collapsed (T544, AC-390): open as each review opens.
  const [itemsOpen, setItemsOpen] = useState(true);
  const [aboutOpen, setAboutOpen] = useState(true);

  if (detail.isPending) return <StateLine kind="run">Opening the proposal…</StateLine>;
  if (detail.isError)
    return (
      <StateLine kind="err" testId="review-error">
        {detail.error.message}
      </StateLine>
    );
  const proposal = detail.data;
  const items = shownItems(proposal);
  const item = items.find((each) => `${each.kind}:${each.id}` === chosen) ?? items[0];
  const queue = lists.data?.toReview.map((row) => row.id) ?? [];
  const at = queue.indexOf(proposal.id);
  const folder = folderText(proposal.targetPath);
  // The version it was based on, and the folder's now, where they differ.
  const first = items[0];
  const movedOn =
    proposal.status === 'open' &&
    first?.replaces != null &&
    first.replacesNow != null &&
    first.replacesNow !== first.replaces.version
      ? { was: first.replaces.version, now: first.replacesNow }
      : undefined;

  return (
    <section className="review-view" aria-labelledby={`review-${proposal.id}`}>
      <header className="review-view__head">
        <a
          className="btn-ghost btn-sm"
          // Back to its row (pin 1): in To review while it waits for this
          // user's decision, else in My proposals (T356's review).
          href={`/reviews?${proposal.status === 'open' && proposal.mayApprove ? '' : 'tab=mine&'}selected=${encodeURIComponent(proposal.id)}`}
        >
          ← Reviews
        </a>
        <span className="review-view__divider" aria-hidden="true" />
        <span className={`itemicon ${KIND_ICON[proposal.kind].chip}`} aria-hidden="true">
          {KIND_ICON[proposal.kind].icon}
        </span>
        <h1 id={`review-${proposal.id}`} className="review-view__title">
          Review · {proposal.title} <span className="review-view__arrow">→</span> {folder}
        </h1>
        <StateOf proposal={proposal} />
        <span className="review-view__spacer" />
        {at === -1 ? null : (
          <span className="review-view__queue" data-testid="review-queue">
            <span>
              {at + 1} of {queue.length}
            </span>
            <button
              type="button"
              className="btn btn-sm"
              disabled={at === 0}
              onClick={() => {
                onOpen(queue[at - 1]!);
              }}
            >
              Previous
            </button>
            <button
              type="button"
              className="btn btn-sm"
              disabled={at === queue.length - 1}
              onClick={() => {
                onOpen(queue[at + 1]!);
              }}
            >
              Next
            </button>
          </span>
        )}
      </header>

      {said === '' ? null : (
        <StateLine kind="ok" testId="review-said">
          {said}
        </StateLine>
      )}

      <div
        className={`review-view__body${itemsOpen ? '' : ' is-items-collapsed'}${aboutOpen ? '' : ' is-about-collapsed'}`}
      >
        {/* Each side panel collapses to a rail keeping its control (T544, AC-390). */}
        <div className="review-view__side review-view__side--items">
          <PanelToggle
            label="Proposal items"
            open={itemsOpen}
            side="start"
            controls={`review-items-panel-${proposal.id}`}
            onToggle={() => {
              setItemsOpen(!itemsOpen);
            }}
          />
          <nav
            id={`review-items-panel-${proposal.id}`}
            className="review-view__items"
            aria-labelledby={`review-items-${proposal.id}`}
            hidden={!itemsOpen}
          >
            <h2 id={`review-items-${proposal.id}`}>In this proposal</h2>
            <ul aria-labelledby={`review-items-${proposal.id}`}>
              {items.map((each) => (
                <li key={`${each.kind}:${each.id}`}>
                  <button
                    type="button"
                    className="review-view__item"
                    aria-current={each === item ? 'true' : undefined}
                    onClick={() => {
                      setChosen(`${each.kind}:${each.id}`);
                    }}
                  >
                    <span className={`itemicon ${KIND_ICON[each.kind].chip}`} aria-hidden="true">
                      {KIND_ICON[each.kind].icon}
                    </span>
                    <span className="review-view__item-text">
                      <span className="review-view__item-title">{each.title}</span>
                      <span className="review-view__item-what">
                        {KIND_LABEL[each.kind]} · {doesText(each, proposal.targetPath)}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {items.length > 1 ? (
              <p className="review-view__note" data-testid="review-bundle">
                <StatusIcon kind="info" />
                <span>{bundleText(proposal.kind, items)}</span>
              </p>
            ) : null}
          </nav>
        </div>

        <div className="review-view__item-pane">
          {item === undefined ? null : (
            <ItemPreview key={`${item.kind}:${item.id}`} proposal={proposal} item={item} />
          )}
        </div>

        <div className="review-view__side review-view__side--about">
          <PanelToggle
            label="About this proposal"
            open={aboutOpen}
            side="end"
            controls={`review-about-${proposal.id}`}
            onToggle={() => {
              setAboutOpen(!aboutOpen);
            }}
          />
          <aside
            id={`review-about-${proposal.id}`}
            className="review-view__inspector"
            aria-label="About this proposal"
            hidden={!aboutOpen}
          >
            <section className="review-view__sect">
              <h2>Proposed by</h2>
              <div className="review-view__author">
                <span className="review-view__avatar" aria-hidden="true">
                  {initialsOf(proposal.author.name)}
                </span>
                <p data-testid="review-author">
                  {/* The name, then the time on a line of its own (pin 5; T699, SEC-26). */}
                  <span className="review-view__author-name">{proposal.author.name}</span>
                  <span className="review-view__author-when">
                    {momentText(proposal.proposedAt, now)}
                  </span>
                </p>
              </div>
            </section>
            <section className="review-view__sect">
              <h2>What changed</h2>
              <p
                className={`reviews__description${proposal.description === null ? ' is-empty' : ''}`}
                data-testid="review-description"
              >
                {proposal.description ?? 'No description'}
              </p>
            </section>
            <section className="review-view__sect">
              <h2>In {folder}</h2>
              <p data-testid="review-replaces">
                {proposal.replaces === null
                  ? 'New in this folder'
                  : `Replaces version ${String(proposal.replaces.version)}`}
              </p>
              {proposal.replaces !== null && !proposal.replaces.copiedFrom ? (
                <p className="review-view__note is-warn" role="note">
                  <StatusIcon kind="warn" />
                  <span>
                    It wasn’t copied from that version: it was made new in the author’s workspace.
                  </span>
                </p>
              ) : null}
              {/* The folder moved on since (pin 6): said, never blocking. */}
              {movedOn === undefined ? null : (
                <p className="review-view__note" data-testid="review-moved-on">
                  <StatusIcon kind="info" />
                  <span>
                    Based on version {movedOn.was}; the folder now has version {movedOn.now}.
                    Approving replaces version {movedOn.now}, which stays in History.
                  </span>
                </p>
              )}
            </section>
            {/* The publish check, before Approve (pin 7; T451, AC-321): its
                models were checked by the dry run when proposed, or it
                wouldn't have been; Approve runs it again. */}
            {proposal.status === 'open' && proposal.items.some((each) => each.kind === 'model') ? (
              <section className="review-view__sect" aria-label="Publish check">
                <h2>Publish check</h2>
                <StateLine kind="ok">
                  Every affected module compiled · {clockText(proposal.proposedAt)}
                </StateLine>
                <p className="review-view__help">Checked again when you approve.</p>
              </section>
            ) : null}
            {proposal.status === 'open' ? (
              <DecisionPanel proposal={proposal} onDecided={setSaid} />
            ) : (
              <section className="review-view__sect">
                <p className="reviews__decision" data-testid="review-decision">
                  {decisionText(proposal, now)}
                </p>
                {proposal.status === 'rejected' || proposal.status === 'withdrawn' ? (
                  <blockquote className="reviews__reason">
                    {proposal.decision?.reason ?? 'No reason given'}
                  </blockquote>
                ) : null}
              </section>
            )}
          </aside>
        </div>
      </div>
      <span hidden>{now.toISOString()}</span>
    </section>
  );
}

function StateOf({ proposal }: { readonly proposal: ProposalDetail }) {
  const [kind, text] =
    proposal.status === 'open'
      ? (['idle', 'Waiting for review'] as const)
      : proposal.status === 'approved'
        ? (['ok', 'Approved'] as const)
        : proposal.status === 'rejected'
          ? (['err', 'Rejected'] as const)
          : (['idle', 'Withdrawn'] as const);
  return (
    <span className="reviews__status">
      <StatusIcon kind={kind} />
      <span>{text}</span>
    </span>
  );
}

const decisionText = (proposal: ProposalDetail, now: Date) => {
  const word =
    proposal.status === 'approved'
      ? 'Approved'
      : proposal.status === 'rejected'
        ? 'Rejected'
        : 'Withdrawn';
  return proposal.decision === null
    ? word
    : `${word} by ${proposal.decision.by.name} · ${momentText(proposal.decision.at, now)}`;
};

/**
 * Why the rest goes with the item (AC-285; design 05's main screen): the
 * charts it shows from the author's workspace, and the models its cubes
 * resolve through, which only that workspace has.
 */
function bundleText(kind: ProposalDetail['kind'], items: readonly ProposalItem[]): string {
  const [first, ...rest] = items;
  const models = rest.filter((each) => each.kind === 'model');
  const word = KIND_LABEL[kind].toLowerCase();
  const together = 'They’re approved or rejected together.';
  if (models.length === 0)
    return `These go with the ${word}, which shows them from the author’s workspace. ${together}`;
  const named = models.map((each) => each.title);
  const list =
    named.length === 1 ? named[0]! : `${named.slice(0, -1).join(', ')} and ${named.at(-1)!}`;
  const others = rest.length - models.length;
  const charts =
    others === 0
      ? ''
      : others === 1
        ? 'The chart it shows from the author’s workspace goes with it. '
        : 'The charts it shows from the author’s workspace go with it. ';
  const why =
    first?.kind === 'model'
      ? `it names the author’s ${list}`
      : `its cubes resolve only through the author’s ${list}`;
  return `${charts}${models.length === 1 ? 'The model goes' : 'The models go'} with the ${word}: ${why}. ${together}`;
}

const sameFolder = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((part, at) => part === b[at]);

/** "replaces version 7", or "new in Sales": where it lands, when not the target. */
function doesText(item: ProposalItem, targetPath: readonly string[]): string {
  const elsewhere = sameFolder(item.landsInPath, targetPath)
    ? ''
    : ` in ${folderText(item.landsInPath)}`;
  return item.replaces === null
    ? `new${elsewhere === '' ? ' in this folder' : elsewhere}`
    : `replaces version ${String(item.replaces.version)}${elsewhere}`;
}

/** The item itself, drawn read-only: Proposed, or the folder's Current. */
function ItemPreview({
  proposal,
  item,
}: {
  readonly proposal: ProposalDetail;
  readonly item: ProposalItem;
}) {
  const [showing, setShowing] = useState<'proposed' | 'current'>('proposed');
  const [size, setSize] = useState<'fit' | 'actual'>('fit');
  const open = proposal.status === 'open';
  /**
   * What the folder has now, set against it while it waits: once decided,
   * what it replaced may be what it landed as (T356's review), so it is
   * shown as proposed, alone.
   */
  const against =
    open && item.replaces !== null && item.replacesNow !== null ? item.replaces : null;
  const nowVersion = item.replacesNow ?? item.replaces?.version ?? 0;
  const current = useQuery({
    ...currentDrawnQuery(against?.id ?? ''),
    enabled: item.kind === 'dashboard' && against !== null,
  });
  // The charts it holds, and the folder's for the rest it shows.
  const held = useMemo(
    () =>
      Object.fromEntries(
        proposal.items
          .filter((each) => each.kind === 'chart')
          .map((each) => [each.id, each.snapshot]),
      ),
    [proposal.items],
  );
  // Each tile it changes or adds, against the folder's version (AC-341).
  const marks = useMemo(() => {
    if (item.kind !== 'dashboard' || !open) return {};
    if (against === null) return tileChangesOf({ body: item.snapshot, charts: held }, undefined);
    if (current.data === undefined) return {};
    return tileChangesOf(
      { body: item.snapshot, charts: { ...current.data.charts, ...held } },
      current.data,
    );
  }, [item.kind, item.snapshot, open, against, held, current.data]);

  if (item.kind === 'data-source')
    return <SettingsDiff item={item} alone={!open} testable={open && proposal.mayApprove} />;
  // A boundary set by its regions and key (T979, AC-628).
  if (item.kind === 'boundary-set')
    return (
      <div className="review-view__preview" data-testid="review-boundary-set">
        <p>
          {String(item.snapshot['regions'] ?? 0)} regions, keyed by “
          {String(item.snapshot['keyProperty'] ?? '')}”.
        </p>
      </div>
    );
  // A model's YAML against the folder's file now (T350; design 05, state G).
  if (item.kind === 'model') {
    const proposed = typeof item.snapshot['content'] === 'string' ? item.snapshot['content'] : '';
    return (
      <div className="review-view__preview">
        <YamlDiff
          path={item.title}
          proposed={proposed}
          {...(!open || (item.replaces !== null && item.current === undefined)
            ? // Decided, or the folder's file gone since: as proposed, alone.
              { asProposed: true }
            : item.current === undefined
              ? {}
              : { current: item.current.content, version: item.current.version })}
        />
      </div>
    );
  }
  const folder = folderText(item.landsInPath);
  const proposedDocument = dashboardOf({ body: item.snapshot } as StoredDocument);
  /**
   * The width its readers' page lays it out at: a fixed dashboard's 1,440 px,
   * as its page draws it; a fluid one's, this window's (T699).
   */
  const readersWidth =
    proposedDocument.settings.width === 'fixed' ? FIXED_WIDTH : window.innerWidth;
  return (
    <div className="review-view__preview">
      <div className="review-view__switch">
        {against === null ? null : (
          <div role="group" aria-label="Which version" className="seg">
            {(
              [
                ['proposed', 'Proposed'],
                ['current', `Current (version ${String(nowVersion)})`],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={showing === value}
                onClick={() => {
                  setShowing(value);
                }}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        <p className="review-view__read-only">
          {open
            ? `Drawn read-only, as readers in ${folder} would see it.`
            : 'As proposed, read-only.'}
        </p>
        {/* Fit, or Actual size: at the width its readers' page lays it out at (pin 3; T699, SEC-21). */}
        {item.kind === 'dashboard' ? (
          <div role="group" aria-label="Size" className="seg review-view__size">
            {(
              [
                ['fit', 'Fit'],
                ['actual', 'Actual size'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={size === value}
                onClick={() => {
                  setSize(value);
                }}
              >
                {label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {item.kind === 'dashboard' ? (
        <div className="review-view__canvas" data-size={size}>
          <div
            className="review-view__frame"
            style={size === 'actual' ? { width: `${String(readersWidth)}px` } : undefined}
          >
            {showing === 'current' && against !== null ? (
              <CurrentDashboard id={against.id} version={nowVersion} />
            ) : (
              <ReviewMarks.Provider value={marks}>
                <ReadOnlyDashboard
                  crumbs={false}
                  cacheKey={`proposal:${proposal.id}:${item.id}`}
                  dashboardId={item.id}
                  document={proposedDocument}
                  heldCharts={held}
                  // Its reviewer can't open the author's copy: its queries are for the proposal (T340).
                  item={{ kind: 'proposal', id: proposal.id }}
                />
              </ReviewMarks.Provider>
            )}
          </div>
        </div>
      ) : (
        <ChartPreview
          key={showing}
          // The proposed one's field list is the proposal's overlay's (T440,
          // AC-323); the folder's current one's, the model's.
          {...(showing === 'current' && against !== null ? {} : { proposalId: proposal.id })}
          cacheKey={
            showing === 'current' && against !== null
              ? `current:${against.id}:${String(nowVersion)}`
              : `proposal:${proposal.id}:${item.id}`
          }
          draw={() =>
            showing === 'current' && against !== null
              ? specFor(against.id)
              : // For the proposal, whose copy its reviewer can't open (T340, AC-268).
                drawChartBody(item.snapshot, undefined, undefined, {
                  kind: 'proposal',
                  id: proposal.id,
                })
          }
        />
      )}
    </div>
  );
}

/** The folder's dashboard now, and the charts it shows, as its readers read them. */
const currentDrawnQuery = (id: string) => ({
  queryKey: ['review-current', 'dashboard', id] as const,
  queryFn: async () => {
    const response = await fetch(`/api/documents/dashboard/${encodeURIComponent(id)}`);
    if (!response.ok)
      throw new Error(`The folder’s dashboard could not be read (${String(response.status)}).`);
    const stored = (await response.json()) as StoredDocument;
    const document = dashboardOf(stored);
    const charts: Record<string, unknown> = {};
    for (const chartId of chartIdsOf(document)) {
      const chart = await fetch(`/api/documents/chart/${encodeURIComponent(chartId)}`);
      if (chart.ok) charts[chartId] = ((await chart.json()) as { body: unknown }).body;
    }
    return { document, body: stored.body, charts };
  },
});

/** The folder's dashboard as it is now, read as its readers read it. */
function CurrentDashboard({ id, version }: { readonly id: string; readonly version: number }) {
  const stored = useQuery(currentDrawnQuery(id));
  if (stored.isPending) return <StateLine kind="run">Reading the folder’s version…</StateLine>;
  if (stored.isError) return <StateLine kind="err">{stored.error.message}</StateLine>;
  return (
    <ReadOnlyDashboard
      crumbs={false}
      cacheKey={`current:${id}:${String(version)}`}
      dashboardId={id}
      document={stored.data.document}
    />
  );
}

/** One chart drawn, with the model's formats and titles, as its own page draws it. */
function ChartPreview({
  cacheKey,
  draw,
  proposalId,
}: {
  readonly cacheKey: string;
  readonly draw: () => ReturnType<typeof drawChartBody>;
  /** The proposal it is drawn from: its field list is the proposal's (T440). */
  readonly proposalId?: string;
}) {
  const drawn = useQuery({ queryKey: ['review-chart', cacheKey], queryFn: draw });
  const meta = useQuery(
    metaQueryOf(
      proposalId === undefined ? undefined : { item: { kind: 'proposal', id: proposalId } },
    ),
  );
  const chart = drawn.data?.chart;
  const spec = chart !== undefined && 'spec' in chart ? chart.spec : undefined;
  const formatted = useMemo(
    () =>
      spec === undefined
        ? undefined
        : // A calculated measure keeps its calculation in its name (AC-048).
          withMemberLabels(
            // Picked with this model's formats, as a tile picks it (T510, R67).
            pickedWithFormats(
              spec,
              drawn.data?.document,
              meta.data === undefined ? undefined : formatsFrom(meta.data),
            ),
            {
              formats: formatsFrom(meta.data),
              titles: Object.fromEntries(
                allMembers(meta.data).map((member) => [member.name, member.title]),
              ),
              shortTitles: Object.fromEntries(
                allMembers(meta.data).map((member) => [member.name, member.shortTitle]),
              ),
              // A count's axis in whole numbers (T683, DSH-02).
              measureTypes: measureTypesOf(meta.data),
            },
          ),
    [spec, drawn.data?.document, meta.data],
  );
  if (drawn.isPending) return <TileSkeleton chartType="bar" height={360} />;
  if (drawn.isError) return <TileError error={drawn.error} onRetry={() => void drawn.refetch()} />;
  if (chart !== undefined && 'error' in chart)
    return <TileError error={chart.error} onRetry={() => void drawn.refetch()} />;
  return formatted === undefined ? null : (
    <div className="chart-page__tile">
      <ChartTile spec={formatted} height={360} />
    </div>
  );
}
