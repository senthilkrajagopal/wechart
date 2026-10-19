import { DEFAULT_PALETTE, isAdditive, labelOf } from '@wechart/charts';
import {
  formatValue,
  kpiOptionsOf,
  kpiPeriodOf,
  kpiTrendQuery,
  memberOn,
  type KpiOptions,
  type KpiTime,
  type RenderSpec,
} from '@wechart/core';
import { useContext, useLayoutEffect, useState } from 'react';

import { SecurityPreview } from '../query/securityPreview';
import { KpiChange, type KpiCompared } from './kpi/KpiChange';
import { kpiPartsShown } from './kpi/kpiFit';
import { KpiTarget } from './kpi/KpiTarget';
import { KpiTrend } from './kpi/KpiTrend';
import { useElementAnswer } from './text/elements/useElementAnswer';

/**
 * The KPI tile (AC-037).
 *
 * DOM rather than ECharts. A KPI is one number and a label; drawing it on a
 * canvas would make it unselectable, unsearchable and invisible to a screen
 * reader for no gain. `docs/research/echarts.md` reaches the same conclusion —
 * KPI, table and pivot stay in the DOM.
 */
export interface KpiProps {
  readonly spec: RenderSpec;
  /**
   * Standing alone, on its own page: `text-kpi-solo`, 40/52, centred
   * (direction §3; design 06 state B; T683). A dashboard's KPI keeps
   * `text-kpi`, 32/40, as a row of them is drawn (design 04 pin 3).
   */
  readonly solo?: boolean;
  /**
   * Where a period comparison has no Time (AC-566), the action that opens
   * the Time well: the chart's editor from a dashboard, the well itself in
   * the editor. Absent, the tile says what it needs without one.
   */
  readonly onAddTime?: (() => void) | undefined;
  /**
   * The query the tile asked, its filters and limits in (T938): its trend is
   * the same question by Time's grain. Absent, no trend is drawn.
   */
  readonly query?: Readonly<Record<string, unknown>> | undefined;
}

/**
 * Grouped, not raw digits. Per-member formats — currency, percentages — are
 * AC-046's business and land at T052; this is the fallback for a measure that
 * declares none.
 */
const FORMAT = new Intl.NumberFormat('en-US');

const numberOf = (raw: unknown): number | undefined => {
  if (raw === null || raw === undefined || raw === '') return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
};

/**
 * The marked share of the KPI's measure, where the marking's was answered
 * (T453, AC-097; direction.md §7a: "KPI tiles: a 'Marked $X · p%' badge (no %
 * for non-additive measures)"). The share is the KPI's own question asked
 * with the marking (T388), so its one row is the measure over the marked
 * rows. An additive measure's with no value is none of it, 0, as the
 * prototype's `rsum` over no marked rows is; its part of the whole is said,
 * rounded as the prototype's is. Any other measure's is said only where it
 * has a value, since a part of an average is no part of it.
 */
function markedShareOf(
  spec: RenderSpec,
  measure: string,
  whole: number,
): { readonly text: string; readonly colour: string } | undefined {
  const marking = spec.marking;
  if (marking?.share === undefined || marking.whole === true) return undefined;
  const additive = isAdditive(marking.aggTypes?.[measure]);
  const marked = numberOf(marking.share[0]?.[measure]) ?? (additive ? 0 : undefined);
  if (marked === undefined) return undefined;
  const part = additive && whole !== 0 ? ` · ${String(Math.round((marked / whole) * 100))}%` : '';
  return {
    text: `Marked ${formatValue(marked, measure, spec.formats ?? {})}${part}`,
    colour: marking.colour,
  };
}

/** The start of the period Cube tagged a compared row with ("2026-09-01T00:00:00.000 - …"). */
function periodStartOf(row: Record<string, unknown> | undefined): string | undefined {
  const tag = row?.['compareDateRange'];
  return typeof tag === 'string' ? tag.split(' - ')[0] : undefined;
}

/** A period by its start, as its grain names it ("Sep 2026"). */
function periodLabelOf(start: string, time: KpiTime, spec: RenderSpec): string {
  return formatValue(start, time.member, spec.formats ?? {}, {
    [time.member]: time.granularity,
  });
}

/**
 * What the value is compared with (T937, AC-565): for a period, the second
 * period's row of Cube's `compareDateRange` answer, named by its period;
 * another measure, on the value's own row, by its title; a value, itself.
 * Nothing where there is nothing to compare with.
 */
function comparedOf(spec: RenderSpec, kpi: KpiOptions, measure: string): KpiCompared | undefined {
  const { compareTo, time } = kpi;
  if (compareTo === undefined) return undefined;
  if (compareTo.kind === 'value') return { value: compareTo.value };
  if (compareTo.kind === 'measure') {
    const value = numberOf(spec.rows[0]?.[compareTo.member]);
    return value === undefined ? undefined : { value, against: labelOf(spec, compareTo.member) };
  }
  if (time === undefined) return undefined;
  const row = spec.rows[1];
  // The period compared, as Cube tagged its row, else as the value's period places it.
  const current = periodStartOf(spec.rows[0]);
  const periods = kpiPeriodOf(
    time.granularity,
    current === undefined ? new Date() : new Date(`${current}Z`),
  );
  const start =
    periodStartOf(row) ??
    (compareTo.kind === 'previousPeriod' ? periods.previous : periods.lastYear)[0];
  const against = periodLabelOf(start, time, spec);
  // No data then (AC-566): no value, or a count of 0, Cube's count of no rows.
  const value = numberOf(row?.[measure]);
  const noRows = value === 0 && spec.measureTypes?.[measure] === 'count';
  return value === undefined || noRows ? { value: undefined, against } : { value, against };
}

/** "Compare to: ‹choice› needs a time dimension in Time." (AC-566), for a period without Time. */
function needsTimeOf(kpi: KpiOptions): string | undefined {
  if (kpi.time !== undefined) return undefined;
  const choice =
    kpi.compareTo?.kind === 'previousPeriod'
      ? 'Previous period'
      : kpi.compareTo?.kind === 'samePeriodLastYear'
        ? 'Same period last year'
        : undefined;
  return choice === undefined ? undefined : `Compare to: ${choice} needs a time dimension in Time.`;
}

/**
 * An element's size as laid out, kept as it changes: the KPI's content box,
 * for its trend's and target's width and the room under its value (AC-565,
 * T938-2); 0 × 0 until it is laid out.
 */
function useBox(): [
  (element: HTMLDivElement | null) => void,
  { readonly width: number; readonly height: number },
] {
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const [box, setBox] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    if (element === null || typeof ResizeObserver === 'undefined') return undefined;
    // Called once on observing, then on every resize.
    const observer = new ResizeObserver(() => {
      setBox({ width: element.clientWidth, height: element.clientHeight });
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, [element]);
  return [setElement, box];
}

/** A KPI's trend asked of Cube (T938): its value's own query by Time's grain. */
function KpiTrendLoaded({
  query,
  spec,
  measure,
  time,
  width,
  shown,
}: {
  readonly query: Readonly<Record<string, unknown>>;
  readonly spec: RenderSpec;
  readonly measure: string;
  readonly time: KpiTime;
  readonly width: number;
  readonly shown: boolean;
}) {
  // Asked as the tile's own query is: its dashboard, and a previewed context.
  const context = useContext(SecurityPreview);
  const answer = useElementAnswer(query, context);
  const values = answer.rows.flatMap((row) => numberOf(row[measure]) ?? []);
  return (
    <KpiTrend
      values={values}
      title={labelOf(spec, measure)}
      member={measure}
      formats={spec.formats}
      granularity={time.granularity}
      // The measure's dashboard colour (AC-039), as R80's sparkline takes it.
      // Unassigned, the palette's first colour, as an empty assignment gives it.
      colour={spec.colours?.[measure] ?? spec.palette?.[0] ?? DEFAULT_PALETTE[0]}
      width={width}
      shown={shown}
    />
  );
}

/** Its target's figure: a value, or a Target measure on the value's row (T938). */
function targetOf(spec: RenderSpec, kpi: KpiOptions): number | undefined {
  const { target } = kpi;
  if (target === undefined) return undefined;
  return target.kind === 'value' ? target.value : numberOf(spec.rows[0]?.[target.member]);
}

export function Kpi({ spec, solo = false, onAddTime, query }: KpiProps) {
  const [measured, box] = useBox();
  const [measuredCore, core] = useBox();
  const kpi = kpiOptionsOf(spec.options);
  // With any of R81's settings, standing alone, its value in text-kpi-solo (AC-565).
  const detailed =
    kpi.compareTo !== undefined || kpi.target !== undefined || kpi.time !== undefined;
  const className = `${solo ? 'kpi kpi--solo' : 'kpi'}${detailed ? ' kpi--detailed' : ''}`;
  const measure = memberOn(spec.encoding, 'y');
  const row = spec.rows[0];
  const raw = measure === undefined || row === undefined ? undefined : row[measure];
  const value = raw === null || raw === undefined || raw === '' ? Number.NaN : Number(raw);
  // By its title from the model (AC-220), never "orders.count": its short
  // one, as a KPI's one measure makes its cube evident (T403).
  const label = measure === undefined ? undefined : labelOf(spec, measure);

  if (!Number.isFinite(value)) {
    // An empty result is not zero, and a value that will not parse is not
    // zero either. Printing one would assert a measurement never made.
    return (
      <div className={className} data-testid="kpi">
        <p data-testid="kpi-empty">No value</p>
        {label === undefined ? null : <p data-testid="kpi-label">{label}</p>}
      </div>
    );
  }

  const marked = measure === undefined ? undefined : markedShareOf(spec, measure, value);
  const compared = measure === undefined ? undefined : comparedOf(spec, kpi, measure);
  const needsTime = needsTimeOf(kpi);
  // Time's period, as Cube tagged the value's row, else the one asked (kpiPeriodOf).
  const period =
    kpi.time === undefined
      ? undefined
      : periodLabelOf(
          periodStartOf(row) ?? kpiPeriodOf(kpi.time.granularity, new Date()).current[0],
          kpi.time,
          spec,
        );
  const name = (
    <p className="kpi__label" data-testid="kpi-label">
      {label}
    </p>
  );

  const goal = targetOf(spec, kpi);
  // Its trend: the tile's own query by Time's grain, the last 12 periods (T938).
  const trend =
    query === undefined || kpi.time === undefined || measure === undefined
      ? undefined
      : kpiTrendQuery(query, measure, kpi.time, new Date());

  /**
   * The trend and target the tile has room for under the rest (T938-2):
   * never one clipped, the target giving way first, then the trend; what
   * gives way is still said, visually hidden.
   */
  const room = box.height > 0 && core.height > 0 ? box.height - core.height : undefined;
  const shown = kpiPartsShown(room, { trend: trend !== undefined, target: goal !== undefined });

  // Its name above its value, as the prototype's kpiHtml has them (T300),
  // and under it the marked share, as its renderMarked has it (T453).
  const top = (
    <>
      {period === undefined ? (
        name
      ) : (
        <div className="kpi__head">
          {name}
          <span className="kpi__period" data-testid="kpi-period">
            {period}
          </span>
        </div>
      )}
      <p className="kpi__value" data-testid="kpi-value">
        {/* The measure's own format, so a currency KPI reads as money
            (AC-046). FORMAT is the fallback for a member that declares none. */}
        {measure === undefined
          ? FORMAT.format(value)
          : formatValue(value, measure, spec.formats ?? {})}
      </p>
      {compared === undefined || measure === undefined ? null : (
        <KpiChange
          current={value}
          compared={compared}
          member={measure}
          formats={spec.formats}
          direction={kpi.direction}
        />
      )}
      {needsTime === undefined ? null : (
        <p className="kpi__needs" data-testid="kpi-needs-time" role="status">
          {needsTime}
          {onAddTime === undefined ? null : (
            <>
              {' '}
              <button type="button" className="btn btn-sm" onClick={onAddTime}>
                + Time
              </button>
            </>
          )}
        </p>
      )}
      {marked === undefined ? null : (
        <p className="kpi__marked">
          {/* The swatch is decorative; the words carry the meaning (AC-098). */}
          <span className="mark-badge" data-testid="kpi-marked">
            <span
              className="mark-badge__swatch"
              data-testid="kpi-marked-swatch"
              aria-hidden="true"
              style={{ background: marked.colour }}
            />
            {marked.text}
          </span>
        </p>
      )}
    </>
  );
  if (!detailed)
    return (
      <div className={className} data-testid="kpi" ref={measured}>
        {top}
      </div>
    );
  return (
    <div className={className} data-testid="kpi" ref={measured}>
      <div className="kpi__core" ref={measuredCore}>
        {top}
      </div>
      {trend === undefined || measure === undefined || kpi.time === undefined ? null : (
        <KpiTrendLoaded
          query={trend}
          spec={spec}
          measure={measure}
          time={kpi.time}
          width={box.width}
          shown={shown.trend}
        />
      )}
      {goal === undefined || measure === undefined ? null : (
        <KpiTarget
          value={value}
          target={goal}
          title={labelOf(spec, measure)}
          member={measure}
          formats={spec.formats}
          width={box.width}
          shown={shown.target}
        />
      )}
    </div>
  );
}
