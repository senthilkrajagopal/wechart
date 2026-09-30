import { describe, expect, it } from 'vitest';

import { chartRefusal, type ChartDependents } from './deleteChecks';

/**
 * What design 14's state A says of a library chart the shared folders'
 * dashboards use (T517, AC-362): those the user may see, each with its
 * folder; the rest counted; and how to free it.
 */
const SEEN: ChartDependents['dashboards'][number] = {
  id: 'd1',
  title: 'Revenue overview',
  folderId: 'f-emea',
  folderPath: [
    { id: 'f-sales', title: 'Sales' },
    { id: 'f-emea', title: 'EMEA' },
  ],
};

describe('a chart’s refusal (T517, AC-362; design 14, state A)', () => {
  it('is none where nothing uses it', () => {
    expect(chartRefusal({ dashboards: [], hidden: 0 }, { signedIn: true })).toBeUndefined();
  });

  it('names the dashboards the user may see, with their folders, counting the rest', () => {
    const refusal = chartRefusal(
      {
        dashboards: [SEEN, { id: 'd2', title: 'Weekly', folderId: 'root', folderPath: [] }],
        hidden: 2,
      },
      { signedIn: true },
    );
    expect(refusal).toEqual({
      kind: 'refused',
      lead: '4 dashboards use it. Remove it from each of them, then delete it.',
      groups: [
        {
          heading: 'Dashboards that use it',
          rows: [
            {
              key: 'd1',
              icon: 'dashboard',
              name: 'Revenue overview',
              href: '/explore/dashboards/d1',
              where: 'Sales / EMEA',
            },
            {
              key: 'd2',
              icon: 'dashboard',
              name: 'Weekly',
              href: '/explore/dashboards/d2',
              where: 'Shared',
            },
          ],
        },
      ],
      hidden: 2,
      help: 'A shared dashboard changes through Edit in my workspace and a proposal.',
    });
  });

  it('says only how many, and when it can go, where every one is out of sight (A2)', () => {
    expect(chartRefusal({ dashboards: [], hidden: 2 }, { signedIn: true })).toEqual({
      kind: 'refused',
      lead: '2 dashboards use it, in folders you can’t see. It can be deleted once no dashboard uses it.',
    });
  });

  it('leaves the proposal line out with sign-in off, where dashboards change in place', () => {
    expect(
      chartRefusal({ dashboards: [SEEN], hidden: 0 }, { signedIn: false })?.help,
    ).toBeUndefined();
    expect(chartRefusal({ dashboards: [SEEN], hidden: 0 }, { signedIn: false })?.lead).toBe(
      '1 dashboard uses it. Remove it from the dashboard, then delete it.',
    );
  });

  it('says a dashboard took it up just now, where the delete itself was refused (A4)', () => {
    expect(
      chartRefusal({ dashboards: [SEEN], hidden: 0 }, { signedIn: true, justNow: true })?.lead,
    ).toBe('A dashboard started using it just now. Nothing was deleted.');
  });
});
