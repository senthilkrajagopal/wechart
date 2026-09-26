import { describe, expect, it } from 'vitest';

import type { Config } from './config';
import { buildServer, type ModelFileStore } from './server';

/**
 * T137 / AC-131: WHEN the user opens the Model workspace, THE SYSTEM SHALL
 * list the model files and show the cubes, views, measures, dimensions,
 * segments, hierarchies, joins and pre-aggregations each file defines.
 *
 * The server's part: every file, by its path, with its whole text — what
 * each defines is read from that text in the workspace, by the same parser
 * the editor will use.
 */
const config: Config = {
  port: 0,
  cubeApiUrl: 'http://cube.invalid/cubejs-api/v1',
  cubeApiSecret: 'secret',
  securityContext: {},
  modelDir: '',
};

const files = [
  { path: 'cubes/orders.yml', content: 'cubes:\n  - name: orders\n' },
  { path: 'views/summary.yml', content: 'views:\n  - name: summary\n' },
];

const memory = (): ModelFileStore => ({
  list: async () => files,
  seed: async () => undefined,
  write: async () => undefined,
});

describe('the model files', () => {
  // With their folder, the root's where none is asked for, and what each
  // defines, read by the model editor's parser (T334, AC-131).
  it('are served with their paths and their text', async () => {
    const app = buildServer({ config, modelFiles: memory() });

    const response = await app.inject({ method: 'GET', url: '/api/model/files' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      files: [
        {
          folderId: 'root',
          ...files[0],
          objects: [{ kind: 'cube', name: 'orders', members: [] }],
        },
        {
          folderId: 'root',
          ...files[1],
          objects: [{ kind: 'view', name: 'summary', members: [] }],
        },
      ],
    });
    await app.close();
  });

  it('are none, not an error, where no store is wired', async () => {
    const app = buildServer({ config });

    const response = await app.inject({ method: 'GET', url: '/api/model/files' });

    expect(response.json()).toEqual({ files: [] });
    await app.close();
  });
});
