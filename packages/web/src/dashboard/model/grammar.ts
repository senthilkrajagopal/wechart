import { isTabGroup, type DashboardDocument, type Element_ } from './document';
import type { InsertionPoint } from './insert';

/**
 * The one structural rule the dashboard grammar enforces on an insert
 * (AC-059, direction.md rule 37): **a tab group can exist only inside a
 * section**.
 *
 * The rule is not arbitrary. A tab group is a way of folding several views
 * into one titled block; a dashboard whose top level is a row of bare tab
 * strips has no structure left to read. So rather than refusing the insert —
 * which would leave the user holding a thing they cannot put anywhere — the
 * group arrives inside a section made for it, and the interface says so.
 *
 * Saying so is half the criterion. A section nobody asked for, appearing
 * silently, is its own kind of surprise.
 */
export interface Placement {
  /** What to insert: the element, or a section wrapped around it. */
  readonly element: Element_;
  /** Where, unchanged — wrapping alters what goes in, never where. */
  readonly at: InsertionPoint;
  /** What to tell the user, when something was done they did not ask for. */
  readonly message?: string;
}

/** A section is the only legal home for a tab group. */
const isSectionKey = (key: string) => key.startsWith('sec:');

export function placeInGrammar(
  _document: DashboardDocument,
  element: Element_,
  at: InsertionPoint,
  mintId: () => string,
): Placement {
  if (!isTabGroup(element) || isSectionKey(at.key)) return { element, at };

  return {
    element: {
      id: mintId(),
      kind: 'section',
      title: 'New section',
      collapsed: false,
      items: [element],
    },
    at,
    message: 'Tab groups live inside a section, so a new section was added to hold this one.',
  };
}
