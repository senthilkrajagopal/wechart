import { describe, expect, it } from 'vitest';

import {
  DEFAULT_INTERACTIONS,
  INTERACTION_MODES,
  activityOf,
  interactionsOf,
  labelOf,
  setMode,
  type Interactions,
} from './interactionMode';

/**
 * T076 / AC-070: WHEN the user changes the interaction mode, THE SYSTEM SHALL
 * keep both configurations, activate the chosen one and label the other as
 * inactive (direction.md rule 56).
 * `Fails when: switching discards the other mode's configuration, or both
 * modes are active at once.`
 *
 * The criterion exists because the obvious implementation loses work. A mode
 * switch that reset the other side would look perfectly correct — the chosen
 * mode works, the screen is consistent — and the cost only shows up when
 * someone switches back and finds the markings they spent an afternoon on
 * replaced by a default. So the fixture below populates *both* sides with
 * something distinctive: against empty configurations "kept" and "discarded"
 * are the same object, and every test here would pass either way.
 */
const BOTH: Interactions = {
  mode: 'markings',
  crossFilter: { defaultAction: 'highlight' },
};

describe('the interaction mode', () => {
  it('keeps the cross-filter configuration when leaving cross-filter mode', () => {
    const switched = setMode(BOTH, 'markings');

    expect(switched.crossFilter).toEqual({ defaultAction: 'highlight' });
  });

  it('keeps it through a round trip, where a reset on entry would hide', () => {
    // A reset on the way *out* is the obvious bug; a reset on the way back
    // *in* looks like a fresh start and is just as lossy.
    const there = setMode(BOTH, 'crossFilter');
    const back = setMode(there, 'markings');

    expect(back.crossFilter).toEqual({ defaultAction: 'highlight' });
  });

  it('cannot reach the markings, which is how they survive a switch', () => {
    /**
     * Marking definitions live at the top of the document, not inside the
     * mode's configuration (AC-065 names them a peer of the settings, rule 54
     * says a saved dashboard stores them). So AC-070's promise about them is
     * structural rather than careful: `setMode` has nothing to discard.
     *
     * Asserted so that moving them back under here — which is where they
     * started, and which gave markings two homes — fails rather than silently
     * making that promise a matter of implementation again.
     */
    expect(Object.keys(setMode(BOTH, 'crossFilter'))).toEqual(['mode', 'crossFilter']);
  });

  it('activates the chosen mode', () => {
    expect(setMode(BOTH, 'crossFilter').mode).toBe('crossFilter');
    expect(setMode(BOTH, 'markings').mode).toBe('markings');
  });

  it('never has two modes active at once', () => {
    // The criterion's other failing state, asserted over every mode rather
    // than the one that was chosen.
    for (const mode of INTERACTION_MODES) {
      const switched = setMode(BOTH, mode);
      const active = INTERACTION_MODES.filter((each) => activityOf(switched, each) === 'active');

      expect(active).toEqual([mode]);
    }
  });

  it('labels the mode that is not active as inactive', () => {
    const switched = setMode(BOTH, 'crossFilter');

    expect(labelOf(switched, 'crossFilter')).toBe('Active');
    expect(labelOf(switched, 'markings')).toBe('Inactive');
  });

  it('changes nothing when the mode chosen is the one already set', () => {
    // Returned by identity, so a no-op switch is not a change the edit session
    // has to record — AC-074 counts a settings save as one change, and a
    // change that changed nothing would still be counted.
    expect(setMode(BOTH, 'markings')).toBe(BOTH);
  });

  it('starts cross-filtering at Filter, which direction.md rule 32 decided', () => {
    /**
     * The literal value, not `toBeDefined()`. That is what this asserted
     * first, and on a required field of a typed constant it is unfalsifiable —
     * proved by setting the object to nonsense and watching the suite stay
     * green. The value matters because it is persisted: rule 32 says the
     * default "starts at Filter", so a dashboard saved now carrying anything
     * else hands F12 a document that contradicts AC-118.
     */
    expect(DEFAULT_INTERACTIONS.crossFilter.defaultAction).toBe('filter');
  });

  it('reads a dashboard saved before interactions existed as Markings', () => {
    /**
     * Every dashboard stored so far has `settings` with no `interactions` key,
     * and they are all at `schemaVersion: 1`, so this is the ordinary case
     * rather than a migration.
     *
     * The literal again, not `DEFAULT_INTERACTIONS.mode` — comparing the
     * default against itself is true whatever the default is, and a mutant
     * that started dashboards in cross-filter mode left this green.
     */
    const read = interactionsOf({ width: 'fixed' });

    expect(read.mode).toBe('markings');
    expect(read.crossFilter.defaultAction).toBe('filter');
  });

  it('leaves a stored configuration alone when there is one', () => {
    const read = interactionsOf({ width: 'fixed', interactions: BOTH });

    expect(read).toEqual(BOTH);
    // By identity: a read that rebuilt the object would make every render a
    // new value, and the settings draft compares against what it was given.
    expect(read).toBe(BOTH);
  });

  it('reads a stored mode with no cross-filter configuration as the default one, as saved or imported dashboards carry it (AC-117)', () => {
    // The checkpoint's crash: `{ mode: 'crossFilter' }` alone, and the first
    // cross-filter click read `pairs` of undefined.
    const stored = { mode: 'crossFilter' } as unknown as Interactions;

    const read = interactionsOf({ width: 'fixed', interactions: stored });

    expect(read).toEqual({ mode: 'crossFilter', crossFilter: DEFAULT_INTERACTIONS.crossFilter });
  });

  it('offers exactly the two modes direction.md names, and no third', () => {
    // Rule 13: "Every dashboard uses exactly one interaction mode … Markings
    // or Cross-filtering." A third would have no section in the settings nav
    // and nothing to label it with.
    expect(INTERACTION_MODES).toEqual(['markings', 'crossFilter']);
    expect(labelOf(BOTH, 'markings')).toBe('Active');
    expect(labelOf(BOTH, 'crossFilter')).toBe('Inactive');
  });
});
