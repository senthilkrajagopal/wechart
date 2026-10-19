import { useState } from 'react';

/**
 * One series' colour (AC-219): picked, and set down as one change when the
 * picker closes — not one per shade dragged through — or put back to the
 * colour the dashboard gives its member (AC-039). Customize › Series' rows
 * use it, a combo's (T855) as every other chart's.
 */
export function ColourSetting({
  title,
  chosen,
  drawn,
  onChoose,
}: {
  title: string;
  chosen: string | undefined;
  drawn: string;
  onChoose: (colour: string | undefined) => void;
}) {
  const [picking, setPicking] = useState<string | null>(null);
  const setDown = () => {
    if (picking === null) return;
    setPicking(null);
    if (picking !== (chosen ?? drawn)) onChoose(picking);
  };
  return (
    <>
      <input
        type="color"
        aria-label={`Colour of ${title}`}
        value={picking ?? chosen ?? drawn}
        onChange={(event) => setPicking(event.target.value)}
        onBlur={setDown}
      />
      {chosen === undefined ? null : (
        <button
          type="button"
          className="btn-ghost btn-sm"
          aria-label={`Automatic colour for ${title}`}
          onClick={() => onChoose(undefined)}
        >
          Auto
        </button>
      )}
    </>
  );
}
