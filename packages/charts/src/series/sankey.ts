/**
 * The Sankey (T987, AC-611; design 23 sheet 10; direction.md rules 153, 165):
 * volume flowing between 2 to 4 steps, a column of nodes a step, each node a
 * member of its step's dimension, and a link for each pair of adjacent steps'
 * members the rows join, as wide as the sum of their measure.
 *
 * ECharts' own `sankey` series (research/echarts-sankey.md): nodes 12 px
 * wide, each in its step's column (`depth`), named uniquely — a member that a
 * later step holds again is split as "‹member› (2)", since ECharts draws only
 * acyclic flows and refuses two nodes of one name. Past 50 flows, each step
 * keeps the members carrying the largest flows and folds the rest into
 * "Other", so no more than 50 are drawn and nothing is dropped.
 */
import {
  formatterFor,
  membersOn,
  OTHER_LABEL,
  sankeyLinksOf,
  sankeyOf,
  type RenderSpec,
  type SankeyColourBy,
} from '@wechart/core';
import { COLORS } from '@wechart/ui';
import { format } from 'echarts/core';

import { OTHER_COLOUR } from '../colorAssignment';
import { colourFor } from '../colours';
import type { EChartsOption } from '../theme';
import { CHART_FONT } from '../themed';
import { DEFAULT_CANVAS, type Canvas } from './bar';

export function isSankeyType(chartType: string): boolean {
  return chartType === 'sankey';
}

/** The most flows drawn (23-Q5 (a), Cube Cloud's); past it, each step folds into "Other". */
export const SANKEY_FLOW_CAP = 50;
/** A node's width, in pixels (AC-611). */
export const SANKEY_NODE_PX = 12;
/** A link's opacity, and a hovered one's (AC-611). */
export const LINK_OPACITY = 0.4;
export const LINK_HOVER_OPACITY = 0.6;

/** The other steps' nodes: `text-secondary`, as in-chart text is (in the light theme's ink). */
const GREY = COLORS.light['text-secondary'];
const LABEL_FONT = `12px ${CHART_FONT}`;
/** The room between a label and its node, and the tile's edge. */
const LABEL_GAP_PX = 8;

type Row = Readonly<Record<string, unknown>>;

/** A node as drawn: its unique name, its step, and the member it is. */
export interface SankeyNode {
  readonly name: string;
  readonly step: number;
  readonly member: string;
}

/** A flow as drawn, between two nodes by their names. */
export interface SankeyFlow {
  readonly from: number;
  readonly source: string;
  readonly target: string;
  /** The members the two nodes are, as the rows hold them ("Other" where folded). */
  readonly sourceMember: string;
  readonly targetMember: string;
  readonly value: number;
}

export interface SankeyDrawn {
  readonly steps: readonly string[];
  readonly measure: string | undefined;
  readonly colourLinksBy: SankeyColourBy;
  readonly nodes: readonly SankeyNode[];
  readonly flows: readonly SankeyFlow[];
  /** How many flows the rows hold before any fold. */
  readonly flowCount: number;
  /** Whether a step folded members into "Other". */
  readonly folded: boolean;
  /** Each member split because a later step holds it again, with the steps that hold it. */
  readonly repeated: readonly { readonly member: string; readonly steps: readonly number[] }[];
  /** Why it isn't drawn, where it isn't. */
  readonly refusal?: string;
}

/** The members each step keeps: those carrying the `top` largest flows. */
function keptBy(
  links: readonly { from: number; source: string; target: string; value: number }[],
  steps: number,
  top: number,
): Set<string>[] {
  const kept = Array.from({ length: steps }, () => new Set<string>());
  const ranked = [...links].sort((a, b) => b.value - a.value);
  for (const link of ranked.slice(0, top)) {
    kept[link.from]?.add(link.source);
    kept[link.from + 1]?.add(link.target);
  }
  return kept;
}

/**
 * What a Sankey draws from a spec (AC-611): its steps' nodes and flows,
 * folded past 50 flows, each node uniquely named. The series, the notes,
 * the text alternative and the table view all read this.
 */
export function sankeyDrawnOf(spec: RenderSpec): SankeyDrawn {
  const steps = membersOn(spec.encoding, 'x');
  const sankey = sankeyOf(
    {
      wells: { measures: membersOn(spec.encoding, 'y'), dimensions: steps },
      options: spec.options,
    },
    spec.measureTypes ?? {},
    spec.titles ?? {},
  );
  const { measure, colourLinksBy } = sankey;
  const none = {
    steps,
    measure,
    colourLinksBy,
    nodes: [],
    flows: [],
    flowCount: 0,
    folded: false,
    repeated: [],
  };
  if (sankey.refusal !== undefined) return { ...none, refusal: sankey.refusal };
  if (measure === undefined || steps.length < 2) return none;

  const original = sankeyLinksOf(spec.rows, steps, measure);
  // Past the cap, each step keeps the members carrying the largest flows,
  // as few fewer as it takes for what is drawn, "Other" included, to be
  // within the cap (decision T987-2).
  let links = original;
  let folded = false;
  for (let top = SANKEY_FLOW_CAP; links.length > SANKEY_FLOW_CAP && top > 0; top -= 1) {
    const kept = keptBy(original, steps.length, top);
    const rows: Row[] = spec.rows.map((row) => {
      const next: Record<string, unknown> = { ...row };
      steps.forEach((step, at) => {
        if (!kept[at]!.has(String(row[step] ?? ''))) next[step] = OTHER_LABEL;
      });
      return next;
    });
    links = sankeyLinksOf(rows, steps, measure);
    folded = true;
  }

  // Each step's members in the order the rows first hold them; a name a
  // step before has taken is split "‹member› (n)".
  const taken = new Map<string, number[]>();
  const nameOf = new Map<string, string>();
  const nodes: SankeyNode[] = [];
  steps.forEach((_step, at) => {
    const members: string[] = [];
    for (const link of links) {
      const member =
        link.from === at ? link.source : link.from + 1 === at ? link.target : undefined;
      if (member !== undefined && !members.includes(member)) members.push(member);
    }
    for (const member of members) {
      const before = taken.get(member) ?? [];
      const name = before.length === 0 ? member : `${member} (${String(before.length + 1)})`;
      taken.set(member, [...before, at]);
      nameOf.set(`${String(at)}\u0000${member}`, name);
      nodes.push({ name, step: at, member });
    }
  });
  const repeated = [...taken]
    .filter(([member, held]) => held.length > 1 && !(folded && member === OTHER_LABEL))
    .map(([member, held]) => ({ member, steps: held }));
  const node = (step: number, member: string) =>
    nameOf.get(`${String(step)}\u0000${member}`) ?? member;
  const flows = links.map((link) => ({
    from: link.from,
    source: node(link.from, link.source),
    target: node(link.from + 1, link.target),
    sourceMember: link.source,
    targetMember: link.target,
    value: link.value,
  }));
  return {
    steps,
    measure,
    colourLinksBy,
    nodes,
    flows,
    flowCount: original.length,
    folded,
    repeated,
  };
}

/**
 * What a Sankey says of how it drew (AC-611; rule 165), in the page's text
 * under it: each member split because a later step holds it again, and the
 * fold past 50 flows.
 */
export function sankeyNotes(spec: RenderSpec): string[] {
  const drawn = sankeyDrawnOf(spec);
  const ordinal = (n: number) => String(n + 1);
  return [
    ...drawn.repeated.map(({ member, steps }) => {
      const where =
        steps.length === 2
          ? `steps ${ordinal(steps[0]!)} and ${ordinal(steps[1]!)}`
          : `steps ${steps.slice(0, -1).map(ordinal).join(', ')} and ${ordinal(steps.at(-1)!)}`;
      return `${member} is in ${where}; the second is drawn as "${member} (2)", since flows can’t loop back.`;
    }),
    ...(drawn.folded
      ? [
          `${drawn.flowCount.toLocaleString('en-US')} flows: each step keeps the members carrying its top ${String(SANKEY_FLOW_CAP)} flows and folds the rest into "${OTHER_LABEL}".`,
        ]
      : []),
  ];
}

export function sankeyOption(spec: RenderSpec, canvas: Canvas = DEFAULT_CANVAS): EChartsOption {
  if (!isSankeyType(spec.chartType)) throw new Error(`${spec.chartType} is not a Sankey`);
  const drawn = sankeyDrawnOf(spec);
  // Nothing while it can't be drawn: the editor says why (T986-1).
  if (drawn.nodes.length === 0) return { animation: false, series: [] };

  const write = formatterFor(drawn.measure ?? '', spec.formats ?? {});
  const last = drawn.steps.length - 1;
  // The step whose members colour the links: the first by Source, the last
  // by Target (decision T987-1); the others' nodes grey.
  const colouring = drawn.colourLinksBy === 'source' ? 0 : last;
  const coloured = drawn.nodes.filter((one) => one.step === colouring);
  const colourOf = (one: SankeyNode) => {
    if (one.step !== colouring) return GREY;
    if (drawn.folded && one.member === OTHER_LABEL) return OTHER_COLOUR;
    return colourFor(spec, one.member, coloured.indexOf(one));
  };

  // Each node's total, for its label's room: the larger of what flows in and out.
  const totals = new Map<string, number>();
  for (const flow of drawn.flows) {
    totals.set(`out:${flow.source}`, (totals.get(`out:${flow.source}`) ?? 0) + flow.value);
    totals.set(`in:${flow.target}`, (totals.get(`in:${flow.target}`) ?? 0) + flow.value);
  }
  const totalOf = (name: string) =>
    Math.max(totals.get(`out:${name}`) ?? 0, totals.get(`in:${name}`) ?? 0);
  const label = (name: string, value: number) => `${name}\n${write(value)}`;
  const widest = (step: number) =>
    Math.max(
      0,
      ...drawn.nodes
        .filter((one) => one.step === step)
        .flatMap((one) =>
          label(one.name, totalOf(one.name))
            .split('\n')
            .map((line) => format.getTextRect(line, LABEL_FONT).width),
        ),
    );
  // The first step's labels to its left, the others' to their right; the
  // plot keeps room for the outer two.
  const left = Math.ceil(widest(0) + 2 * LABEL_GAP_PX);
  const right = Math.ceil(widest(last) + 2 * LABEL_GAP_PX);

  return {
    animation: false,
    series: [
      {
        type: 'sankey',
        name: drawn.measure ?? '',
        left,
        right: Math.min(right, Math.max(canvas.width / 3, 0)),
        top: 12,
        bottom: 12,
        nodeWidth: SANKEY_NODE_PX,
        nodeGap: 8,
        draggable: false,
        data: drawn.nodes.map((one) => ({
          name: one.name,
          depth: one.step,
          itemStyle: { color: colourOf(one) },
          label: { position: one.step === 0 ? 'left' : 'right' },
        })),
        links: drawn.flows.map((flow) => ({
          source: flow.source,
          target: flow.target,
          value: flow.value,
        })),
        label: {
          show: true,
          fontSize: 12,
          formatter: (params: { name: string; value: number }) => label(params.name, params.value),
        },
        lineStyle: { color: drawn.colourLinksBy, opacity: LINK_OPACITY, curveness: 0.5 },
        // Hovered, a link keeps its colour (ECharts would lift it) at 0.6;
        // the others stay as they are.
        emphasis: {
          focus: 'none',
          lineStyle: { color: drawn.colourLinksBy, opacity: LINK_HOVER_OPACITY },
        },
      },
    ],
  };
}
