import { describe, expect, it } from 'vitest';

import type { Config } from './config';
import { buildServer, type ImageStore } from './server';

/**
 * T069 / AC-063: … THE SYSTEM SHALL accept only PNG, JPEG, WebP, GIF and SVG
 * files of at most 2 MB (direction.md rule 42).
 * Fails when: … a file of another type or over 2 MB is accepted.
 *
 * The server's side: it stores only what the rule accepts, whatever a browser
 * sends, and serves an image as the type it was accepted as, never as a page
 * that could run script — an SVG can carry script.
 */
const config: Config = {
  port: 0,
  cubeApiUrl: 'http://cube.invalid/cubejs-api/v1',
  cubeApiSecret: 'secret',
  securityContext: {},
};

function memoryImages(): ImageStore & {
  stored: Map<string, { contentType: string; bytes: Buffer }>;
} {
  const stored = new Map<string, { contentType: string; bytes: Buffer }>();
  return {
    stored,
    async add({ id, contentType, bytes }) {
      stored.set(id, { contentType, bytes });
    },
    async get(id) {
      return stored.get(id);
    },
  };
}

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

async function upload(images: ImageStore, body: Record<string, unknown>) {
  const app = buildServer({ config, images });
  const response = await app.inject({
    method: 'POST',
    url: '/api/dashboards/d1/images',
    payload: body,
  });
  return { app, response };
}

describe('adding an image to a dashboard', () => {
  it('stores a PNG and answers with its id', async () => {
    const images = memoryImages();
    const { app, response } = await upload(images, {
      contentType: 'image/png',
      data: PNG.toString('base64'),
    });

    expect(response.statusCode).toBe(201);
    const { id, contentType, size } = response.json<{
      id: string;
      contentType: string;
      size: number;
    }>();
    expect([contentType, size]).toEqual(['image/png', PNG.length]);
    expect(images.stored.get(id)?.bytes.equals(PNG)).toBe(true);
    await app.close();
  });

  it('refuses another type, a renamed file, and one over 2 MB — storing nothing', async () => {
    const images = memoryImages();
    const refused = async (body: Record<string, unknown>) => {
      const { app, response } = await upload(images, body);
      await app.close();
      return [response.statusCode, response.json<{ error: string }>().error];
    };

    expect(
      await refused({
        contentType: 'application/pdf',
        data: Buffer.from('%PDF-1.7').toString('base64'),
      }),
    ).toEqual([422, 'Only PNG, JPEG, WebP, GIF and SVG images can be added.']);
    expect(
      await refused({ contentType: 'image/png', data: Buffer.from('GIF89a..').toString('base64') }),
    ).toEqual([422, 'This file is not the image type it claims to be.']);
    const big = Buffer.concat([PNG, Buffer.alloc(2_000_000)]);
    expect(await refused({ contentType: 'image/png', data: big.toString('base64') })).toEqual([
      422,
      'Images can be at most 2 MB; this one is 2.0 MB.',
    ]);
    expect(images.stored.size).toBe(0);
  });

  it('refuses a body that is not an image upload at all', async () => {
    const images = memoryImages();
    const { app, response } = await upload(images, { contentType: 'image/png' });
    expect(response.statusCode).toBe(400);
    expect(images.stored.size).toBe(0);
    await app.close();
  });
});

describe('an image, served', () => {
  it('as the type it was accepted as, never sniffed, and sandboxed', async () => {
    const images = memoryImages();
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    );
    await images.add({ id: 'i1', dashboardId: 'd1', contentType: 'image/svg+xml', bytes: svg });
    const app = buildServer({ config, images });

    const response = await app.inject({ method: 'GET', url: '/api/images/i1' });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('image/svg+xml');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    // Opened on its own, an SVG's script must not run.
    expect(response.headers['content-security-policy']).toBe(
      "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    );
    expect(response.rawPayload.equals(svg)).toBe(true);
    await app.close();
  });

  it('as not found when there is no such image', async () => {
    const app = buildServer({ config, images: memoryImages() });
    const response = await app.inject({ method: 'GET', url: '/api/images/nope' });
    expect(response.statusCode).toBe(404);
    await app.close();
  });
});
