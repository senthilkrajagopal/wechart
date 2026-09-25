import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useId, useRef, useState } from 'react';

import { META_QUERY } from '../query/meta';
import { MODEL_FILES_QUERY } from '../workspaces/model/FileList';
import { globalResults } from './globalSearch';
import { useFocusTrap } from './useFocusTrap';

export interface SearchHit {
  readonly kind: 'dashboard' | 'chart';
  readonly id: string;
  readonly title: string;
}

/**
 * Opens the palette from anywhere: the top bar's search field (AC-190).
 *
 * The opener is passed rather than read from `document.activeElement`,
 * because WebKit does not focus a button when it is clicked — the palette
 * then recorded the page body as where it came from, and Escape left focus
 * nowhere.
 */
const OPEN_SEARCH = 'wechart:open-search';
/** How many dashboards and charts the palette lists before asking to narrow. */
const CATALOG_SHOWN = 1000;
export function openSearch(from?: Element) {
  window.dispatchEvent(new CustomEvent<Element | undefined>(OPEN_SEARCH, { detail: from }));
}

/**
 * The application-wide search palette (AC-006, AC-191).
 *
 * The shortcut is bound on the document rather than on a container, because the
 * criterion says "anywhere in the application" — including while focus sits in
 * another input, where a container-scoped handler would never see the event.
 *
 * It finds what the prototype's "Search fields, charts, models" promises (R9):
 * dashboards and library charts from the catalog, Cube fields from the model's
 * metadata, and the model's files — each with its type (`globalResults`).
 *
 * The input is a combobox over a listbox, the WAI-ARIA pattern for a search
 * with results: the arrow keys move the active result, which the input names
 * through `aria-activedescendant`, so focus never leaves the text being typed;
 * Enter opens the active result.
 */
export function SearchPalette() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  /**
   * The active result, by its key — or none before the arrows choose one.
   * By identity, not position: the catalog, the fields and the files arrive
   * at different moments, and the catalog's rows come first, so a position
   * would slide onto a different result as the answers came in and Enter
   * would open something the user never chose (T211's review).
   */
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const openerRef = useRef<Element | null>(null);
  const listId = useId();
  const optionId = (index: number) => `${listId}-option-${String(index)}`;
  const typed = text.trim() !== '';

  /**
   * AC-019: dashboards and library charts whose title contains the text, and
   * never a dashboard-local chart — the API enforces that, because a chart that
   * belongs to a dashboard is not a catalog object.
   */
  const catalog = useQuery({
    queryKey: ['search', text],
    queryFn: async (): Promise<SearchHit[]> => {
      // Every match (AC-191), bounded as the Explore box is: one more than
      // is listed, so a search broader than a list says so.
      const response = await fetch(
        `/api/search?q=${encodeURIComponent(text)}&limit=${String(CATALOG_SHOWN + 1)}`,
      );
      if (!response.ok) throw new Error(`Search failed: ${String(response.status)}`);
      return (await response.json()) as SearchHit[];
    },
    enabled: open && typed,
  });
  // The fields and the files, from the caches the chart editor and the Model
  // workspace already fill. A model that cannot be read leaves them out; the
  // catalog is still searched.
  const meta = useQuery({ ...META_QUERY, enabled: open });
  const files = useQuery({ ...MODEL_FILES_QUERY, enabled: open });

  const hits = catalog.data ?? [];
  const results = globalResults(text, {
    catalog: hits.slice(0, CATALOG_SHOWN),
    meta: meta.data,
    files: files.data ?? [],
  });
  const settled = !catalog.isFetching && !meta.isPending && !files.isPending;
  const active = activeKey === null ? -1 : results.findIndex((result) => result.key === activeKey);
  const move = (by: 1 | -1) => {
    if (results.length === 0) return;
    const from = active < 0 ? (by === 1 ? -1 : 0) : active;
    const next = (from + by + results.length) % results.length;
    setActiveKey(results[next]?.key ?? null);
  };

  // The active result kept in sight as the arrows move through a list that
  // scrolls (T211's review).
  useEffect(() => {
    if (active < 0) return;
    globalThis.document.getElementById(optionId(active))?.scrollIntoView({ block: 'nearest' });
    // `optionId` is derived from the stable `listId`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const show = useCallback((event?: Event) => {
    const from = event instanceof CustomEvent ? (event.detail as Element | undefined) : undefined;
    openerRef.current = from ?? document.activeElement;
    // A fresh search each time: the last one's text, kept, had the next
    // search typed onto its end (recheck-shell-explore N10).
    setText('');
    setActiveKey(null);
    setOpen(true);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    setActiveKey(null);
    // Returning focus to where it came from: a shortcut that strands the
    // keyboard somewhere else is worse than no shortcut (AC-176).
    if (openerRef.current instanceof HTMLElement) openerRef.current.focus();
    openerRef.current = null;
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        // Already open, it stays as it is: taking the palette's own input as
        // where it was opened from sent focus nowhere on close (T211 review).
        if (!open) show();
        return;
      }
    }
    /**
     * Escape closes the palette and nothing else (T182, AC-176). Heard on the
     * way down and kept there: opened over a dialog, the dialog's own Escape
     * closed it too, and focus went back to a dialog that was gone.
     */
    function onEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape' || !open || event.isComposing) return;
      event.preventDefault();
      event.stopPropagation();
      close();
    }

    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('keydown', onEscape, true);
    window.addEventListener(OPEN_SEARCH, show);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keydown', onEscape, true);
      window.removeEventListener(OPEN_SEARCH, show);
    };
  }, [open, close, show]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const box = useRef<HTMLDivElement>(null);
  useFocusTrap(box);

  if (!open) return null;

  const go = (href: string) => {
    setOpen(false);
    globalThis.location.assign(href);
  };

  return (
    // No click-to-dismiss backdrop: a clickable div is invisible to the
    // keyboard, so the ways out are Escape and the Close button, both of which
    // every input method can reach.
    <div className="palette-backdrop">
      <div ref={box} role="dialog" aria-modal="true" aria-label="Search" className="palette">
        <input
          ref={inputRef}
          type="search"
          role="combobox"
          className="palette__input"
          placeholder="Search dashboards, charts, fields and models"
          aria-label="Search dashboards, charts, fields and models"
          aria-autocomplete="list"
          aria-expanded={results.length > 0}
          aria-controls={listId}
          aria-activedescendant={
            active >= 0 && active < results.length ? optionId(active) : undefined
          }
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setActiveKey(null);
          }}
          onKeyDown={(event) => {
            if (results.length === 0) return;
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              move(1);
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              move(-1);
            } else if (event.key === 'Enter' && active >= 0) {
              event.preventDefault();
              const chosen = results[active];
              if (chosen !== undefined) go(chosen.href);
            }
          }}
        />
        <button type="button" className="palette__close" onClick={close}>
          Close
        </button>
        <div className="palette__results">
          <ul role="listbox" id={listId} aria-label="Search results">
            {results.map((result, index) => (
              <li
                key={result.key}
                id={optionId(index)}
                role="option"
                aria-selected={index === active}
                data-href={result.href}
                className="palette__option"
                // Choosing by pointer as by Enter; the combobox keeps focus.
                onMouseDown={(event) => {
                  event.preventDefault();
                  go(result.href);
                }}
              >
                {/* Type as a word, so a dashboard and a chart of the same
                    name are told apart without relying on an icon. */}
                <span className="palette__kind">{result.type}</span>
                <span className="palette__title">{result.title}</span>
                {result.detail === undefined ? null : (
                  <span className="palette__detail">{result.detail}</span>
                )}
              </li>
            ))}
          </ul>
          {typed && settled && results.length === 0 ? <p>Nothing matches “{text}”.</p> : null}
          {hits.length > CATALOG_SHOWN ? (
            <p className="palette__note">
              Showing the first {CATALOG_SHOWN.toLocaleString('en-US')} dashboards and charts. Type
              more to narrow the search.
            </p>
          ) : null}
        </div>
        <p className="palette__hint">↑ ↓ to choose, Enter to open, Escape to close.</p>
      </div>
    </div>
  );
}
