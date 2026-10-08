/**
 * Jobs' and Schedules' action and empty-state icons, as design 16 draws
 * them (its `i-*` symbols; T613): New schedule's plus, Resume's and Run
 * now's play, Delete…'s bin, Rebuild selected's arrow, Run history's empty
 * clock, and the Not found pane's search. Beside words, never in place of
 * them, so hidden from a screen reader.
 */
export type ActionIconName = 'plus' | 'play' | 'trash' | 'refresh' | 'hist' | 'search';

export function ActionIcon({ name, size = 14 }: { name: ActionIconName; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 16 16',
    'aria-hidden': true,
    'data-icon': name,
    className: 'action-icon',
  } as const;
  switch (name) {
    case 'plus':
      return (
        <svg {...common}>
          <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.7" />
        </svg>
      );
    case 'play':
      return (
        <svg {...common}>
          <path d="M5 3.2v9.6L12.6 8z" fill="currentColor" />
        </svg>
      );
    case 'trash':
      return (
        <svg {...common}>
          <path
            d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 9h5.8l.6-9"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
          />
        </svg>
      );
    case 'refresh':
      return (
        <svg {...common}>
          <path
            d="M13 5.5A5.5 5.5 0 1 0 13.5 9M13.2 2.5v3h-3"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          />
        </svg>
      );
    case 'hist':
      return (
        <svg {...common}>
          <path
            d="M2.5 8a5.5 5.5 0 1 0 1.6-3.9M2.3 2.5v2.8h2.8"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
          />
          <path d="M8 5v3.2l2.2 1.4" fill="none" stroke="currentColor" strokeWidth="1.4" />
        </svg>
      );
    case 'search':
      return (
        <svg {...common}>
          <circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <path d="M10.5 10.5l3 3" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      );
  }
}
