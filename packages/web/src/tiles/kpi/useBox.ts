import { useLayoutEffect, useState } from 'react';

/**
 * An element's size as laid out, kept as it changes: a KPI's content box,
 * for its trend's and target's width and the room under its value (AC-565,
 * T938-2); 0 × 0 until it is laid out.
 */
export function useBox(): [
  (element: HTMLElement | null) => void,
  { readonly width: number; readonly height: number },
] {
  const [element, setElement] = useState<HTMLElement | null>(null);
  const [box, setBox] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    if (element === null || typeof ResizeObserver === 'undefined') return undefined;
    // Called once on observing, then on every resize: its content box, inside
    // any padding, as a tiled KPI's tile has (T940).
    const observer = new ResizeObserver(([entry]) => {
      if (entry === undefined) return;
      setBox({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, [element]);
  return [setElement, box];
}
