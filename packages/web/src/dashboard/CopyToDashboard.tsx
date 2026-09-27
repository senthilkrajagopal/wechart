import type { ChartDocument } from '@wechart/core';
import { useEffect, useId, useRef, useState } from 'react';

import { StateLine } from '../shell/StatusIcon';
import { useFocusTrap } from '../shell/useFocusTrap';
import { copyChartToDashboard } from './copyChartTo';

interface Found {
  readonly id: string;
  readonly title: string;
  readonly kind: string;
}

/** How many dashboards a search lists: the catalog's own answer, bounded. */
const LISTED = 50;

/**
 * Copy › To dashboard (T271, AC-243): a dialog to pick another dashboard,
 * found by its title as the security preview finds one (T241), and copy the
 * tile's chart to it (`copyChartToDashboard`). The dashboard the tile is on is
 * not offered: a copy there is Duplicate's (AC-062), in edit mode.
 *
 * Escape or Close puts it away; the caller gives focus back to the menu.
 */
export function CopyToDashboard({
  sourceDashboardId,
  title,
  chart,
  size,
  onClose,
}: {
  sourceDashboardId: string;
  title: string;
  chart: ChartDocument;
  size: { readonly w: number; readonly h?: number | undefined };
  onClose: () => void;
}) {
  const heading = useId();
  const box = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  useFocusTrap(box);

  const [text, setText] = useState('');
  const [found, setFound] = useState<{ needle: string; items: readonly Found[]; failed?: string }>({
    needle: '',
    items: [],
  });
  const [picked, setPicked] = useState<Found | undefined>(undefined);
  const [state, setState] = useState<
    | { kind: 'idle' }
    | { kind: 'run' }
    | { kind: 'done'; id: string; title: string }
    | { kind: 'err'; text: string }
  >({ kind: 'idle' });

  const needle = text.trim();
  useEffect(() => {
    if (needle === '') return undefined;
    const aborted = new AbortController();
    const timer = setTimeout(() => {
      const url = `/api/search?q=${encodeURIComponent(needle)}&kind=dashboard&limit=${String(LISTED)}`;
      void fetch(url, { signal: aborted.signal })
        .then(async (response) => {
          if (!response.ok) {
            setFound({
              needle,
              items: [],
              failed: `Could not search (${String(response.status)}).`,
            });
            return;
          }
          const items = (await response.json()) as Found[];
          setFound({
            needle,
            items: items.filter(
              (item) => item.kind === 'dashboard' && item.id !== sourceDashboardId,
            ),
          });
        })
        .catch(() => {
          // A search that never answered says so, rather than list nothing
          // (T271's review); one given up for newer text says nothing.
          if (!aborted.signal.aborted)
            setFound({ needle, items: [], failed: 'Could not search: the server did not answer.' });
        });
    }, 150);
    return () => {
      clearTimeout(timer);
      aborted.abort();
    };
  }, [needle, sourceDashboardId]);
  const answered = found.needle === needle && needle !== '';
  const items = answered ? found.items : [];

  // Escape closes it, as every dialog here closes; focus starts on the search.
  const closing = useRef(onClose);
  useEffect(() => {
    closing.current = onClose;
  }, [onClose]);
  useEffect(() => {
    search.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closing.current();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  const copy = () => {
    if (picked === undefined) return;
    setState({ kind: 'run' });
    copyChartToDashboard({ targetId: picked.id, chart, size }).then(
      () => {
        setState({ kind: 'done', id: picked.id, title: picked.title });
      },
      (error: unknown) => {
        setState({
          kind: 'err',
          text: error instanceof Error ? error.message : 'The chart could not be copied.',
        });
      },
    );
  };

  return (
    <div className="dialog-backdrop">
      <div
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-labelledby={heading}
        className="dialog copy-to-dashboard"
      >
        <h2 id={heading}>Copy “{title}” to a dashboard</h2>
        <label className="copy-to-dashboard__search">
          Find a dashboard
          <input
            ref={search}
            type="search"
            value={text}
            placeholder="Its title"
            onChange={(event) => {
              setText(event.target.value);
              setPicked(undefined);
            }}
          />
        </label>
        {answered && found.failed !== undefined ? (
          <StateLine kind="err">{found.failed}</StateLine>
        ) : null}
        {answered && found.failed === undefined && items.length === 0 ? (
          <StateLine kind="idle">No other dashboard’s title holds “{needle}”.</StateLine>
        ) : null}
        {items.length === 0 ? null : (
          <fieldset className="copy-to-dashboard__list">
            <legend>Dashboards</legend>
            {items.map((item) => (
              <label key={item.id}>
                <input
                  type="radio"
                  name="copy-to-dashboard"
                  checked={picked?.id === item.id}
                  onChange={() => {
                    setPicked(item);
                    setState({ kind: 'idle' });
                  }}
                />
                {item.title}
              </label>
            ))}
          </fieldset>
        )}
        {state.kind === 'run' ? <StateLine kind="run">Copying…</StateLine> : null}
        {state.kind === 'err' ? <StateLine kind="err">{state.text}</StateLine> : null}
        {state.kind === 'done' ? (
          <p className="copy-to-dashboard__done" role="status">
            Copied to {state.title}.{' '}
            <a href={`/explore/dashboards/${encodeURIComponent(state.id)}`}>Open {state.title}</a>
          </p>
        ) : null}
        {/* The dialog pattern (T466, UX-106): Cancel beside the one primary;
            once copied, nothing is left to cancel, and it says Close. */}
        <div className="dialog__actions">
          <button type="button" onClick={onClose}>
            {state.kind === 'done' ? 'Close' : 'Cancel'}
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={picked === undefined || state.kind === 'run'}
            onClick={copy}
          >
            Copy
          </button>
        </div>
      </div>
    </div>
  );
}
