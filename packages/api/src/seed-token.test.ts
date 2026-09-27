import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { ConfigError, loadConfig } from './config';

/**
 * T443 (AC-310, AC-251): the token the install Job seeds the shared root's
 * `default` data source with — `WECHART_SEED_TOKEN`, or a file named by
 * `WECHART_SEED_TOKEN_FILE` (a mounted Secret). Unset, there is no seeding
 * route. A token short enough to guess is refused at start.
 */
const base = { CUBE_API_SECRET: 'secret' };
const TOKEN = 'k'.repeat(40);

describe('the install Job’s seeding token (T443)', () => {
  it('is none unless one is given', () => {
    expect(loadConfig(base).seedToken).toBeUndefined();
  });

  it('is taken from the setting, or the file it names', () => {
    expect(loadConfig({ ...base, WECHART_SEED_TOKEN: TOKEN }).seedToken).toBe(TOKEN);
    const file = join(mkdtempSync(join(tmpdir(), 'seed-')), 'token');
    writeFileSync(file, `${TOKEN}\n`);
    expect(loadConfig({ ...base, WECHART_SEED_TOKEN_FILE: file }).seedToken).toBe(TOKEN);
  });

  it('refuses one shorter than 32 characters, or a file it can’t read', () => {
    expect(() => loadConfig({ ...base, WECHART_SEED_TOKEN: 'short' })).toThrow(ConfigError);
    expect(() => loadConfig({ ...base, WECHART_SEED_TOKEN_FILE: '/no/such/seed-token' })).toThrow(
      ConfigError,
    );
  });
});
