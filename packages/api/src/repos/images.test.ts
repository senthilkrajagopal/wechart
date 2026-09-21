import { randomUUID } from 'node:crypto';

import { afterAll, describe, expect, it } from 'vitest';

import { closeDb, getDb } from '../db/client';
import { imageStore } from './images';

/**
 * T069 / AC-063: an image tile's image, kept in the metadata database with the
 * dashboard it was added to ("stored with the dashboard", direction.md §2) —
 * read back byte for byte, as the type it was accepted as.
 */
const store = () => imageStore(getDb());

afterAll(async () => {
  await closeDb();
});

describe('image store', () => {
  it('keeps an image byte for byte, with its type', async () => {
    const id = randomUUID();
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 255, 128, 1]);

    await store().add({ id, dashboardId: 'd-images', contentType: 'image/png', bytes });
    const read = await store().get(id);

    expect(read?.contentType).toBe('image/png');
    expect(read?.bytes.equals(bytes)).toBe(true);
  });

  it('has nothing for an id it never kept', async () => {
    expect(await store().get(randomUUID())).toBeUndefined();
  });
});
