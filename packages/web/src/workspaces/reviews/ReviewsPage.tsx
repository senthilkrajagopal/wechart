import { useQuery } from '@tanstack/react-query';
import { useEffect, useId, useRef } from 'react';

import { StateLine, StatusIcon } from '../../shell/StatusIcon';
import { TableScroll } from '../../shell/TableScroll';
import { onTabKey } from '../../shell/tabKeys';
import { CalcRequestSummary, CalcRequestsPanel } from './CalcRequestsPanel';
import {
  folderText,
  includesText,
  KIND_ICON,
  KIND_LABEL,
  proposedText,
  REVIEWS_QUERY,
  statusOf,
  type ReviewRow,
} from './reviews';

/**
 * The Reviews page (T355, AC-287; design 05 of 2026-09-27, states D and E;
 * rule 76): a list and an inspector, as AC-228 lays out Jobs and Security.
 * "To review" holds every open proposal the user may decide, theirs marked
 * "Yours"; "My proposals" holds theirs in every state. The inspector
 * summarises the one chosen. Approve and Reject are only in the review view
 * (T356, principle 9), never here.
 *
 * The tab and the proposal chosen live in the address, so a reload keeps them.
 */
export type ReviewsTab = 'to-review' | 'mine' | 'requests';

export interface ReviewsView {
  readonly tab: ReviewsTab;
  readonly selected?: string | undefined;
}

export function ReviewsPage({
  view,
  onView,
  now = new Date(),
}: {
  readonly view: ReviewsView;
  readonly onView: (next: ReviewsView) => void;
  readonly now?: Date;
}) {
  const ids = useId();
  const lists = useQuery(REVIEWS_QUERY);
  const rows = (view.tab === 'to-review' ? lists.data?.toReview : lists.data?.mine) ?? [];
  const chosen = rows.find((row) => row.id === view.selected);
  // Closed, the summary hands focus back to the row it was opened from, so a
  // keyboard user keeps their place (T355's review; the audit trail's way).
  const itemButtons = useRef(new Map<string, HTMLButtonElement>());
  const refocus = useRef<string | null>(null);
  useEffect(() => {
    if (view.selected !== undefined || refocus.current === null) return;
    itemButtons.current.get(refocus.current)?.focus();
    refocus.current = null;
  }, [view.selected]);
  const tabs: [ReviewsTab, string, number | undefined][] = [
    // No count at 0, as the top bar's pill hides it (state C; security-Q5, T699).
    ['to-review', 'To review', lists.data?.toReview.length || undefined],
    ['mine', 'My proposals', undefined],
    // Asked of the folders the user may change (T383, AC-050).
    ['requests', 'Calculation requests', undefined],
  ];

  return (
    <div className="reviews">
      <div className="reviews__list">
        <h1 className="workspace-title">Reviews</h1>
        <div role="tablist" aria-label="Reviews" className="edit-sidebar__tabs reviews__tabs">
          {tabs.map(([tab, label, count]) => (
            <button
              key={tab}
              type="button"
              role="tab"
              id={`${ids}-tab-${tab}`}
              aria-selected={view.tab === tab}
              aria-controls={`${ids}-panel`}
              tabIndex={view.tab === tab ? 0 : -1}
              // Its own tab again keeps what is chosen (T355's review).
              onClick={() => {
                if (tab !== view.tab) onView({ tab });
              }}
              onKeyDown={(event) => onTabKey(event, (index) => onView({ tab: tabs[index]![0] }))}
            >
              {label}
              {count === undefined ? null : (
                <>
                  {' '}
                  <span className="reviews__tab-count">{count}</span>
                </>
              )}
            </button>
          ))}
        </div>

        <div id={`${ids}-panel`} role="tabpanel" aria-labelledby={`${ids}-tab-${view.tab}`}>
          {view.tab === 'requests' ? (
            <CalcRequestsPanel
              selected={view.selected}
              onSelect={(selected) => {
                onView({ tab: 'requests', selected });
              }}
              summaryId={`${ids}-summary`}
              now={now}
            />
          ) : lists.isError ? (
            <StateLine kind="err" role="alert">
              {lists.error.message}
            </StateLine>
          ) : lists.data === undefined ? (
            <StateLine kind="run">Reading the proposals…</StateLine>
          ) : rows.length === 0 ? (
            <p className="reviews__none">
              {view.tab === 'to-review'
                ? 'Nothing is waiting for you to review.'
                : 'You haven’t proposed anything yet. Proposals start from items in My workspace.'}
            </p>
          ) : (
            <TableScroll label={view.tab === 'to-review' ? 'To review' : 'My proposals'}>
              <table
                className="query-log reviews__table"
                aria-label={view.tab === 'to-review' ? 'To review' : 'My proposals'}
              >
                <thead>
                  <tr>
                    {(view.tab === 'to-review'
                      ? [
                          'Item',
                          'Kind',
                          'Target folder',
                          'Author',
                          'Proposed',
                          'Includes',
                          'Status',
                        ]
                      : ['Item', 'Target', 'Proposed', 'Status']
                    ).map((column) => (
                      <th key={column} scope="col">
                        {column}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const status = statusOf(row);
                    const open = row.id === view.selected;
                    return (
                      <tr key={row.id} className={open ? 'is-selected' : undefined}>
                        <td className="reviews__item-cell">
                          {/* Its kind's icon before its title, as state D draws it (T699, SEC-24). */}
                          <span
                            className={`itemicon ${KIND_ICON[row.kind].chip}`}
                            aria-hidden="true"
                          >
                            {KIND_ICON[row.kind].icon}
                          </span>
                          <button
                            type="button"
                            ref={(button) => {
                              if (button === null) itemButtons.current.delete(row.id);
                              else itemButtons.current.set(row.id, button);
                            }}
                            className="link-button reviews__item"
                            aria-expanded={open}
                            {...(open ? { 'aria-controls': `${ids}-summary` } : {})}
                            onClick={() =>
                              onView({ tab: view.tab, selected: open ? undefined : row.id })
                            }
                          >
                            {row.title}
                          </button>
                          {view.tab === 'to-review' && row.yours ? (
                            <span className="reviews__yours">Yours</span>
                          ) : null}
                        </td>
                        {view.tab === 'to-review' ? (
                          <>
                            <td>{KIND_LABEL[row.kind]}</td>
                            <td>{folderText(row.targetPath)}</td>
                            <td>{row.author.name}</td>
                          </>
                        ) : (
                          <td>{folderText(row.targetPath)}</td>
                        )}
                        <td>
                          <time dateTime={row.proposedAt}>{proposedText(row.proposedAt, now)}</time>
                        </td>
                        {view.tab === 'to-review' ? <td>{includesText(row.includes)}</td> : null}
                        <td>
                          <span className="reviews__status">
                            <StatusIcon kind={status.kind} />
                            <span>{status.text}</span>
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableScroll>
          )}
        </div>
      </div>

      {view.tab === 'requests' ? (
        // Beside the list, as a proposal's summary is (design 05; T383's review).
        <CalcRequestSummary
          id={`${ids}-summary`}
          selected={view.selected}
          now={now}
          onClose={() => {
            onView({ tab: 'requests' });
          }}
        />
      ) : chosen === undefined ? null : (
        <Summary
          id={`${ids}-summary`}
          row={chosen}
          now={now}
          onClose={() => {
            refocus.current = chosen.id;
            onView({ tab: view.tab });
          }}
        />
      )}
    </div>
  );
}

/** Where it goes and what it replaces, as design 05's inspector says it. */
function whereOf(row: ReviewRow): string {
  const includes = includesText(row.includes);
  return [
    `${KIND_LABEL[row.kind]} → ${folderText(row.targetPath)}`,
    row.replaces === null
      ? 'new in this folder'
      : `replaces version ${String(row.replaces.version)}`,
    ...(includes === '' ? [] : [`with ${includes}`]),
  ].join(' · ');
}

function Summary({
  id,
  row,
  now,
  onClose,
}: {
  id: string;
  row: ReviewRow;
  now: Date;
  onClose: () => void;
}) {
  // Focus to the summary as it opens, since it follows the whole table.
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), [row.id]);
  // Escape within it closes it (T355's review).
  const box = useRef<HTMLElement>(null);
  const closing = useRef(onClose);
  useEffect(() => {
    closing.current = onClose;
  }, [onClose]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && box.current?.contains(event.target as Node)) closing.current();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);
  const status = statusOf(row);
  return (
    <section id={id} ref={box} className="admin-pane reviews__summary" aria-label={row.title}>
      <header className="reviews__summary-head">
        {/* Its kind's icon, as state D's inspector heads it (T699, SEC-23). */}
        <span className={`itemicon ${KIND_ICON[row.kind].chip}`} aria-hidden="true">
          {KIND_ICON[row.kind].icon}
        </span>
        <h2 ref={heading} tabIndex={-1}>
          {row.title}
        </h2>
        <button
          type="button"
          className="btn-ghost btn-sm"
          aria-label="Close the summary"
          onClick={onClose}
        >
          ×
        </button>
      </header>
      <p className="reviews__where" data-testid="review-where">
        {whereOf(row)}
      </p>
      {/* Proposed by and What changed as sections, Open review last, as state D draws it (T699, SEC-23). */}
      <h3 className="reviews__label">Proposed by</h3>
      <p className="reviews__by" data-testid="review-by">
        {row.author.name} · {proposedText(row.proposedAt, now)}
      </p>
      <h3 className="reviews__label">What changed</h3>
      <p
        className={`reviews__description${row.description === null ? ' is-empty' : ''}`}
        data-testid="review-description"
      >
        {row.description ?? 'No description'}
      </p>
      {row.status === 'open' ? null : (
        <>
          <p className="reviews__decision" data-testid="review-decision">
            <StatusIcon kind={status.kind} />
            <span>
              {row.decision === null
                ? status.text
                : `${status.text} · ${proposedText(row.decision.at, now)}`}
            </span>
          </p>
          {row.status === 'rejected' ? (
            <blockquote className="reviews__reason" data-testid="review-reason">
              {row.decision?.reason ?? 'No reason given'}
            </blockquote>
          ) : null}
        </>
      )}
      {/* The item itself, and Approve and Reject, are in its review view (T356). */}
      <div className="reviews__open">
        <a
          className={`btn btn-sm${row.status === 'open' ? ' btn-primary' : ''}`}
          href={`/reviews/${encodeURIComponent(row.id)}`}
        >
          {row.status === 'open' ? 'Open review' : 'Open'}
        </a>
      </div>
    </section>
  );
}
