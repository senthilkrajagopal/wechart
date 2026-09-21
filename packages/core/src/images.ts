/**
 * What an image tile may hold (AC-063, direction.md rule 42): PNG, JPEG,
 * WebP, GIF or SVG, of at most 2 MB. One rule for the browser, before it sends
 * a file, and for the server, before it stores one.
 *
 * The type is judged by the file's first bytes as well as by what it is
 * declared as: a renamed file is not the type its name says, and the server
 * serves each image as the type it was accepted as.
 */
export const IMAGE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/svg+xml',
] as const;

export type ImageType = (typeof IMAGE_TYPES)[number];

/**
 * "2 MB", read as 2,000,000 bytes: the stricter of the decimal and binary
 * readings, so no file over 2 MB by either is accepted.
 */
export const IMAGE_MAX_BYTES = 2_000_000;

/** How many of a file's first bytes `imageProblem` needs to see. */
export const IMAGE_HEAD_BYTES = 512;

const startsWith = (head: Uint8Array, expected: readonly number[], at = 0) =>
  expected.every((value, index) => head[at + index] === value);

const ascii = (text: string) => [...text].map((char) => char.charCodeAt(0));

/** The file's first bytes as text, for SVG: markup, possibly after a BOM. */
function leadingText(head: Uint8Array): string {
  // A UTF-8 byte-order mark, EF BB BF, may come first.
  const from = startsWith(head, [0xef, 0xbb, 0xbf]) ? 3 : 0;
  return String.fromCharCode(...head.subarray(from, IMAGE_HEAD_BYTES)).trimStart();
}

/** Whether the first bytes are those of the declared type. */
function looksLike(type: ImageType, head: Uint8Array): boolean {
  switch (type) {
    case 'image/png':
      return startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case 'image/jpeg':
      return startsWith(head, [0xff, 0xd8, 0xff]);
    case 'image/gif':
      return startsWith(head, ascii('GIF87a')) || startsWith(head, ascii('GIF89a'));
    case 'image/webp':
      return startsWith(head, ascii('RIFF')) && startsWith(head, ascii('WEBP'), 8);
    case 'image/svg+xml': {
      const start = leadingText(head);
      return start.startsWith('<svg') || (start.startsWith('<?xml') && start.includes('<svg'));
    }
  }
}

const isImageType = (type: string): type is ImageType =>
  (IMAGE_TYPES as readonly string[]).includes(type);

/**
 * Why a file cannot be an image tile's image, or undefined when it can.
 * `head` is at least its first `IMAGE_HEAD_BYTES` bytes (or all of it).
 */
export function imageProblem(type: string, size: number, head: Uint8Array): string | undefined {
  if (!isImageType(type)) return 'Only PNG, JPEG, WebP, GIF and SVG images can be added.';
  if (!looksLike(type, head)) return 'This file is not the image type it claims to be.';
  if (size > IMAGE_MAX_BYTES)
    return `Images can be at most 2 MB; this one is ${(size / 1_000_000).toFixed(1)} MB.`;
  return undefined;
}
