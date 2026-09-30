/**
 * What Explore says once it opens after an item's own page deleted it
 * (design 14, states A5, C and E3): "Deleted “Top products”.", on the
 * folder the item was in. Held here, in the page's memory, across the app's
 * own navigation to Explore, and said once.
 */
let pending: string | null = null;

export function sayOnExplore(text: string): void {
  pending = text;
}

/** What is to be said, if anything: read as Explore opens. */
export function peekSaid(): string | null {
  return pending;
}

/** Said: not to be said again. */
export function clearSaid(): void {
  pending = null;
}
