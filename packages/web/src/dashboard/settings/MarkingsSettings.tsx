import {
  addMarking,
  canAddMarking,
  MARKING_SLOTS,
  markingsFrom,
  renameMarking,
  setMarkingSlot,
  type Marking,
  type MarkingSlot,
} from '@wechart/core';
import { COLORS } from '@wechart/ui';
import { useId } from 'react';

import { useThemeName } from '../../shell/ThemeProvider';
import type { DashboardDocument } from '../model/document';
import {
  chartTileMarkings,
  deleteMarking,
  makeDefault,
  setTileLimit,
  setTileMarking,
  usageOf,
} from './markingsDraft';

/**
 * Settings › Markings (AC-198, direction.md §2), the prototype's two tables
 * (`docs/design/prototype/dash-settings.js`, `markings()`):
 *
 * - the markings, each with its colour, name, whether it is the default, and
 *   how many tiles mark with it or are limited by it — added (up to four, one
 *   per marking colour), renamed, recoloured, deleted, made the default;
 * - "Tiles and markings": every chart tile, the marking it marks with, and the
 *   markings that limit it.
 *
 * Every change is to the draft, applied by Save settings like the rest of the
 * page. The rules live in `@wechart/core` and `markingsDraft.ts`; this is
 * the controls.
 */
export interface MarkingsSettingsProps {
  readonly document: DashboardDocument;
  readonly onChange: (next: DashboardDocument) => void;
  /** A chart's title, which is how a tile is named here. */
  readonly titleOf?: ((chartId: string) => string | undefined) | undefined;
}

function Swatch({ slot }: { readonly slot: MarkingSlot }) {
  const theme = useThemeName();
  return (
    <span
      className="marking-swatch"
      aria-hidden="true"
      style={{ background: COLORS[theme][slot] }}
    />
  );
}

export function MarkingsSettings({ document, onChange, titleOf }: MarkingsSettingsProps) {
  const markings = markingsFrom(document.markings);
  const usage = usageOf(document);
  const tiles = chartTileMarkings(document);
  const withMarkings = (next: readonly Marking[]) => onChange({ ...document, markings: next });
  const full = !canAddMarking(markings);
  const fullId = useId();
  const nameOf = (tile: { tileId: string; chartId: string | undefined }) =>
    (tile.chartId === undefined ? undefined : titleOf?.(tile.chartId)) ?? tile.tileId;

  return (
    <>
      <p className="settings-page__intro">
        A marking is a named, coloured selection shared by every tile that uses it, on every page
        tab. New chart tiles use the default marking.
      </p>
      {/* The prototype's .grid-table (T249, mismatch 34): 12 px, a 28 px head,
          rows as tall as a 28 px .input.sm. */}
      <table className="grid-table markings-table" aria-label="Markings">
        <thead>
          <tr>
            <th scope="col">Colour</th>
            <th scope="col">Name</th>
            <th scope="col">Default</th>
            <th scope="col">Used by</th>
            <th scope="col">
              <span className="visually-hidden">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {markings.map((marking, index) => {
            const used = usage.get(marking.id) ?? { usedBy: 0, limits: 0 };
            return (
              <tr key={marking.id}>
                <td>
                  <div
                    className="marking-slots"
                    role="radiogroup"
                    aria-label={`Colour for ${marking.name}`}
                  >
                    {/* The prototype's .mk-slot: the colour itself is the
                        choice, ringed in the accent when chosen. A native
                        radio laid over it, so the keys and the name are the
                        platform's (T249, mismatch 34). */}
                    {MARKING_SLOTS.map((slot, at) => (
                      <label key={slot} className="marking-slot">
                        <input
                          type="radio"
                          name={`colour-${marking.id}`}
                          aria-label={`Colour ${String(at + 1)}`}
                          checked={marking.slot === slot}
                          onChange={() => withMarkings(setMarkingSlot(markings, marking.id, slot))}
                        />
                        <Swatch slot={slot} />
                      </label>
                    ))}
                  </div>
                </td>
                <td>
                  <input
                    type="text"
                    className="input-sm"
                    aria-label={`Name of marking ${String(index + 1)}`}
                    value={marking.name}
                    onChange={(event) =>
                      withMarkings(renameMarking(markings, marking.id, event.target.value))
                    }
                  />
                </td>
                <td>
                  <label className="marking-default">
                    <input
                      type="radio"
                      name="default-marking"
                      aria-label="Default marking"
                      checked={marking.isDefault}
                      onChange={() => onChange(makeDefault(document, marking.id))}
                    />
                    <span aria-hidden="true">Default</span>
                  </label>
                </td>
                <td>
                  Used by {used.usedBy} · limits {used.limits}
                </td>
                <td>
                  <button
                    type="button"
                    className="btn-ghost btn-sm"
                    aria-label={`Delete ${marking.name}`}
                    // A dashboard keeps at least one marking (AC-084): said
                    // as a state, not hidden.
                    aria-disabled={markings.length <= 1 ? 'true' : undefined}
                    title={
                      markings.length <= 1 ? 'A dashboard keeps at least one marking' : undefined
                    }
                    onClick={() => {
                      if (markings.length > 1) onChange(deleteMarking(document, marking.id));
                    }}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="markings-add">
        <button
          type="button"
          className="btn-sm"
          aria-disabled={full ? 'true' : undefined}
          aria-describedby={full ? fullId : undefined}
          onClick={() => {
            // A fresh id: a deleted marking's, and any marks still held
            // under it, never come back on a new one (T218's review).
            if (!full) withMarkings(addMarking(markings, undefined, `mk-${crypto.randomUUID()}`));
          }}
        >
          + New marking
        </button>
        {full ? (
          <span id={fullId} className="settings-page__later">
            Four markings at most: each wears one of the four marking colours, validated against the
            chart palette.
          </span>
        ) : null}
      </div>

      <h3 className="settings-page__subhead">Tiles and markings</h3>
      <p className="settings-page__later">
        Which marking each chart tile marks with, and which markings limit it — a details tile.
      </p>
      {tiles.length === 0 ? (
        <p className="settings-page__later">This dashboard has no chart tiles yet.</p>
      ) : (
        <table className="grid-table markings-table" aria-label="Tiles and markings">
          <thead>
            <tr>
              <th scope="col">Tile</th>
              <th scope="col">Marks with</th>
              <th scope="col">Limited by</th>
            </tr>
          </thead>
          <tbody>
            {tiles.map((tile) => {
              const name = nameOf(tile);
              return (
                <tr key={tile.tileId}>
                  <th scope="row">{name}</th>
                  <td>
                    <select
                      className="select-sm"
                      aria-label={`Marking for ${name}`}
                      value={tile.marksWith}
                      onChange={(event) =>
                        onChange(setTileMarking(document, tile.tileId, event.target.value))
                      }
                    >
                      <option value="">(None)</option>
                      {markings.map((marking) => (
                        <option key={marking.id} value={marking.id}>
                          {marking.name}
                          {marking.isDefault ? ' (default)' : ''}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <div className="marking-limits">
                      {markings.map((marking) => {
                        const own = tile.marksWith === marking.id;
                        return (
                          <label
                            key={marking.id}
                            className="marking-limit"
                            title={
                              own ? 'A tile is not limited by the marking it marks with' : undefined
                            }
                          >
                            <input
                              type="checkbox"
                              aria-label={`${name} limited by ${marking.name}`}
                              checked={tile.limitedBy.includes(marking.id)}
                              disabled={own}
                              onChange={(event) =>
                                onChange(
                                  setTileLimit(
                                    document,
                                    tile.tileId,
                                    marking.id,
                                    event.target.checked,
                                  ),
                                )
                              }
                            />
                            <Swatch slot={marking.slot} />
                            <span aria-hidden="true">{marking.name}</span>
                          </label>
                        );
                      })}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </>
  );
}
