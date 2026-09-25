import plexMonoItalic from '@ibm/plex-mono/fonts/complete/woff2/IBMPlexMono-Italic.woff2?url&no-inline';
import plexMono400 from '@ibm/plex-mono/fonts/complete/woff2/IBMPlexMono-Regular.woff2?url&no-inline';
import plexMono600 from '@ibm/plex-mono/fonts/complete/woff2/IBMPlexMono-SemiBold.woff2?url&no-inline';
// `no-inline` (ibm-plex-mono.md, "No inlining"): at 4,456 bytes the licence
// is close enough to Vite's 4,096-byte inlining limit that raising the limit
// would turn it into a data: URI inside a comment, and ship no file at all.
import plexMonoLicense from '@ibm/plex-mono/LICENSE.txt?url&no-inline';

/**
 * The code face, served with the app (T234, AC-223; direction.md §3 "IBM
 * Plex Mono"): IBM's own complete woff2 files from `@ibm/plex-mono`, byte for
 * byte, as the user chose (2026-09-24) — unmodified, so the Reserved Font
 * Name "Plex" may be used (docs/research/ibm-plex-mono.md, Licensing).
 *
 * Our own rules rather than IBM's CSS: the weights the UI uses (400 and 600)
 * and the italic its YAML comments are set in, and no `local()`, so an
 * installed copy of another version never stands in for the one shipped.
 * `swap`, so code reads in the fallback while the face arrives rather than
 * not at all.
 *
 * The face's copyright notice and licence travel with it (OFL condition 2):
 * the notice below, and IBM's licence text emitted beside the fonts.
 */
export const PLEX_MONO_FACES = `
/* IBM Plex Mono — Copyright © 2017 IBM Corp. with Reserved Font Name "Plex".
   Licensed under the SIL Open Font License, Version 1.1: ${plexMonoLicense} */
@font-face {
  font-family: 'IBM Plex Mono';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url('${plexMono400}') format('woff2');
}
@font-face {
  font-family: 'IBM Plex Mono';
  font-style: normal;
  font-weight: 600;
  font-display: swap;
  src: url('${plexMono600}') format('woff2');
}
@font-face {
  font-family: 'IBM Plex Mono';
  font-style: italic;
  font-weight: 400;
  font-display: swap;
  src: url('${plexMonoItalic}') format('woff2');
}
`;
