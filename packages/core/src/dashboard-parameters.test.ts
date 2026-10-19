import { describe, expect, it } from 'vitest';

import {
  PARAMETER_CHOICE_LIMIT,
  dashboardParameterProblems,
  dashboardParametersProblems,
  parameterValueOf,
  type DashboardParameter,
} from './dashboard-parameters';

/**
 * T895 / AC-531: a dashboard parameter is "a name; what it switches, Measure
 * or Dimension …; its choices, members of the dashboard's cubes …, each with
 * the label its control shows, … at most 1,000; and a default among them".
 * `Fails when: … a 1,001st choice can be added; the default can be outside
 * the choices …`
 *
 * This is the stored shape and its check, shared by the browser and the API.
 */

const metric: DashboardParameter = {
  id: 'p1',
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

const roles: Record<string, 'measure' | 'dimension'> = {
  'orders.revenue': 'measure',
  'orders.count': 'measure',
  'orders.margin_pct': 'measure',
  'customers.country': 'dimension',
};
const roleOf = (member: string) => roles[member];

describe('a dashboard parameter (AC-531)', () => {
  it('passes as a Measure field switch of Revenue, Orders and Margin % defaulting to Revenue', () => {
    expect(dashboardParameterProblems(metric, roleOf)).toEqual([]);
    expect(dashboardParameterProblems(metric)).toEqual([]);
  });

  it('refuses a 1,001st choice, naming the limit', () => {
    const choices = Array.from({ length: PARAMETER_CHOICE_LIMIT + 1 }, (_, at) => ({
      member: `orders.m${String(at)}`,
      label: `M ${String(at)}`,
    }));
    expect(PARAMETER_CHOICE_LIMIT).toBe(1000);
    expect(dashboardParameterProblems({ ...metric, choices, default: 'orders.m0' })).toEqual([
      '“Metric to show” has 1,001 choices; a parameter holds at most 1,000.',
    ]);
  });

  it('refuses a default outside the choices, naming it', () => {
    expect(dashboardParameterProblems({ ...metric, default: 'orders.profit' })).toEqual([
      '“Metric to show” defaults to orders.profit, which isn’t one of its choices.',
    ]);
  });

  it('refuses a Dimension choice in a Measure parameter, naming the choice', () => {
    const mixed = {
      ...metric,
      choices: [...metric.choices, { member: 'customers.country', label: 'Country' }],
    };
    expect(dashboardParameterProblems(mixed, roleOf)).toEqual([
      '“Metric to show” switches a measure, and its choice Country (customers.country) is a dimension.',
    ]);
  });

  it('refuses an empty name', () => {
    expect(dashboardParameterProblems({ ...metric, name: '  ' })).toEqual([
      'A parameter needs a name.',
    ]);
  });

  it('refuses no choices, a choice twice, an unlabelled choice and a non-member', () => {
    expect(dashboardParameterProblems({ ...metric, choices: [], default: '' })).toEqual([
      '“Metric to show” has no choices; pick at least one.',
    ]);
    expect(
      dashboardParameterProblems({
        ...metric,
        choices: [...metric.choices, { member: 'orders.count', label: 'Again' }],
      }),
    ).toEqual(['“Metric to show” lists orders.count twice.']);
    expect(
      dashboardParameterProblems({
        ...metric,
        choices: [{ member: 'orders.revenue', label: ' ' }],
      }),
    ).toEqual(['“Metric to show”’s choice orders.revenue needs a label.']);
    expect(
      dashboardParameterProblems({
        ...metric,
        choices: [{ member: 'revenue', label: 'Revenue' }],
        default: 'revenue',
      }),
    ).toEqual(['“Metric to show”’s choice revenue isn’t a member, cube.member.']);
  });

  it('refuses a stored value of the wrong shape without throwing', () => {
    expect(dashboardParameterProblems({ id: 'p1', name: 'X', kind: 'whatIf' })).toEqual([
      'A parameter is a field switch, with an id, a name, a role, choices and a default.',
    ]);
    expect(dashboardParameterProblems(null)).toEqual([
      'A parameter is a field switch, with an id, a name, a role, choices and a default.',
    ]);
  });
});

describe("a dashboard's parameters", () => {
  it('refuses two with one id or one name', () => {
    expect(dashboardParametersProblems([metric, { ...metric }])).toEqual([
      'Two parameters have the id p1.',
      'Two parameters are named “Metric to show”.',
    ]);
    expect(dashboardParametersProblems(undefined)).toEqual([]);
    expect(dashboardParametersProblems([metric])).toEqual([]);
  });
});

describe('a parameter’s value', () => {
  it('is the chosen member while it is a choice, and the default otherwise', () => {
    expect(parameterValueOf(metric, undefined)).toBe('orders.revenue');
    expect(parameterValueOf(metric, 'orders.count')).toBe('orders.count');
    expect(parameterValueOf(metric, 'orders.gone')).toBe('orders.revenue');
  });
});
