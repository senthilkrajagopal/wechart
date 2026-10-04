import type { Locator, Page } from '@playwright/test';

/**
 * The chart editor's "Cube or view" picker, used as a person uses it (T475;
 * 2026-09-27 design 10, state D): its button, then the cube in the list it
 * opens, under its folder's group.
 *
 * Shaped like the native select it replaced, as `wellPicker` is: its
 * `selectOption` takes the cube by its title (`{ label }`) or its name
 * (`{ value }`, or a bare string), so every test that chose a cube through
 * that select reads the same with the picker. `button` is the control, for
 * what a test asserts of it: `data-value` holds the cube chosen. `scope` is
 * the page, or the editor overlay.
 */
export function cubePicker(scope: Page | Locator) {
  const button = scope.getByRole('button', { name: /^Cube or view\b/ });
  const list = scope.getByRole('listbox', { name: 'Cubes and views' });
  const open = async () => {
    if ((await button.getAttribute('aria-expanded')) !== 'true') await button.click();
    return list;
  };
  /** A cube that can be picked: by its title as listed, or by its name. */
  const optionOf = (cube: string | { label: string } | { value: string }) =>
    typeof cube !== 'string' && 'label' in cube
      ? list
          .locator('.cube-picker__option:not(.is-hidden)')
          .filter({ has: list.page().getByText(cube.label, { exact: true }) })
      : list.locator(
          `.cube-picker__option:not(.is-hidden)[data-cube="${typeof cube === 'string' ? cube : cube.value}"]`,
        );
  return {
    button,
    list,
    open,
    optionOf,
    async selectOption(
      cube: string | { label: string } | { value: string },
      options?: { timeout?: number },
    ): Promise<void> {
      await open();
      await optionOf(cube).first().click(options);
    },
    /** The titles listed, in order. */
    async titles(): Promise<string[]> {
      await open();
      return list.locator('.cube-picker__option .cube-picker__title').allTextContents();
    },
  };
}
