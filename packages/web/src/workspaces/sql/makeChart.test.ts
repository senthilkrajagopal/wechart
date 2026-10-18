import { describe, expect, it, vi } from 'vitest';

import { editorWithCube, makeChartOver } from './makeChart';
import { OPENED_WITH } from '../../editor/openChart';

/**
 * T821 (AC-463): WHEN the user chooses Make a chart… and then Add and make a
 * chart, THE SYSTEM SHALL save the cube as AC-462 does and open the chart
 * editor on a new chart in My workspace, whose target folder is the cube's,
 * with the new cube chosen in the field tree, nothing placed, and "← Back
 * to SQL runner".
 * Fails when: the chart starts with any field placed; the new cube isn't
 * chosen; the chart's target folder differs from the cube's; the chart lands
 * outside My workspace; or there is no way back to the SQL runner.
 */
describe('makeChartOver (T821, AC-463)', () => {
  it('makes a new chart in My workspace to go to the cube’s folder, and names the editor on it, its cube and the tab', async () => {
    const asked: { url: string; init: RequestInit | undefined }[] = [];
    const fetchImpl = vi.fn((url: string, init?: RequestInit) => {
      asked.push({ url, init });
      return Promise.resolve(
        new Response(JSON.stringify({ kind: 'chart', id: 'c 1', title: 'Untitled chart', folderId: 'mine' }), {
          status: 201,
        }),
      );
    });

    const href = await makeChartOver({ cube: 'top_orders', targetFolderId: 'f-sales', tabId: 'ab12cd34' }, fetchImpl);

    expect(asked).toHaveLength(1);
    expect(asked[0]!.url).toBe('/api/documents');
    expect(asked[0]!.init?.method).toBe('POST');
    expect(JSON.parse(String(asked[0]!.init?.body))).toEqual({
      kind: 'chart',
      title: 'Untitled chart',
      folderId: 'mine',
      targetFolderId: 'f-sales',
    });
    expect(href).toBe('/explore/charts/c%201/edit?new=true&cube=top_orders&sql=ab12cd34');
  });

  it('says why where the chart couldn’t be made', async () => {
    const fetchImpl = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify({ error: 'No room.' }), { status: 400 })),
    );
    await expect(
      makeChartOver({ cube: 'x', targetFolderId: 'f', tabId: 't' }, fetchImpl),
    ).rejects.toThrow('The chart couldn’t be made: No room.');
  });
});

describe('editorWithCube (T821, AC-463)', () => {
  it('opens a new chart on the cube, nothing placed', () => {
    const opened = editorWithCube(OPENED_WITH, 'top_orders');
    expect(opened.cubeName).toBe('top_orders');
    expect(opened.spec.cube).toBe('top_orders');
    expect(opened.spec.measures).toEqual([]);
    expect(opened.spec.dimensions).toEqual([]);
    expect(opened.spec.timeDimensions).toEqual([]);
  });

  it('leaves a chart that has a cube as it is', () => {
    const had = editorWithCube(OPENED_WITH, 'orders');
    expect(editorWithCube(had, 'other')).toBe(had);
  });

  it('leaves it as it is with no cube named', () => {
    expect(editorWithCube(OPENED_WITH, undefined)).toBe(OPENED_WITH);
  });
});
