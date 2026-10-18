import { emptySpec } from '@wechart/core';

import type { EditorState } from '../../editor/openChart';

/**
 * Make a chart… after its cube is saved (T821, AC-463; design 17 §6): a new
 * chart in My workspace, to go to the cube's folder, as New › Chart makes
 * one there (`POST /api/documents`), and the address of its editor, naming
 * the cube to start on and the tab to go back to.
 */
export async function makeChartOver(
  {
    cube,
    targetFolderId,
    tabId,
  }: { readonly cube: string; readonly targetFolderId: string; readonly tabId: string },
  fetchImpl: (url: string, init?: RequestInit) => Promise<Response> = fetch,
): Promise<string> {
  let response: Response;
  try {
    response = await fetchImpl('/api/documents', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'chart', title: 'Untitled chart', folderId: 'mine', targetFolderId }),
    });
  } catch {
    throw new Error('The chart couldn’t be made: wechart could not be reached.');
  }
  const said = (await response.json().catch(() => ({}))) as { id?: unknown; error?: unknown };
  if (!response.ok || typeof said.id !== 'string')
    throw new Error(
      `The chart couldn’t be made: ${typeof said.error === 'string' ? said.error : `error ${String(response.status)}`}`,
    );
  const search = new URLSearchParams({ new: 'true', cube, sql: tabId });
  return `/explore/charts/${encodeURIComponent(said.id)}/edit?${search.toString()}`;
}

/**
 * A new chart opened on the cube the address names: chosen in the field
 * tree, nothing placed, as choosing it in the picker would (T821). A chart
 * that has a cube already keeps its own.
 */
export function editorWithCube(state: EditorState, cube: string | undefined): EditorState {
  if (cube === undefined || cube === '' || state.cubeName !== '') return state;
  return { ...state, cubeName: cube, spec: emptySpec(cube) };
}
