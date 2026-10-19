import type { ChartDocument, DashboardParameter, TextNode } from '@wechart/core';

import type { DashboardDocument } from '../model/document';

/** For the Parameters section's tests (T896–T900): a model of two cubes. */
export const META = {
  cubes: [
    {
      name: 'orders',
      title: 'Orders',
      measures: [
        { name: 'orders.revenue', title: 'Orders Revenue', shortTitle: 'Revenue', type: 'number' },
        { name: 'orders.count', title: 'Orders Count', shortTitle: 'Count', type: 'number' },
        {
          name: 'orders.margin_pct',
          title: 'Orders Margin %',
          shortTitle: 'Margin %',
          type: 'number',
        },
      ],
      dimensions: [
        { name: 'orders.status', title: 'Orders Status', shortTitle: 'Status', type: 'string' },
      ],
    },
    {
      name: 'customers',
      title: 'Customers',
      measures: [],
      dimensions: [
        {
          name: 'customers.country',
          title: 'Customers Country',
          shortTitle: 'Country',
          type: 'string',
        },
      ],
    },
  ],
};

export const METRIC: DashboardParameter = {
  id: 'p-metric',
  name: 'Metric to show',
  kind: 'fieldSwitch',
  role: 'measure',
  choices: [
    { member: 'orders.revenue', label: 'Revenue' },
    { member: 'orders.count', label: 'Orders' },
    { member: 'orders.margin_pct', label: 'Margin %' },
  ],
  default: 'orders.revenue',
};

export const BREAKDOWN: DashboardParameter = {
  id: 'p-break',
  name: 'Break down by',
  kind: 'fieldSwitch',
  role: 'dimension',
  choices: [
    { member: 'customers.country', label: 'Country' },
    { member: 'orders.status', label: 'Status' },
  ],
  default: 'customers.country',
};

const paragraph = (node: TextNode): TextNode => ({ type: 'paragraph', content: [node] });

/**
 * A dashboard using Metric to show three times — a chart's Metrics well, a
 * parameter control and a Value — and Break down by once, in the chart's
 * Dimensions well.
 */
export const DOC: DashboardDocument = {
  schemaVersion: 1,
  title: 'Revenue overview',
  settings: { width: 'fixed' },
  parameters: [METRIC, BREAKDOWN],
  pages: [
    {
      id: 'p1',
      title: 'Overview',
      items: [
        { id: 't-chart', kind: 'chart', w: 6, h: 40, chartId: 'c1' },
        {
          id: 't-controls',
          kind: 'text',
          w: 6,
          h: 20,
          document: {
            version: 1,
            doc: {
              type: 'doc',
              content: [paragraph({ type: 'parameterControl', attrs: { parameter: 'p-metric' } })],
            },
          },
        },
        {
          id: 't-summary',
          kind: 'text',
          w: 6,
          h: 20,
          document: {
            version: 1,
            doc: {
              type: 'doc',
              content: [paragraph({ type: 'value', attrs: { parameter: 'p-metric' } })],
            },
          },
        },
      ],
    },
  ],
};

export const CHART: ChartDocument = {
  schemaVersion: 2,
  title: 'Revenue by month',
  localToDashboardId: 'd1',
  chart: {
    source: { cube: 'orders' },
    wells: {
      measures: ['parameter:p-metric'],
      dimensions: ['parameter:p-break'],
      timeDimensions: [],
    },
  },
};
