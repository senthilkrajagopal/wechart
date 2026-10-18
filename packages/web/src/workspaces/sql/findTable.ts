/**
 * "Find a table" (T806, AC-448; design 17, pin 4 and C3): the tables already
 * read whose names hold the text, ignoring case, in the order read. It
 * reads nothing: a table on a page not yet read can't be found.
 */
export function findTables<T extends { readonly name: string }>(read: readonly T[], text: string): readonly T[] {
  const wanted = text.trim().toLocaleLowerCase();
  if (wanted === '') return read;
  return read.filter((table) => table.name.toLocaleLowerCase().includes(wanted));
}
