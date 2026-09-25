import {
  columnTitleOf,
  exportNoteOf,
  formatterFor,
  rowsCsvOf,
  tableColumnsOf,
  type MemberFormats,
} from '@wechart/core';
import { useEffect, useId, useRef, useState } from 'react';

import { StateLine, type StateKind } from '../../shell/StatusIcon';
import { useFocusTrap } from '../../shell/useFocusTrap';
import { BYTE_ORDER_MARK, csvFileName, saveFile } from '../TileViewMenu';

/**
 * The rows behind a tile (T120, AC-114, direction.md rule 53): "View marked
 * rows" — the rows behind its marked items — or, with nothing marked, "View
 * underlying rows" — the rows behind the whole tile (T268, AC-239). Its
 * query ungrouped, as the chart editor's drawer asks (AC-036), with every
 * filter and limit the tile is under.
 *
 * Shows the first page, capped as the editor's drawer is, and says how many
 * there are in all — the total Cube counts past its row limit — and offers
 * them all as CSV, written as a chart's table is (`rowsCsvOf`, AC-171).
 */
export interface RowsAnswer {
  readonly rows: readonly Record<string, unknown>[];
  /** Every row the query matches, counted past what was returned. */
  readonly total: number | undefined;
}

/** The first page shown, as the chart editor's drawer caps it (`UNDERLYING_ROW_LIMIT`). */
const SHOWN = 100;
/**
 * The most a download asks for: Cube's default row limit
 * (research/cube/data-apis.md, `CUBEJS_DB_QUERY_DEFAULT_LIMIT`), past which
 * `exportNoteOf` says the file was cut short.
 */
export const DOWNLOADED = 10_000;

export function MarkedRows({
  title,
  heading,
  load,
  measures = [],
  formats = {},
  titles,
  follow,
  onFollow,
  onClose,
  save = (name, text) => {
    saveFile(name, text);
  },
}: {
  /** The tile's title. */
  title: string;
  /** "Marked rows" or "Underlying rows": what the rows are. */
  heading: string;
  /** The rows, at most `limit` of them, with the query's full count. */
  load: (limit: number, signal: AbortSignal) => Promise<RowsAnswer>;
  measures?: readonly string[];
  formats?: MemberFormats;
  titles?: Readonly<Record<string, string>>;
  /**
   * The details panel (T269, AC-240): the rows pinned open beside the
   * dashboard, asked again whenever `key` — the marking's query — changes;
   * none while nothing is marked. `onChange(false)` is its switch turned off.
   */
  follow?: { key: string | undefined; onChange: (on: boolean) => void } | undefined;
  /** Where offered, the one-off view's switch that pins it open as the panel. */
  onFollow?: ((on: boolean) => void) | undefined;
  onClose: () => void;
  /** How the file is handed over; the browser's download unless a test says. */
  save?: (name: string, text: string) => void;
}) {
  const named = useId();
  const box = useRef<HTMLDivElement>(null);
  /** No box to keep focus in while it is a panel: the dashboard stays in reach. */
  const noBox = useRef<HTMLDivElement>(null);
  const closer = useRef<HTMLButtonElement>(null);
  const panel = follow !== undefined;
  useFocusTrap(panel ? noBox : box);
  const [answered, setAnswered] = useState<{
    for: string;
    state: { kind: 'error'; message: string } | { kind: 'rows'; value: RowsAnswer };
  }>();
  const [note, setNote] = useState<{ kind: StateKind; text: string } | undefined>(undefined);

  // The latest `load`: read once on opening, where the dialog shows one
  // answer; as the panel, again each time the marking's query changes, the
  // answer to one it has left behind dropped.
  const loading = useRef(load);
  useEffect(() => {
    loading.current = load;
  }, [load]);
  const asking = panel ? (follow.key ?? null) : 'once';
  useEffect(() => {
    if (asking === null) return undefined;
    const aborted = new AbortController();
    loading.current(SHOWN, aborted.signal).then(
      (value) => {
        if (!aborted.signal.aborted) setAnswered({ for: asking, state: { kind: 'rows', value } });
      },
      (error: unknown) => {
        if (aborted.signal.aborted) return;
        setAnswered({
          for: asking,
          state: {
            kind: 'error',
            message: error instanceof Error ? error.message : 'The rows could not be read.',
          },
        });
      },
    );
    return () => {
      aborted.abort();
    };
  }, [asking]);
  /** What's shown: the answer to the marking as it is now, and to no other. */
  const answer =
    asking === null
      ? ({ kind: 'nothing' } as const)
      : answered?.for === asking
        ? answered.state
        : ({ kind: 'loading' } as const);

  // Escape closes the dialog, as every dialog here closes; focus starts on
  // Close. The panel takes neither: the dashboard beside it keeps its keys.
  const closing = useRef(onClose);
  useEffect(() => {
    closing.current = onClose;
  }, [onClose]);
  useEffect(() => {
    if (panel) return undefined;
    closer.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closing.current();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [panel]);

  /** A download being read, stopped when the dialog closes (T120's review). */
  const downloading = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      downloading.current?.abort();
    },
    [],
  );
  const download = () => {
    setNote({ kind: 'run', text: 'Reading the rows…' });
    downloading.current?.abort();
    const aborted = new AbortController();
    downloading.current = aborted;
    load(DOWNLOADED, aborted.signal).then(
      ({ rows, total }) => {
        if (aborted.signal.aborted) return;
        const csv = rowsCsvOf(rows, {
          measures,
          formats,
          ...(titles === undefined ? {} : { titles }),
        });
        save(csvFileName(`${title} - ${heading.toLowerCase()}`), `${BYTE_ORDER_MARK}${csv}`);
        const said = exportNoteOf({ written: rows.length, returned: rows.length, total });
        setNote({ kind: said.truncated === true ? 'warn' : 'ok', text: said.text });
      },
      (error: unknown) => {
        if (aborted.signal.aborted) return;
        setNote({
          kind: 'err',
          text: error instanceof Error ? error.message : 'The rows could not be read.',
        });
      },
    );
  };

  const rows = answer.kind === 'rows' ? answer.value.rows : [];
  const columns = tableColumnsOf(rows);
  const write = columns.map((member) => formatterFor(member, formats));
  const total = answer.kind === 'rows' ? answer.value.total : undefined;

  /** Its switch: on, the rows pinned open and following the marking (AC-240). */
  const toggle =
    follow === undefined && onFollow === undefined ? null : (
      <div className="marked-rows__follow">
        <span id={`${named}-follow`}>Details panel: follow the marking</span>
        <button
          type="button"
          role="switch"
          aria-checked={panel}
          aria-labelledby={`${named}-follow`}
          className="switch"
          onClick={() => {
            if (follow !== undefined) follow.onChange(false);
            else onFollow?.(true);
          }}
        />
      </div>
    );

  const body = (
    <>
      <div className="marked-rows__head">
        <h2 id={named}>
          {heading}: {title}
        </h2>
        {toggle}
      </div>
      {panel ? (
        // One query a marking change while it's on (the analysis, P3).
        <p className="marked-rows__note">Asked again each time the marking changes.</p>
      ) : null}
      {answer.kind === 'nothing' ? <p>Nothing is marked.</p> : null}
      {answer.kind === 'loading' ? <StateLine kind="run">Reading the rows…</StateLine> : null}
      {answer.kind === 'error' ? <StateLine kind="err">{answer.message}</StateLine> : null}
      {answer.kind === 'rows' ? (
        <>
          <p className="marked-rows__count" data-testid="rows-count">
            {total === undefined
              ? `Showing ${rows.length.toLocaleString('en-GB')} rows. The total could not be read.`
              : `Showing ${rows.length.toLocaleString('en-GB')} of ${total.toLocaleString('en-GB')} rows`}
          </p>
          <div className="marked-rows__table">
            <table>
              <thead>
                <tr>
                  {columns.map((column) => (
                    <th key={column} scope="col">
                      {columnTitleOf(column, titles)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  // Ungrouped rows have no key of their own to go by, and
                  // the list is read once and never reordered.
                  <tr key={index}>
                    {columns.map((column, at) => (
                      <td key={column}>{write[at]?.(row[column]) ?? ''}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
      {note === undefined ? null : <StateLine kind={note.kind}>{note.text}</StateLine>}
      <div className="dialog__actions">
        <button
          type="button"
          disabled={answer.kind !== 'rows' || note?.kind === 'run'}
          onClick={download}
        >
          Download CSV
        </button>
        {/* The panel's own switch is how it goes (AC-240). */}
        {panel ? null : (
          <button type="button" ref={closer} onClick={onClose}>
            Close
          </button>
        )}
      </div>
    </>
  );

  return panel ? (
    <section aria-labelledby={named} className="marked-rows marked-rows--panel">
      {body}
    </section>
  ) : (
    <div className="dialog-backdrop">
      <div
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-labelledby={named}
        className="dialog marked-rows"
      >
        {body}
      </div>
    </div>
  );
}
