import type { ElementKind, TextNode } from '@wechart/core';

import type { InsertSources } from './InsertMenu';

/** How elements' sources read: a measure's title, a filter's or parameter's name. */
export interface ElementNames {
  readonly measure: (member: string) => string;
  /** A measure as the field picker paths it: "Orders › Revenue". */
  readonly measurePath: (member: string) => string;
  readonly filter: (id: string) => string | undefined;
  readonly parameter: (id: string) => string | undefined;
}

/** The names the insert menu's sources give (T881): titles of measures, names of filters. */
export function namesFrom(sources: InsertSources): ElementNames {
  const measures = new Map(
    sources.cubes.flatMap((cube) => cube.measures.map((measure) => [measure.name, measure.title])),
  );
  const paths = new Map(
    sources.cubes.flatMap((cube) =>
      cube.measures.map((measure) => [measure.name, `${cube.title} › ${measure.title}`]),
    ),
  );
  const filters = new Map(sources.filters.map((filter) => [filter.id, filter.name]));
  const parameters = new Map(
    (sources.parameters ?? []).map((parameter) => [parameter.id, parameter.name]),
  );
  return {
    measure: (member) => measures.get(member) ?? member,
    measurePath: (member) => paths.get(member) ?? member,
    filter: (id) => filters.get(id),
    parameter: (id) => parameters.get(id),
  };
}

const KIND_NAMES: Readonly<Record<ElementKind, string>> = {
  value: 'Value',
  change: 'Change',
  sparkline: 'Sparkline',
  icon: 'Icon',
  bulletGraph: 'Bullet graph',
  marking: 'Marking',
  filterValue: 'Filter value',
  asOf: 'As of',
  filterControl: 'Filter control',
  parameterControl: 'Parameter control',
  actionButton: 'Action button',
};

const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value !== '' ? value : undefined;

/**
 * An element's kind and its source, in words (T882, AC-519; design 21 pin
 * 13): "Change" and "Revenue against previous quarter".
 */
export function elementParts(
  node: Pick<TextNode, 'type' | 'attrs'>,
  names: ElementNames,
): { readonly kind: string; readonly source: string } {
  const kind = KIND_NAMES[node.type as ElementKind] ?? node.type;
  const attrs = node.attrs ?? {};
  const measure = text(attrs['measure']);
  const measureName = measure === undefined ? 'no measure yet' : names.measure(measure);
  switch (node.type) {
    case 'change':
      return {
        kind,
        source: `${measureName} against previous ${text(attrs['period']) ?? 'period'}`,
      };
    case 'icon': {
      const of = text(attrs['of']);
      return {
        kind,
        source: of === undefined ? measureName : `${measureName} as % of ${names.measure(of)}`,
      };
    }
    case 'marking':
      return { kind, source: text(attrs['marking']) ?? 'no marking yet' };
    case 'filterValue':
    case 'filterControl': {
      const id = text(attrs['filter']);
      return {
        kind,
        source:
          (id === undefined ? undefined : names.filter(id)) ??
          'a filter no longer on this dashboard',
      };
    }
    case 'parameterControl': {
      const id = text(attrs['parameter']);
      return {
        kind,
        source:
          (id === undefined ? undefined : names.parameter(id)) ??
          'a parameter no longer on this dashboard',
      };
    }
    case 'actionButton':
      return { kind, source: text(attrs['label']) ?? 'Button' };
    default:
      return { kind, source: measureName };
  }
}

/** An element's accessible name: its kind, then its source (AC-519). */
export function elementName(node: Pick<TextNode, 'type' | 'attrs'>, names: ElementNames): string {
  const { kind, source } = elementParts(node, names);
  return `${kind}, ${source}`;
}
