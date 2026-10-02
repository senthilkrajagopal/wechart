/**
 * What a move's answer says it copied (T537, AC-371): each dashboard the move
 * would have left showing a library chart kept off its folder's path, which
 * now shows its own copy instead. Those in folders the user may see are
 * named, with the charts copied; the rest are only counted, as the server
 * counts them.
 */
export interface MovedCopies {
  readonly copiedOn?: readonly {
    readonly id: string;
    readonly title: string;
    readonly charts: readonly {
      readonly from: string;
      readonly id: string;
      readonly title: string;
    }[];
  }[];
  readonly copiedHidden?: number;
}

/** "“A”", "“A” and “B”", "“A”, “B” and “C”". */
const listOf = (titles: readonly string[]) => {
  const quoted = titles.map((title) => `“${title}”`);
  return quoted.length < 2
    ? quoted.join('')
    : `${quoted.slice(0, -1).join(', ')} and ${quoted.at(-1)!}`;
};

/** The sentence said once a move is made; none where nothing was copied. */
export function movedCopiesText({
  copiedOn = [],
  copiedHidden = 0,
}: MovedCopies): string | undefined {
  const said = copiedOn.map(({ title, charts }) =>
    charts.length === 1
      ? `“${title}” now shows its own copy of ${listOf(charts.map((each) => each.title))}: after this move, that chart isn’t kept in the dashboard’s folder or one above it.`
      : `“${title}” now shows its own copies of ${listOf(charts.map((each) => each.title))}: after this move, those charts aren’t kept in the dashboard’s folder or one above it.`,
  );
  if (copiedHidden === 1)
    said.push(
      '1 dashboard in a folder you can’t see now shows its own copy of a chart this move took off its folder’s path.',
    );
  else if (copiedHidden > 1)
    said.push(
      `${String(copiedHidden)} dashboards in folders you can’t see now show their own copies of charts this move took off their folders’ paths.`,
    );
  return said.length === 0 ? undefined : said.join(' ');
}
