import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';

export interface SearchHit {
  readonly kind: 'dashboard' | 'chart';
  readonly id: string;
  readonly title: string;
}

/**
 * The application-wide search palette (AC-006).
 *
 * The shortcut is bound on the document rather than on a container, because the
 * criterion says "anywhere in the application" — including while focus sits in
 * another input, where a container-scoped handler would never see the event.
 *
 * What the palette searches arrives with Explore search (T017); this task is
 * the shortcut, the surface and the focus contract.
 */
export function SearchPalette() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const openerRef = useRef<Element | null>(null);

  /**
   * AC-019: dashboards and library charts whose title contains the text, and
   * never a dashboard-local chart — the API enforces that, because a chart that
   * belongs to a dashboard is not a catalog object.
   */
  const results = useQuery({
    queryKey: ['search', text],
    queryFn: async (): Promise<SearchHit[]> => {
      const response = await fetch(`/api/search?q=${encodeURIComponent(text)}`);
      if (!response.ok) throw new Error(`Search failed: ${String(response.status)}`);
      return (await response.json()) as SearchHit[];
    },
    enabled: open && text.trim() !== '',
  });

  const close = useCallback(() => {
    setOpen(false);
    // Returning focus to where it came from: a shortcut that strands the
    // keyboard somewhere else is worse than no shortcut (AC-176).
    if (openerRef.current instanceof HTMLElement) openerRef.current.focus();
    openerRef.current = null;
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        openerRef.current = document.activeElement;
        setOpen(true);
        return;
      }
      if (event.key === 'Escape' && open) {
        event.preventDefault();
        close();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, close]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  if (!open) return null;

  return (
    // No click-to-dismiss backdrop: a clickable div is invisible to the
    // keyboard, so the ways out are Escape and the Close button, both of which
    // every input method can reach.
    <div className="palette-backdrop">
      <div role="dialog" aria-modal="true" aria-label="Search" className="palette">
        <input
          ref={inputRef}
          type="search"
          className="palette__input"
          placeholder="Search dashboards and charts"
          aria-label="Search dashboards and charts"
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
        <button type="button" className="palette__close" onClick={close}>
          Close
        </button>
        <div className="palette__results">
          {results.isSuccess ? (
            results.data.length === 0 ? (
              <p>Nothing matches “{text}”.</p>
            ) : (
              <ul aria-label="Search results">
                {results.data.map((hit) => (
                  <li key={`${hit.kind}:${hit.id}`}>
                    <a href={`/explore/${hit.kind}s/${encodeURIComponent(hit.id)}`}>
                      {hit.title}
                      {/* Type as a word, so a dashboard and a chart of the same
                          name are told apart without relying on an icon. */}
                      <span className="palette__kind"> · {hit.kind}</span>
                    </a>
                  </li>
                ))}
              </ul>
            )
          ) : null}
        </div>
        <p className="palette__hint">Press Escape to close.</p>
      </div>
    </div>
  );
}
