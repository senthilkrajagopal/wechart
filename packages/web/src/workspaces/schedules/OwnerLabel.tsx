/**
 * Whose schedule it is, as an icon and words (T551, T552, AC-154; design 16,
 * screen 2 pin 5 and its legend): Cube's refresh worker by design 16's cube
 * icon; wechart's scheduler by its calendar, the one Jobs' starter column
 * draws for a schedule (T374).
 */
export function OwnerLabel({ owner }: { owner: 'cube' | 'wechart' }) {
  return (
    <span className="owner" data-testid="owner">
      <OwnerIcon owner={owner} />
      {owner === 'wechart' ? 'wechart' : 'Cube’s refresh worker'}
    </span>
  );
}

/** An owner's icon alone, as its rows and the owner filter draw it (T557; design 16, pin 4). */
export function OwnerIcon({ owner }: { owner: 'cube' | 'wechart' }) {
  if (owner === 'wechart')
    return (
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" data-icon="schedule">
        <rect
          x="2.2"
          y="3.2"
          width="11.6"
          height="10.6"
          rx="1.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
        />
        <path d="M2.2 6.5h11.6M5.3 1.8v2.8M10.7 1.8v2.8" stroke="currentColor" strokeWidth="1.4" />
        <circle cx="8" cy="10" r="1.3" fill="currentColor" />
      </svg>
    );
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" data-icon={owner}>
      <path
        d="M8 1.8l5.5 3v6.4L8 14.2l-5.5-3V4.8z M2.5 4.8L8 7.8l5.5-3M8 7.8v6.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  );
}
