import { IMAGE_HEAD_BYTES, IMAGE_TYPES, imageProblem } from '@wechart/core';
import { useEffect, useId, useState, type ReactNode } from 'react';

import { StateLine } from '../../shell/StatusIcon';
import { webAddressProblem } from '../tiles/LinkTile';

import { COLUMNS, ROW_UNIT_PX } from '../grid/geometry';
import {
  changeTile,
  elementAt,
  isSized,
  isTile,
  type DashboardDocument,
  type Tile,
} from '../model/document';

/**
 * The Properties panel (direction.md §2: Add, Outline and Properties): the
 * settings of the selected tile, for the kinds that have any.
 */
export function TileProperties({
  dashboardId,
  document,
  selected,
  onChange,
  chartProperties,
}: {
  dashboardId: string;
  document: DashboardDocument;
  selected: string | null;
  /**
   * Apply a change to the dashboard as it is when the change lands — an
   * image's upload answers later, and anything changed meanwhile must stay.
   */
  onChange: (apply: (current: DashboardDocument) => DashboardDocument) => void;
  /** A chart tile's own properties — its chart's ownership (T133) — from above, which has its chart. */
  chartProperties?: ((tile: Tile) => ReactNode) | undefined;
}) {
  const element = selected === null ? null : elementAt(document, selected);
  if (element === null || !isTile(element))
    return <Note>Select a tile to see its properties.</Note>;
  const change = (patch: Partial<Tile>) => {
    onChange((current) => changeTile(current, element.id, (tile) => ({ ...tile, ...patch })));
  };
  const own = (() => {
    switch (element.kind) {
      case 'image':
        // Keyed, so one tile's refusal or upload does not carry to the next.
        return (
          <ImageProperties
            key={element.id}
            dashboardId={dashboardId}
            tile={element}
            onChange={change}
          />
        );
      case 'link':
        return <LinkProperties key={element.id} tile={element} onChange={change} />;
      case 'chart':
        return chartProperties?.(element) ?? <Note>This tile has no properties to set here.</Note>;
      default:
        return <Note>This tile has no properties to set here.</Note>;
    }
  })();
  // Its size last, as the prototype's Properties close (AC-203).
  return (
    <>
      {own}
      <LayoutSection key={`layout-${element.id}`} tile={element} />
    </>
  );
}

/**
 * The dashboard's page tabs, each with Delete (AC-060): the prototype's
 * Properties › Dashboard › Page tabs (AC-187). Only while there are two or
 * more, since a dashboard keeps at least one page.
 */
export function PageTabsProperties({
  document,
  onDelete,
}: {
  document: DashboardDocument;
  onDelete: (pageId: string) => void;
}) {
  if (document.pages.length < 2) return null;
  return (
    <div className="panel-section">
      <h3>Page tabs</h3>
      <ul className="page-tabs-list">
        {document.pages.map((page) => (
          <li key={page.id}>
            <span>{page.title}</span>
            <button
              type="button"
              className="btn-ghost btn-sm"
              data-testid={`delete-page-${page.id}`}
              aria-label={`Delete page ${page.title}`}
              onClick={() => {
                onDelete(page.id);
              }}
            >
              Delete
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * A chart tile's Chart section (AC-203; the prototype's Properties › Chart):
 * what it draws — its title, its type and the cube or view it is built on —
 * and Edit chart.
 */
export function ChartSection({
  title,
  type,
  source,
  onEdit,
}: {
  title: string;
  type: string;
  source: string;
  onEdit: () => void;
}) {
  const id = useId();
  return (
    <section className="panel-section chart-section" aria-labelledby={`${id}-head`}>
      <h3 id={`${id}-head`}>Chart</h3>
      <p className="chart-section__title" data-testid="properties-chart-title">
        {title}
      </p>
      <p className="panel-section__note" data-testid="properties-chart-type">
        {type} · <span className="chart-section__source">{source}</span>
      </p>
      <button
        type="button"
        className="btn-primary btn-sm"
        data-properties-edit-chart=""
        onClick={onEdit}
      >
        <span aria-hidden="true">✎ </span>Edit chart
      </button>
    </section>
  );
}

/**
 * A marking section's frame (AC-203): which marking the tile marks with and
 * which limit it, under one heading at the panel's inset. Not a named region:
 * its first control is already called "Marking", and two things of one name
 * are one too many to find by it.
 */
export function MarkingSection({ children }: { children: ReactNode }) {
  return (
    <section className="panel-section marking-section">
      <h3>Marking</h3>
      {children}
    </section>
  );
}

/**
 * A sized tile's Layout (AC-203; the prototype's collapsed LAYOUT): its size,
 * and how to change it, since it is changed on the canvas rather than here.
 */
export function LayoutSection({ tile }: { tile: Tile }) {
  if (!isSized(tile)) return null;
  // As the canvas draws it, which rounds what the document holds.
  const wide = `${String(Math.round(tile.w))} / ${String(COLUMNS)} columns`;
  return (
    <details className="panel-section layout-section">
      <summary>Layout</summary>
      <p className="panel-section__note">
        {tile.h === undefined
          ? `${wide} · as tall as what it holds.`
          : `${wide} · ${String(Math.round(tile.h) * ROW_UNIT_PX)} px tall. Resize by dragging the tile’s edges, or focus the tile and press Shift and an arrow key.`}
      </p>
    </details>
  );
}

/** The panel with nothing to set, said in a section of its own. */
function Note({ children }: { children: string }) {
  return (
    <div className="panel-section">
      <p className="panel-section__note">{children}</p>
    </div>
  );
}

/**
 * One setting: its label over its control (the prototype's `.field`, AC-187).
 * The label names the control by `id`, so a reader hears it on the control.
 */
function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children}
    </div>
  );
}

interface Found {
  readonly kind: string;
  readonly id: string;
  readonly title: string;
}

/** Dashboards whose titles hold what was typed, from the catalog's search. */
function useDashboardSearch(text: string): readonly Found[] {
  const needle = text.trim();
  // Kept with the text they answer, so an answer to older text never shows.
  const [found, setFound] = useState<{ needle: string; items: readonly Found[] }>({
    needle: '',
    items: [],
  });
  useEffect(() => {
    if (needle === '') return undefined;
    const aborted = new AbortController();
    const timer = setTimeout(() => {
      void fetch(`/api/search?q=${encodeURIComponent(needle)}`, { signal: aborted.signal })
        .then(async (response) => (response.ok ? ((await response.json()) as Found[]) : []))
        .then((items) => {
          setFound({ needle, items: items.filter((item) => item.kind === 'dashboard') });
        })
        .catch(() => undefined);
    }, 150);
    return () => {
      clearTimeout(timer);
      aborted.abort();
    };
  }, [needle]);
  return found.needle === needle && needle !== '' ? found.items : [];
}

/**
 * A link tile's settings (AC-064): its label and style, and where it goes —
 * a dashboard, found by its title, optionally passing the current filters;
 * or a web address, taken only if it is http(s) (`webAddressProblem`), and
 * checked when the field is left, so a half-typed address is not refused
 * mid-word.
 */
function LinkProperties({
  tile,
  onChange,
}: {
  tile: Tile;
  onChange: (patch: Partial<Tile>) => void;
}) {
  const target = tile.link?.target;
  const [goesTo, setGoesTo] = useState<'dashboard' | 'url'>(target?.kind ?? 'dashboard');
  const [address, setAddress] = useState(target?.kind === 'url' ? target.url : '');
  const [problem, setProblem] = useState('');
  const [search, setSearch] = useState('');
  const found = useDashboardSearch(search);
  const ids = {
    label: useId(),
    style: useId(),
    goes: useId(),
    find: useId(),
    url: useId(),
    pass: useId(),
  };
  const link = (patch: Partial<NonNullable<Tile['link']>>) => {
    onChange({ link: { ...tile.link, ...patch } });
  };

  return (
    <div className="panel-section tile-properties">
      <h3>Link</h3>
      <Field id={ids.label} label="Label">
        <input
          id={ids.label}
          type="text"
          value={tile.text ?? ''}
          onChange={(event) => {
            onChange({ text: event.target.value });
          }}
        />
      </Field>
      <Field id={ids.style} label="Style">
        <select
          id={ids.style}
          value={tile.link?.style ?? 'button'}
          onChange={(event) => {
            const style = event.target.value;
            link({ style: style === 'primary' ? 'primary' : style === 'text' ? 'text' : 'button' });
          }}
        >
          <option value="button">Button</option>
          <option value="primary">Primary</option>
          <option value="text">Text link</option>
        </select>
      </Field>
      <Field id={ids.goes} label="Goes to">
        <select
          id={ids.goes}
          value={goesTo}
          onChange={(event) => {
            const next = event.target.value === 'url' ? 'url' : 'dashboard';
            setGoesTo(next);
            setProblem('');
            /**
             * A target of the other kind goes: kept, the panel said "No
             * dashboard chosen yet." while the tile still opened the web
             * address (T070's review). Undo brings it back.
             */
            if (target !== undefined && target.kind !== next) {
              const style = tile.link?.style;
              onChange({ link: style === undefined ? {} : { style } });
            }
          }}
        >
          <option value="dashboard">A dashboard</option>
          <option value="url">A web address</option>
        </select>
      </Field>
      {goesTo === 'url' ? (
        <>
          <Field id={ids.url} label="Web address">
            <input
              id={ids.url}
              type="url"
              value={address}
              placeholder="https://"
              onChange={(event) => {
                setAddress(event.target.value);
              }}
              onBlur={() => {
                const refused = webAddressProblem(address);
                setProblem(refused ?? '');
                // Stored as parsed, the address the link will follow.
                if (refused === undefined)
                  link({ target: { kind: 'url', url: new URL(address.trim()).href } });
              }}
            />
          </Field>
          {problem === '' ? null : (
            <StateLine kind="err" className="tile-properties__problem">
              {problem}
            </StateLine>
          )}
        </>
      ) : (
        <>
          <p className="tile-properties__hint">
            {target?.kind === 'dashboard'
              ? `Opens ${target.title ?? 'a dashboard'}.`
              : 'No dashboard chosen yet.'}
          </p>
          <Field id={ids.find} label="Find a dashboard">
            <input
              id={ids.find}
              type="search"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
              }}
            />
          </Field>
          {found.length === 0 ? null : (
            <ul role="listbox" aria-label="Dashboards found" className="tile-properties__found">
              {found.map((item) => (
                <li
                  key={item.id}
                  role="option"
                  aria-selected={target?.kind === 'dashboard' && target.dashboardId === item.id}
                  tabIndex={0}
                  onClick={() => {
                    link({
                      target: {
                        kind: 'dashboard',
                        dashboardId: item.id,
                        title: item.title,
                        passFilters: target?.kind === 'dashboard' && target.passFilters === true,
                      },
                    });
                    setSearch('');
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      event.currentTarget.click();
                    }
                  }}
                >
                  {item.title}
                </li>
              ))}
            </ul>
          )}
          <label className="tile-properties__check">
            <input
              id={ids.pass}
              type="checkbox"
              checked={target?.kind === 'dashboard' && target.passFilters === true}
              disabled={target?.kind !== 'dashboard'}
              onChange={(event) => {
                if (target?.kind === 'dashboard')
                  link({ target: { ...target, passFilters: event.target.checked } });
              }}
            />
            Pass the current filters
          </label>
        </>
      )}
    </div>
  );
}

/** Bytes as base64, in chunks: one spread of 2 MB would overflow the call stack. */
function base64Of(bytes: Uint8Array): string {
  let binary = '';
  for (let at = 0; at < bytes.length; at += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(at, at + 0x8000));
  return btoa(binary);
}

/**
 * An image tile's settings (AC-063): its file, its alternative text, and how
 * it fits. A file is checked here by the same rule the server applies — type
 * by its first bytes, at most 2 MB — so a refused one is never sent; the
 * server checks again, since it cannot trust a browser to have.
 */
function ImageProperties({
  dashboardId,
  tile,
  onChange,
}: {
  dashboardId: string;
  tile: Tile;
  onChange: (patch: Partial<Tile>) => void;
}) {
  const [problem, setProblem] = useState('');
  const [sending, setSending] = useState(false);
  const fileId = useId();
  const altId = useId();
  const fitId = useId();

  const add = async (file: File) => {
    setProblem('');
    const head = new Uint8Array(await file.slice(0, IMAGE_HEAD_BYTES).arrayBuffer());
    const refused = imageProblem(file.type, file.size, head);
    if (refused !== undefined) {
      setProblem(refused);
      return;
    }
    setSending(true);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const response = await fetch(`/api/dashboards/${encodeURIComponent(dashboardId)}/images`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ contentType: file.type, data: base64Of(bytes) }),
      });
      const body = (await response.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!response.ok || body.id === undefined) {
        setProblem(body.error ?? 'The image could not be added.');
        return;
      }
      onChange({ imageId: body.id });
    } catch {
      setProblem('The image could not be added: the server could not be reached.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="panel-section tile-properties">
      <h3>Image</h3>
      <Field id={fileId} label="Image file">
        <input
          id={fileId}
          type="file"
          accept={IMAGE_TYPES.join(',')}
          disabled={sending}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file !== undefined) void add(file);
            // The same file chosen again is a change too.
            event.target.value = '';
          }}
        />
      </Field>
      <p className="tile-properties__hint">PNG, JPEG, WebP, GIF or SVG, at most 2 MB.</p>
      {/* Under way, in words with its icon, not only by the field fading (T183, AC-177). */}
      {sending ? <StateLine kind="run">Uploading the image…</StateLine> : null}
      {problem === '' ? null : (
        <StateLine kind="err" className="tile-properties__problem">
          {problem}
        </StateLine>
      )}
      <Field id={altId} label="Alternative text">
        <input
          id={altId}
          type="text"
          value={tile.alt ?? ''}
          onChange={(event) => {
            onChange({ alt: event.target.value });
          }}
        />
      </Field>
      <Field id={fitId} label="Fit">
        <select
          id={fitId}
          value={tile.fit ?? 'contain'}
          onChange={(event) => {
            onChange({ fit: event.target.value === 'cover' ? 'cover' : 'contain' });
          }}
        >
          <option value="contain">Fit inside</option>
          <option value="cover">Fill and crop</option>
        </select>
      </Field>
    </div>
  );
}
