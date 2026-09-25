import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

/** A tile as the dashboard draws it: its outer box, and its chart's height. */
export interface TileSize {
  readonly width: number;
  readonly height: number;
  /**
   * The height the dashboard gives the tile's chart (`h × 8px`), or undefined
   * for a tile with no height of its own. Passed rather than derived from the
   * box, because the dashboard does not derive it either.
   */
  readonly chartHeight: number | undefined;
}

export interface PreviewFrameProps {
  /** The tile the editor was opened from, if it was opened from one. */
  readonly tile?: TileSize | undefined;
  /** Draws the chart, at the height given — undefined for its natural height. */
  readonly children: (chartHeight: number | undefined) => ReactNode;
}

/**
 * The editor's preview, at the tile's own size or filling the editor (T032,
 * AC-034; direction.md §2: "an Actual size / Fit preview at the tile's own
 * size").
 *
 * **Actual size first.** Opening from a tile is for seeing the chart as it will
 * sit there, so that is what is shown until the user asks for more room — a
 * larger preview is exactly where a crowded axis or a clipped legend looks
 * fine.
 *
 * **The tile's own chrome, not an imitation of it.** The frame carries the
 * dashboard's `grid-tile` class and is given the tile's measured outer box, and
 * the chart inside gets the height the dashboard gives it. Anything else would
 * be a different chart at a similar size.
 *
 * Opened with no tile — from Explore — there is no actual size to offer: the
 * preview is a tile filling the editor (T257).
 *
 * **Fit is the tile scaled to fill the editor's width**, keeping its
 * proportions. Its width comes from the layout; its height is *derived* from
 * that width, and the chart's height is scaled by the same factor. The first
 * version measured the frame's own height and handed it to the chart — but
 * the frame's height followed its content, which includes the tile's in-flow
 * "Table view" control, so each measurement could grow it and the loop never
 * had to settle. Nothing here now depends on what is inside the frame.
 */
export function PreviewFrame({ tile, children }: PreviewFrameProps) {
  const [size, setSize] = useState<'actual' | 'fit'>('actual');
  const frame = useRef<HTMLDivElement>(null);
  const [fitWidth, setFitWidth] = useState<number | undefined>(undefined);

  /**
   * The frame's width in Fit, re-measured as the window changes. Setting the
   * height from it changes the frame's size, which re-runs this — and finds
   * the same width, so React has nothing to do and it settles at once.
   *
   * A layout effect, measured before the browser paints. As a plain effect the
   * first Fit frame was painted with no height set — sized by its content,
   * 380 pixels where 373 was right — and then snapped: a visible flash, and a
   * frame in which anything reading the size read it wrong.
   */
  useLayoutEffect(() => {
    const element = frame.current;
    if (size !== 'fit' || element === null || typeof ResizeObserver === 'undefined') return;

    const measure = () => {
      setFitWidth(element.getBoundingClientRect().width);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, [size]);

  // Opened on its own, the chart is still drawn in a tile, as the prototype's
  // editor draws it (editor.js 414; recheck-chart-editor N3, T257): the
  // tile's chrome around it, its size the editor's.
  if (tile === undefined)
    return (
      <div className="grid-tile preview-frame__tile" data-testid="preview-frame" data-size="fill">
        {children(undefined)}
      </div>
    );

  const actual = size === 'actual';
  // How much larger than the tile the fitted frame is: the same factor for
  // the frame's height and the chart's, so the whole tile scales together.
  const scale = fitWidth === undefined || tile.width === 0 ? undefined : fitWidth / tile.width;

  return (
    <div className="preview-frame">
      <div className="preview-frame__sizes" role="group" aria-label="Preview size">
        <button
          type="button"
          aria-pressed={actual}
          onClick={() => {
            setSize('actual');
          }}
        >
          Actual size
        </button>
        <button
          type="button"
          aria-pressed={!actual}
          onClick={() => {
            setSize('fit');
          }}
        >
          Fit
        </button>
      </div>
      <div
        ref={frame}
        className="grid-tile preview-frame__tile"
        data-testid="preview-frame"
        data-size={size}
        style={
          actual
            ? { width: `${String(tile.width)}px`, height: `${String(tile.height)}px` }
            : {
                width: '100%',
                ...(scale === undefined
                  ? {}
                  : { height: `${String(Math.round(tile.height * scale))}px` }),
              }
        }
      >
        {children(
          actual
            ? tile.chartHeight
            : scale === undefined || tile.chartHeight === undefined
              ? undefined
              : Math.round(tile.chartHeight * scale),
        )}
      </div>
    </div>
  );
}
