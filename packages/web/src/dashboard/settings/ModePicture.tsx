import type { InteractionMode } from './interactionMode';

/**
 * A mode card's picture (T685; design 05 pin 4): what the mode does, drawn
 * with the product's own chart marks. Markings: two items marked on one tile,
 * and their marked share on another. Cross-filtering: a clicked bar, and the
 * other tile filtered to it.
 *
 * For the eye alone: the card's words say the same, so it is hidden from
 * assistive technology. Its colours are the first two series slots and the
 * first marking's, as tokens (`styles.ts`, `.settings-modes__picture`), so a
 * dark theme draws it in its own.
 */
export function ModePicture({ mode }: { readonly mode: InteractionMode }) {
  const markings = mode === 'markings';
  return (
    <svg
      className="settings-modes__picture"
      width="360"
      height="104"
      viewBox="0 0 360 104"
      aria-hidden="true"
      focusable="false"
    >
      <rect className="settings-modes__frame" x="4" y="4" width="160" height="96" rx="4" />
      {markings ? (
        <g className="settings-modes__s1">
          <rect x="22" y="44" width="22" height="46" opacity=".28" />
          <rect x="50" y="24" width="22" height="66" className="settings-modes__marked" />
          <rect x="78" y="54" width="22" height="36" opacity=".28" />
          <rect x="106" y="34" width="22" height="56" className="settings-modes__marked" />
          <rect x="134" y="64" width="22" height="26" opacity=".28" />
        </g>
      ) : (
        <g className="settings-modes__s1">
          <rect x="22" y="44" width="22" height="46" opacity=".35" />
          <rect x="50" y="24" width="22" height="66" className="settings-modes__clicked" />
          <rect x="78" y="54" width="22" height="36" opacity=".35" />
          <rect x="106" y="34" width="22" height="56" opacity=".35" />
          <rect x="134" y="64" width="22" height="26" opacity=".35" />
        </g>
      )}
      <g className="settings-modes__arrow">
        <path d="M172 52h14" />
        <path d="M182 47l6 5-6 5" />
      </g>
      <rect className="settings-modes__frame" x="196" y="4" width="160" height="96" rx="4" />
      {markings ? (
        <g className="settings-modes__s2">
          <rect x="214" y="30" width="26" height="60" opacity=".28" />
          <rect x="214" y="58" width="26" height="32" />
          <rect x="250" y="40" width="26" height="50" opacity=".28" />
          <rect x="250" y="64" width="26" height="26" />
          <rect x="286" y="20" width="26" height="70" opacity=".28" />
          <rect x="286" y="46" width="26" height="44" />
          <rect x="322" y="50" width="26" height="40" opacity=".28" />
          <rect x="322" y="72" width="26" height="18" />
        </g>
      ) : (
        <g className="settings-modes__s2">
          <rect x="214" y="58" width="26" height="32" />
          <rect x="250" y="70" width="26" height="20" />
          <rect x="286" y="48" width="26" height="42" />
          <rect x="322" y="76" width="26" height="14" />
        </g>
      )}
      <g className="settings-modes__caption">
        <text x="12" y="18">
          {markings ? 'Mark here…' : 'Click a bar…'}
        </text>
        <text x="204" y="18">
          {markings ? '…marked share everywhere' : '…other tiles filter to it'}
        </text>
      </g>
    </svg>
  );
}
