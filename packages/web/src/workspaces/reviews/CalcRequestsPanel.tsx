import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';

import { StateLine, StatusIcon, type StateKind } from '../../shell/StatusIcon';
import { TableScroll } from '../../shell/TableScroll';
import { openRequest } from '../model/RequestPane';
import {
  CALC_REQUESTS_QUERY,
  resolutionText,
  shortName,
  type CalcRequestRow,
} from './calcRequests';
import { folderText, proposedText } from './reviews';

/**
 * The Reviews page's "Calculation requests" (T383, AC-050): what has been
 * asked of the folders the user may change, as design 05's list and
 * inspector lay proposals out. A row opens the request beside the list
 * (`CalcRequestSummary`, which the page places as it places a proposal's).
 */
export function CalcRequestsPanel({
  selected,
  onSelect,
  summaryId,
  now = new Date(),
}: {
  readonly selected: string | undefined;
  readonly onSelect: (id: string | undefined) => void;
  /** The summary's id, which an open row controls. */
  readonly summaryId: string;
  readonly now?: Date;
}) {
  const listed = useQuery(CALC_REQUESTS_QUERY);
  const rows = listed.data ?? [];
  // Closed, the summary hands focus back to the row it was opened from.
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const before = useRef(selected);
  useEffect(() => {
    const was = before.current;
    before.current = selected;
    if (selected === undefined && was !== undefined) buttons.current.get(was)?.focus();
  }, [selected]);

  const list = listed.isError ? (
    <StateLine kind="err" role="alert">
      {listed.error.message}
    </StateLine>
  ) : listed.data === undefined ? (
    <StateLine kind="run">Reading the calculation requests…</StateLine>
  ) : rows.length === 0 ? (
    <p className="reviews__none" data-testid="requests-none">
      No calculations have been asked of the folders you may change.
    </p>
  ) : (
    <TableScroll label="Calculation requests">
      <table className="query-log reviews__table" aria-label="Calculation requests">
        <thead>
          <tr>
            {['Cube', 'Folder', 'Asked by', 'Asked', 'Status'].map((column) => (
              <th key={column} scope="col">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const open = row.id === selected;
            const status = statusOf(row);
            return (
              <tr key={row.id} className={open ? 'is-selected' : undefined}>
                <td>
                  <button
                    type="button"
                    ref={(button) => {
                      if (button === null) buttons.current.delete(row.id);
                      else buttons.current.set(row.id, button);
                    }}
                    className="link-button reviews__item"
                    aria-expanded={open}
                    {...(open ? { 'aria-controls': summaryId } : {})}
                    onClick={() => {
                      onSelect(open ? undefined : row.id);
                    }}
                  >
                    {shortName(row.cube)}
                  </button>
                </td>
                <td>{folderText(row.folderPath)}</td>
                <td>{row.requestedBy}</td>
                <td>
                  <time dateTime={row.requestedAt}>{proposedText(row.requestedAt, now)}</time>
                </td>
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
  );

  return list;
}

/** The request chosen, opened beside the list (design 05's inspector); none while none is. */
export function CalcRequestSummary({
  id,
  selected,
  onClose,
  now = new Date(),
  go = (href) => {
    globalThis.location.assign(href);
  },
}: {
  readonly id: string;
  readonly selected: string | undefined;
  readonly onClose: () => void;
  readonly now?: Date;
  /** Where opening a request goes: its model's copy in the editor (T384). */
  readonly go?: (href: string) => void;
}) {
  const listed = useQuery(CALC_REQUESTS_QUERY);
  const chosen = listed.data?.find((row) => row.id === selected);
  return chosen === undefined ? null : (
    <RequestSummary key={chosen.id} id={id} row={chosen} now={now} onClose={onClose} go={go} />
  );
}

function statusOf(row: CalcRequestRow): { kind: StateKind; text: string } {
  return row.status === 'open' ? { kind: 'run', text: 'Open' } : { kind: 'ok', text: 'Resolved' };
}

const GROUPS: readonly [keyof CalcRequestRow['fields'], string][] = [
  ['measures', 'Metrics'],
  ['dimensions', 'Dimensions'],
  ['timeDimensions', 'Time'],
  ['filters', 'Filters'],
];

/** The fields a request carries, by group, and those of cubes the user can't see, counted. */
function fieldsText(row: CalcRequestRow): string {
  const said = GROUPS.flatMap(([group, label]) =>
    row.fields[group].length === 0
      ? []
      : [`${label}: ${row.fields[group].map(shortName).join(', ')}`],
  );
  if (row.unseenFields > 0)
    said.push(
      `and ${String(row.unseenFields)} field${row.unseenFields === 1 ? '' : 's'} of cubes you can’t see`,
    );
  return said.length === 0 ? 'No fields' : said.join(' · ');
}

function RequestSummary({
  id,
  row,
  now,
  onClose,
  go,
}: {
  id: string;
  row: CalcRequestRow;
  now: Date;
  onClose: () => void;
  go: (href: string) => void;
}) {
  /** Opening it into My workspace (T384): under way, or why it couldn't be. */
  const [opening, setOpening] = useState<{ busy: boolean; failure?: string }>({ busy: false });
  // Focus to the summary as it opens, since it follows the whole table.
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), [row.id]);
  // Escape within it closes it.
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
  const title = `Calculation on ${shortName(row.cube)}`;
  return (
    <section id={id} ref={box} className="admin-pane reviews__summary" aria-label={title}>
      <header className="reviews__summary-head">
        <h2 ref={heading} tabIndex={-1}>
          {title}
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
      {row.status === 'open' ? (
        // Its cube's model, copied into My workspace, with the request beside
        // it (T384, AC-051); the copy there already, where there is one.
        <button
          type="button"
          className="btn btn-sm btn-primary"
          disabled={opening.busy}
          onClick={() => {
            setOpening({ busy: true });
            void openRequest(row).then((opened) => {
              if ('href' in opened) go(opened.href);
              else setOpening({ busy: false, failure: opened.error });
            });
          }}
        >
          {opening.busy ? 'Opening…' : 'Open in My workspace'}
        </button>
      ) : null}
      {opening.failure === undefined ? null : (
        <p role="alert" className="field__error">
          {opening.failure}
        </p>
      )}
      <p className="reviews__by" data-testid="request-by">
        Asked by {row.requestedBy} · {proposedText(row.requestedAt, now)} · model {row.modelPath}
      </p>
      {row.resolution === null ? null : (
        // The members that resolve it, and whose approved proposal added them
        // (T385, AC-052): a state, with its icon, not news, so no live region.
        <p className="state-line" data-testid="request-resolution">
          <StatusIcon kind="ok" />
          <span>{resolutionText(row.resolution, now)}</span>
        </p>
      )}
      <h3 className="reviews__label">What they need</h3>
      <p className="reviews__description" data-testid="request-description">
        {row.description}
      </p>
      <h3 className="reviews__label">Fields in use</h3>
      <p className="reviews__where" data-testid="request-fields">
        {fieldsText(row)}
      </p>
      <p className="reviews__where" data-testid="request-chart">
        {row.chart === null ? (
          // In its asker's workspace, a folder the viewer can't see, or gone.
          'From a chart you can’t open.'
        ) : (
          <>
            From the chart{' '}
            <a href={`/explore/charts/${encodeURIComponent(row.chart.id)}`}>{row.chart.title}</a>
          </>
        )}
      </p>
    </section>
  );
}
