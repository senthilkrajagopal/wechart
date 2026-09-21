import { describe, expect, it } from 'vitest';

import { IMAGE_MAX_BYTES, IMAGE_TYPES, imageProblem } from './images';

/**
 * T069 / AC-063: … THE SYSTEM SHALL accept only PNG, JPEG, WebP, GIF and SVG
 * files of at most 2 MB (direction.md rule 42).
 * Fails when: … a file of another type or over 2 MB is accepted.
 *
 * One rule, used by the browser before it sends a file and by the server
 * before it stores one. The type is checked by what the file begins with,
 * not only by what it is called — a renamed file is not a PNG.
 */
const bytes = (...values: number[]) => new Uint8Array(values);
/** ASCII text as bytes. */
const text = (value: string) => Uint8Array.from(value, (char) => char.charCodeAt(0));

const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0);
const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0);
const GIF = text('GIF89a....');
const WEBP = text('RIFF\0\0\0\0WEBPVP8 ');
const SVG = text('<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg"></svg>');

describe('an image file', () => {
  it('is accepted as PNG, JPEG, WebP, GIF or SVG, when it is what it says', () => {
    expect(IMAGE_TYPES).toEqual([
      'image/png',
      'image/jpeg',
      'image/webp',
      'image/gif',
      'image/svg+xml',
    ]);
    expect(imageProblem('image/png', PNG.length, PNG)).toBeUndefined();
    expect(imageProblem('image/jpeg', JPEG.length, JPEG)).toBeUndefined();
    expect(imageProblem('image/gif', GIF.length, GIF)).toBeUndefined();
    expect(imageProblem('image/webp', WEBP.length, WEBP)).toBeUndefined();
    expect(imageProblem('image/svg+xml', SVG.length, SVG)).toBeUndefined();
    expect(imageProblem('image/svg+xml', 20, text('<svg viewBox="0 0 1 1">'))).toBeUndefined();
    // After a UTF-8 byte-order mark.
    expect(
      imageProblem('image/svg+xml', 20, bytes(0xef, 0xbb, 0xbf, ...text('<svg>'))),
    ).toBeUndefined();
  });

  it('is refused as any other type', () => {
    expect(imageProblem('application/pdf', 10, text('%PDF-1.7'))).toBe(
      'Only PNG, JPEG, WebP, GIF and SVG images can be added.',
    );
    expect(imageProblem('image/bmp', 10, text('BM'))).toBe(
      'Only PNG, JPEG, WebP, GIF and SVG images can be added.',
    );
  });

  it('is refused when its contents are not the type it claims', () => {
    expect(imageProblem('image/png', 10, JPEG)).toBe(
      'This file is not the image type it claims to be.',
    );
    expect(imageProblem('image/svg+xml', 10, text('hello'))).toBe(
      'This file is not the image type it claims to be.',
    );
  });

  it('is accepted up to 2 MB, and refused past it', () => {
    expect(IMAGE_MAX_BYTES).toBe(2_000_000);
    expect(imageProblem('image/png', 2_000_000, PNG)).toBeUndefined();
    expect(imageProblem('image/png', 2_000_001, PNG)).toBe(
      'Images can be at most 2 MB; this one is 2.0 MB.',
    );
    expect(imageProblem('image/png', 3_600_000, PNG)).toBe(
      'Images can be at most 2 MB; this one is 3.6 MB.',
    );
  });
});
