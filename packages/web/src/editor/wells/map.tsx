import { mapModule, mapSettingsOf, type MapSettings } from '@wechart/core';
import { useId } from 'react';

import { MenuButton, type MenuItem } from '../../shell/MenuButton';
import { FieldIcon } from '../FieldList';
import type { Member } from '../fields';
import type { TypeWellsProps } from './registry';

/**
 * The Map's wells (T973, AC-622; design 23 sheet 6; direction.md rule 160),
 * after Metrics and Dimensions: its Boundary set — Countries, Admin-1 by
 * country, or a custom set — and its three layers. Regions is the chart's
 * dimension, a region key, coloured by its measure, from the Dimensions and
 * Metrics wells as the country map took them; Points and Density each take a
 * geo dimension (Cube's `geo` type, research/cube/data-modeling.md), Points
 * sized by a measure. All of it is stored under the chart's `options.map`,
 * sparse, through the Map's module in core.
 */
export interface MapWellsProps extends TypeWellsProps {
  /** The custom boundary sets the chart's folder path offers (T979); none until then. */
  readonly customSets?: readonly { readonly id: string; readonly name: string }[];
}

const NO_OPTIONS: Readonly<Record<string, unknown>> = {};

export function MapWells({
  options = NO_OPTIONS,
  onOptions,
  available = [],
  titleOf = (member) => member,
  spec,
  customSets = [],
}: MapWellsProps) {
  const ids = useId();
  const settings = mapSettingsOf(options);
  const set = (next: MapSettings) => onOptions?.({ map: mapModule.save(next) });
  const locations = available.filter((one) => one.kind === 'dimension' && one.type === 'geo');
  const measures = available.filter((one) => one.kind === 'measure');
  const dimensions = available.filter((one) => one.kind === 'dimension' && one.type !== 'geo');
  const [key] = spec?.dimensions ?? [];
  const [measure] = spec?.measures ?? [];
  const { points, density } = settings;
  const unoffered =
    settings.boundarySet.startsWith('custom:') &&
    !customSets.some((custom) => `custom:${custom.id}` === settings.boundarySet);

  return (
    <>
      <section className="well-field">
        <label htmlFor={`${ids}-set`} className="well-field__label">
          Boundary set
        </label>
        <select
          id={`${ids}-set`}
          className="select-sm"
          value={settings.boundarySet}
          onChange={(event) =>
            set({ ...settings, boundarySet: event.target.value as MapSettings['boundarySet'] })
          }
        >
          <option value="countries">Countries</option>
          <option value="admin1">Admin-1, by country</option>
          {customSets.length === 0 && !unoffered ? null : (
            <optgroup label="Custom">
              {customSets.map((custom) => (
                <option key={custom.id} value={`custom:${custom.id}`}>
                  {custom.name}
                </option>
              ))}
              {/* A stored set not offered here, shown as chosen so another can be (T973's review). */}
              {unoffered ? (
                <option value={settings.boundarySet}>A custom set no longer offered here</option>
              ) : null}
            </optgroup>
          )}
        </select>
      </section>

      <section className="well-field" aria-labelledby={`${ids}-regions`}>
        <h3 id={`${ids}-regions`} className="well-field__label">
          Regions layer
        </h3>
        <p className="panel-section__note" data-testid="map-layer-regions">
          {key === undefined
            ? 'Put a region key in Dimensions and a measure in Metrics.'
            : measure === undefined
              ? `${titleOf(key)}, with no measure to colour it by`
              : `${titleOf(key)} coloured by ${titleOf(measure)}`}
        </p>
      </section>

      <section className="well-field" aria-labelledby={`${ids}-points`}>
        <h3 id={`${ids}-points`} className="well-field__label">
          Points layer
        </h3>
        <div className="well" data-testid="map-layer-points">
          <OneField
            layer="Points layer"
            testId="mapPoints"
            member={points?.location}
            empty="+ location"
            candidates={locations}
            titleOf={titleOf}
            onChange={(location) => {
              const { points: _gone, ...rest } = settings;
              void _gone;
              set(location === undefined ? rest : { ...settings, points: { location } });
            }}
          />
          {points === undefined ? null : (
            <>
              <span className="well__empty">sized by</span>
              <OneField
                layer="Points layer’s size"
                testId="mapPointsSize"
                member={points.size}
                empty="+ measure"
                candidates={measures}
                titleOf={titleOf}
                onChange={(size) => {
                  const { size: _old, ...rest } = points;
                  void _old;
                  set({ ...settings, points: size === undefined ? rest : { ...rest, size } });
                }}
              />
              {/* At most 3 members, said under the map past that (T976, AC-625). */}
              <span className="well__empty">coloured by</span>
              <OneField
                layer="Points layer’s colour"
                testId="mapPointsColour"
                member={points.colour}
                empty="+ dimension"
                candidates={dimensions}
                titleOf={titleOf}
                onChange={(colour) => {
                  const { colour: _old, ...rest } = points;
                  void _old;
                  set({ ...settings, points: colour === undefined ? rest : { ...rest, colour } });
                }}
              />
            </>
          )}
        </div>
      </section>

      <section className="well-field" aria-labelledby={`${ids}-density`}>
        <h3 id={`${ids}-density`} className="well-field__label">
          Density layer
        </h3>
        <div className="well" data-testid="map-layer-density">
          <OneField
            layer="Density layer"
            testId="mapDensity"
            member={density?.location}
            empty="+ location"
            candidates={locations}
            titleOf={titleOf}
            onChange={(location) => {
              const { density: _gone, ...rest } = settings;
              void _gone;
              set(location === undefined ? rest : { ...settings, density: { location } });
            }}
          />
        </div>
      </section>
    </>
  );
}

/** One field of a layer: its pill, or a picker of the fields it can take. */
function OneField({
  layer,
  testId,
  member,
  empty,
  candidates,
  titleOf,
  onChange,
}: {
  layer: string;
  testId: string;
  member: string | undefined;
  empty: string;
  candidates: readonly Member[];
  titleOf: (member: string) => string;
  onChange: (member: string | undefined) => void;
}) {
  if (member === undefined) {
    const items: readonly MenuItem[] =
      candidates.length === 0
        ? [
            {
              key: 'none',
              label:
                empty === '+ location'
                  ? 'No location (geo) dimension in this cube'
                  : empty === '+ dimension'
                    ? 'No dimension in this cube'
                    : 'No measure in this cube',
              disabled: true,
              onSelect: () => undefined,
            },
          ]
        : candidates.map((candidate) => ({
            key: candidate.name,
            testId: `pick-${candidate.name}`,
            label: (
              <>
                <FieldIcon member={candidate} />
                {candidate.title}
              </>
            ),
            onSelect: () => onChange(candidate.name),
          }));
    return (
      <MenuButton
        label={`Choose the ${empty.slice(2)} for the ${layer}`}
        className="addbtn"
        align="start"
        testId={`add-${testId}`}
        items={items}
      >
        {empty}
      </MenuButton>
    );
  }
  const title = titleOf(member);
  const isMeasure = candidates.some((one) => one.name === member && one.kind === 'measure');
  return (
    <span
      className={isMeasure ? 'pill pill--measure' : 'pill pill--dimension'}
      data-testid={`in-${testId}-${member}`}
    >
      <span className="pill__title">{title}</span>
      <button
        type="button"
        className="pill__remove"
        onClick={() => onChange(undefined)}
        aria-label={`Remove ${title} from ${layer}`}
      >
        ×
      </button>
    </span>
  );
}
