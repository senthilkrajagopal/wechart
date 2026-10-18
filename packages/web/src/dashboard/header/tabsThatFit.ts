/**
 * Which page tabs show inline in the compact row and which go behind
 * "More ▾", in view mode (AC-492; 19-Q5 (a); design 19 pin 3 and state D1).
 *
 * - Every tab fits: all inline, and no "More ▾".
 * - Otherwise "More ▾" takes its room first, and as many tabs as fit beside
 *   it stay inline, in order. The rest go in the menu, in order.
 * - The open page is always inline. Where it would fall in the menu, it takes
 *   the last inline place, with as many tabs before it as fit.
 *
 * Indices into `widths`. `more` is the width "More ▾" takes, its lead
 * included; `gap` the room between two tabs.
 */
export function tabsThatFit(
  widths: readonly number[],
  room: number,
  open: number,
  more: number,
  gap: number,
): { readonly inline: number[]; readonly menu: number[] } {
  const all = widths.map((_, index) => index);
  const span = (indices: readonly number[]) =>
    indices.reduce((sum, index) => sum + (widths[index] ?? 0), 0) +
    Math.max(0, indices.length - 1) * gap;
  if (span(all) <= room) return { inline: all, menu: [] };

  const left = room - more;
  // The leading tabs that fit, the open page counted in when it's not among
  // them.
  const opened = open >= 0 && open < widths.length ? open : 0;
  let inline: number[] = [];
  for (const index of all) {
    const next = [...inline, index];
    if (span(next) > left) break;
    inline = next;
  }
  if (!inline.includes(opened)) {
    const before: number[] = [];
    for (const index of all) {
      if (index === opened) break;
      if (span([...before, index, opened]) > left) break;
      before.push(index);
    }
    inline = [...before, opened];
  }
  return { inline, menu: all.filter((index) => !inline.includes(index)) };
}
