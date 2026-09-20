import type { ChartType } from '@wechart/core';
import { REQUIREMENTS } from '@wechart/recommender';
import { describe, expect, it } from 'vitest';

import { isTile } from '../model/document';
import {
  NOTHING_CHOSEN,
  SECTION_TEMPLATES,
  needsOf,
  templateElements,
  type TemplateId,
} from './templates';

/**
 * T074 / AC-068: WHEN the user adds a section template, THE SYSTEM SHALL
 * insert its tiles as empty charts that state what they need, rather than
 * charts bound to sample data.
 * `Fails when: a template inserts a chart already bound to fields the user did
 * not choose.`
 *
 * The criterion is the whole reason templates are worth having and the whole
 * way they go wrong. A template's appeal is that it fills a section in one
 * click; the temptation is to fill it with something that looks finished, and
 * a chart bound to fields nobody picked is a chart that quietly answers a
 * question nobody asked. So every case below runs over *every* template rather
 * than a chosen one: a template added later is covered the day it is added,
 * which is exactly when this is easy to get wrong.
 */
const ids = () => SECTION_TEMPLATES.map((template) => template.id);

/** Every element every template inserts, flattened. */
const everyElement = () =>
  SECTION_TEMPLATES.flatMap((template) => {
    let n = 0;
    return templateElements(template.id, () => `t${template.id}-${String(n++)}`);
  });

const everyChart = () =>
  everyElement().filter((element) => isTile(element) && element.kind === 'chart');

describe('section templates', () => {
  it('offers the three the prototype defines', () => {
    expect(ids()).toEqual(['kpis', 'two', 'notes']);
  });

  it('inserts a chart bound to nothing at all', () => {
    const charts = everyChart();
    expect(charts.length).toBeGreaterThan(0);

    for (const chart of charts) {
      // The criterion's failing state, asserted directly: a chart carrying a
      // chartId is a chart bound to fields the user did not choose, because
      // the only way a chart has fields is that someone put them there.
      expect(chart).not.toHaveProperty('chartId', expect.anything());
      expect('chartId' in chart ? chart.chartId : undefined).toBeUndefined();
    }
  });

  it('states what every chart needs, whatever type it was given', () => {
    /**
     * The other half of the criterion, and the half a "bound to nothing" check
     * cannot reach: a tile can be perfectly unbound and still say nothing at
     * all, which leaves the user a blank rectangle and no idea what to do with
     * it.
     *
     * Every chart is asked, not only the ones carrying a type. A template may
     * leave the type open — the prototype's "Two charts" does, because the
     * recommender picks once there are fields — and an open one still has to
     * say something.
     */
    for (const chart of everyChart()) {
      const wanted = 'chartType' in chart ? (chart.chartType as ChartType | undefined) : undefined;
      if (wanted !== undefined) expect(Object.keys(REQUIREMENTS)).toContain(wanted);

      const said = needsOf(wanted);
      expect(said.length).toBeGreaterThan(0);
      expect(said.join(' ')).toMatch(/needs|no fields/i);
    }
  });

  it('says something for every type a template could ever use', () => {
    /**
     * `describeMissing` is empty for a type that requires nothing — `table` is
     * one — so a template using it would insert a tile that states nothing.
     * Rather than forbid those types, the empty message falls back, and this
     * holds that for every type rather than for the three in use today.
     */
    for (const type of Object.keys(REQUIREMENTS) as ChartType[]) {
      expect(needsOf(type).length).toBeGreaterThan(0);
    }
  });

  it('mints a fresh id for every element, so two uses of a template do not collide', () => {
    let n = 0;
    const mint = () => `id-${String(n++)}`;
    const first = templateElements('kpis', mint);
    const second = templateElements('kpis', mint);

    const all = [...first, ...second].map((element) => element.id);
    expect(new Set(all).size).toBe(all.length);
  });

  it('lays out the widths and heights its hint advertises', () => {
    /**
     * The hint is a promise about geometry — "3 columns each", "6 + 6", "8 +
     * markdown 4" — and it is the only thing the user has to go on before
     * clicking. Asserting the hints are non-empty strings, which is what this
     * checked first, cannot fail for any wording and cannot notice the KPI row
     * becoming four full-width tiles.
     */
    const sizes = (id: TemplateId) => {
      let n = 0;
      return templateElements(id, () => `s${String(n++)}`).map((element) =>
        isTile(element) ? `${String(element.w)}x${String(element.h ?? 0)}` : 'unsized',
      );
    };

    expect(sizes('kpis')).toEqual(['3x13', '3x13', '3x13', '3x13']);
    expect(sizes('two')).toEqual(['6x40', '6x40']);
    expect(sizes('notes')).toEqual(['8x40', '4x40']);

    // And the hints still say so, so the two cannot drift apart silently.
    const hint = (id: TemplateId) =>
      SECTION_TEMPLATES.find((template) => template.id === id)?.hint ?? '';
    expect(hint('kpis')).toContain('3 columns each');
    expect(hint('two')).toContain('6 + 6');
    expect(hint('notes')).toContain('8 + markdown 4');
  });

  it('survives a stored type it does not recognise', () => {
    /**
     * `chartType` is persisted, so it arrives from the database, and
     * `dashboardOf` checks the shape of a dashboard rather than every value
     * inside it. `describeMissing` indexes its table directly, so an
     * unrecognised type threw inside render with no boundary above it — the
     * blank-page failure `DashboardPage` already carries a note about.
     *
     * A tile whose type means nothing here is a tile with nothing chosen, as
     * far as this can tell.
     */
    expect(() => needsOf('barr' as ChartType)).not.toThrow();
    expect(needsOf('barr' as ChartType)).toEqual([NOTHING_CHOSEN]);
  });

  it('names the state a chart with no fields is in', () => {
    // Used by the tile itself; a chart the user has not filled in is empty,
    // not missing, and the two must not share a message.
    expect(NOTHING_CHOSEN).toMatch(/no fields/i);
  });
});
