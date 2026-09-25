import type { Locator, Page } from '@playwright/test';

/**
 * A chart editor well's "+" picker, used as a person uses it (T257): the
 * prototype's inline "+ metric" button, then the field in the menu it opens.
 *
 * Shaped like the native select it replaced, `selectOption(member)` taking a
 * member's name, so every test that filled a well through that select reads
 * the same with the picker. `scope` is the page, or the editor overlay.
 */
export function wellPicker(
  scope: Page | Locator,
  well: 'measures' | 'dimensions' | 'timeDimensions' | 'filters',
) {
  return {
    async selectOption(member: string): Promise<void> {
      await scope.getByTestId(`add-${well}`).click();
      await scope.getByTestId(`pick-${member}`).click();
    },
  };
}
