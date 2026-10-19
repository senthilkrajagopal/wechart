import {
  BULLET_NO_TARGET,
  bandsRefusal,
  bulletOptionsOf,
  MAX_BANDS,
  MIN_BANDS,
  withBulletOptions,
  type BulletSettings,
} from '@wechart/core';
import { useId, useState } from 'react';

import type { TypeWellsProps } from './registry';

/**
 * The bullet chart's own wells (T953, AC-580; design 23 sheet 8), after
 * Metrics: Target, a measure or a value, and Bands, 2 or 3 percentages of the
 * target, 80, 100 and 120 % by default. With Target empty, the well says what
 * the chart needs, its own select the action; a fourth band, or fewer than
 * two, is refused with the reason and changes nothing.
 */
const NO_OPTIONS: Readonly<Record<string, unknown>> = {};

/**
 * A number typed freely and set down on leaving the box or Enter, as the KPI's
 * values are (AC-216): anything that isn't a finite number puts back what
 * was there.
 */
function NumberBox({
  label,
  value,
  onValue,
}: {
  label: string;
  value: number | undefined;
  onValue: (value: number) => void;
}) {
  const [typed, setTyped] = useState<string | null>(null);
  const commit = () => {
    if (typed === null) return;
    const number = Number(typed.trim());
    if (typed.trim() !== '' && Number.isFinite(number)) onValue(number);
    setTyped(null);
  };
  return (
    <input
      type="number"
      className="well__value"
      aria-label={label}
      value={typed ?? (value === undefined ? '' : String(value))}
      onChange={(event) => setTyped(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') commit();
      }}
    />
  );
}

export function BulletWells({
  highlight,
  available = [],
  options = NO_OPTIONS,
  onOptions,
  titleOf = (member) => member,
}: TypeWellsProps) {
  const ids = useId();
  const bullet = bulletOptionsOf(options);
  const measures = available.filter((one) => one.kind === 'measure');
  // "A value" chosen before its value is typed is held here until it has one.
  const [valuePending, setValuePending] = useState(false);
  const shown = bullet.target?.kind === 'measure' ? bullet.target.member : '';
  const valueShown = bullet.target?.kind === 'value' || valuePending;
  /** The last refusal, said until the next change (AC-580). */
  const [refusal, setRefusal] = useState<string | undefined>(undefined);

  const set = (next: BulletSettings) => {
    setRefusal(undefined);
    onOptions({ bullet: withBulletOptions({}, next)['bullet'] });
  };
  const withoutTarget = (): BulletSettings => ({ bands: bullet.bands });
  const setBands = (bands: readonly number[]) => {
    const refused = bandsRefusal(bands);
    if (refused === undefined) set({ ...bullet, bands });
    else setRefusal(refused);
  };
  const bands = bullet.bands;
  const highest = bands.at(-1) ?? 100;
  const step = bands.length >= 2 ? highest - (bands.at(-2) ?? 0) : 20;

  return (
    <>
      <section className="well-field">
        <h3 id={`${ids}-target`} className="well-field__label">
          Target
        </h3>
        <div
          className="well well--settings"
          data-testid="well-bullet-target"
          data-highlight={highlight === 'target' ? 'true' : undefined}
        >
          <select
            aria-labelledby={`${ids}-target`}
            {...(bullet.target === undefined && !valuePending
              ? { 'aria-describedby': `${ids}-needs` }
              : {})}
            value={shown !== '' ? shown : valueShown ? 'value' : ''}
            onChange={(event) => {
              const chosen = event.target.value;
              setValuePending(chosen === 'value');
              if (chosen === '' || chosen === 'value') set(withoutTarget());
              else set({ ...bullet, target: { kind: 'measure', member: chosen } });
            }}
          >
            <option value="">None</option>
            {measures.map((one) => (
              <option key={one.name} value={one.name}>
                {titleOf(one.name)}
              </option>
            ))}
            <option value="value">A value</option>
          </select>
          {valueShown ? (
            <NumberBox
              label="Target: value"
              value={bullet.target?.kind === 'value' ? bullet.target.value : undefined}
              onValue={(value) => set({ ...bullet, target: { kind: 'value', value } })}
            />
          ) : null}
          {bullet.target === undefined && !valuePending ? (
            <p id={`${ids}-needs`} className="panel-section__note">
              {BULLET_NO_TARGET}
            </p>
          ) : null}
        </div>
      </section>

      <section className="well-field">
        <h3 id={`${ids}-bands`} className="well-field__label">
          Bands <span className="well-field__opt">% of target, low to high</span>
        </h3>
        <div
          className="well well--settings"
          role="group"
          aria-label="Bands"
          data-testid="well-bullet-bands"
        >
          {bands.map((band, at) => (
            <span key={at} className="bullet-band">
              <NumberBox
                label={`Band ${String(at + 1)}, % of target`}
                value={band}
                onValue={(value) =>
                  setBands(bands.map((one, index) => (index === at ? value : one)))
                }
              />
              <button
                type="button"
                className="addbtn"
                aria-label={`Remove band ${String(at + 1)}, ${String(band)} %`}
                aria-disabled={bands.length <= MIN_BANDS ? 'true' : undefined}
                onClick={() => setBands(bands.filter((_, index) => index !== at))}
              >
                <span aria-hidden="true">×</span>
              </button>
            </span>
          ))}
          <button
            type="button"
            className="addbtn"
            aria-disabled={bands.length >= MAX_BANDS ? 'true' : undefined}
            onClick={() => setBands([...bands, highest + step])}
          >
            + Band
          </button>
          {refusal === undefined ? null : (
            <p className="panel-section__note" role="status">
              {refusal}
            </p>
          )}
        </div>
      </section>
    </>
  );
}
