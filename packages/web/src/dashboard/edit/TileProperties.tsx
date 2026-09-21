import { IMAGE_HEAD_BYTES, IMAGE_TYPES, imageProblem } from '@wechart/core';
import { useId, useState } from 'react';

import {
  changeTile,
  elementAt,
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
}: {
  dashboardId: string;
  document: DashboardDocument;
  selected: string | null;
  onChange: (next: DashboardDocument) => void;
}) {
  const element = selected === null ? null : elementAt(document, selected);
  if (element === null || !isTile(element)) return <p>Select a tile to see its properties.</p>;
  const change = (patch: Partial<Tile>) => {
    onChange(changeTile(document, element.id, (tile) => ({ ...tile, ...patch })));
  };
  switch (element.kind) {
    case 'image':
      return <ImageProperties dashboardId={dashboardId} tile={element} onChange={change} />;
    default:
      return <p>This tile has no properties to set here.</p>;
  }
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
    <div className="tile-properties">
      <label htmlFor={fileId}>Image file</label>
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
      <p className="tile-properties__hint">PNG, JPEG, WebP, GIF or SVG, at most 2 MB.</p>
      {problem === '' ? null : (
        <p role="alert" className="tile-properties__problem">
          {problem}
        </p>
      )}
      <label htmlFor={altId}>Alternative text</label>
      <input
        id={altId}
        type="text"
        value={tile.alt ?? ''}
        onChange={(event) => {
          onChange({ alt: event.target.value });
        }}
      />
      <label htmlFor={fitId}>Fit</label>
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
    </div>
  );
}
