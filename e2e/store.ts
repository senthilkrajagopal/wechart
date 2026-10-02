import { execFileSync } from 'node:child_process';

import { expect } from '@playwright/test';

/**
 * wechart's own store in the phase-1 stack (`playwright.config.ts`), asked
 * directly: for a state the app never puts a document in, which a spec must
 * set up all the same. Each statement ends `RETURNING id`, so its rows say
 * what it changed.
 */
export const psql = (sql: string): string =>
  execFileSync(
    'docker',
    [
      'exec',
      '-i',
      'wechart-meta',
      'psql',
      '-U',
      'wechart',
      '-d',
      'wechart_meta',
      '-v',
      'ON_ERROR_STOP=1',
      '-At',
      '-f',
      '-',
    ],
    { encoding: 'utf8', input: sql, stdio: ['pipe', 'pipe', 'pipe'] },
  ).trim();

/**
 * A chart gone from under the dashboards that show it. Nothing in the app
 * takes away a chart still in use (T517), and a save adds only a chart that
 * is there (T359, AC-254: the single user is held to that as a Super-Admin
 * is), so a spec puts a real chart on its dashboard and then takes it out of
 * the store here.
 */
export function chartGone(id: string): void {
  // The id as a literal: ours, made by the spec, never typed by a user.
  expect(id).toMatch(/^[0-9a-f-]+$/);
  expect(
    psql(`DELETE FROM documents WHERE kind = 'chart' AND id = '${id}' RETURNING id;`).split(
      '\n',
    )[0],
  ).toBe(id);
}
