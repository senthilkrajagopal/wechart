/**
 * Whose schedule it is, as an icon and words (T551, AC-154; design 16,
 * screen 2 pin 5): Cube's refresh worker by design 16's cube icon.
 */
export function OwnerLabel({ owner }: { owner: 'cube' }) {
  return (
    <span className="owner" data-testid="owner">
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" data-icon={owner}>
        <path
          d="M8 1.8l5.5 3v6.4L8 14.2l-5.5-3V4.8z M2.5 4.8L8 7.8l5.5-3M8 7.8v6.4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinejoin="round"
        />
      </svg>
      Cube’s refresh worker
    </span>
  );
}
