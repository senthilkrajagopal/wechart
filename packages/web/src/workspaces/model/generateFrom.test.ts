import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';

import { GENERATE_KEY } from './GenerateCubes';
import { generateFrom } from './ModelFilePage';

/**
 * T492 (AC-350), with T451's switch (AC-254, R52): Generate cubes, opened on
 * a data source from its page or its row's ⋯, adds to My workspace's model,
 * to go to the data source's folder, wherever models are workspace-only:
 * signed in, and with sign-in off once models land through an approval.
 */
describe('Generate cubes opened on a data source (T492)', () => {
  it('opens My workspace’s model, going to the data source’s folder, where models are workspace-only', () => {
    const client = new QueryClient();

    expect(
      generateFrom(client, { source: 'warehouse', target: 'sales', workspaceOnly: true }),
    ).toBe('/explore/folders/mine/models');
    expect(client.getQueryData([...GENERATE_KEY, 'source'])).toBe('warehouse');
    expect(client.getQueryData([...GENERATE_KEY, 'target'])).toBe('sales');
  });

  it('opens the root’s model, going nowhere, only where models aren’t', () => {
    const client = new QueryClient();

    expect(
      generateFrom(client, { source: 'warehouse', target: 'sales', workspaceOnly: false }),
    ).toBe('/model');
    expect(client.getQueryData([...GENERATE_KEY, 'target'])).toBeUndefined();
  });
});
