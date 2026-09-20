import js from '@eslint/js';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    // The harness and docs/ live outside the product and are not linted.
    // docs/design/prototype/ is throwaway browser scratch code behind the
    // design direction, not source we ship (CLAUDE.md).
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '.claude/**',
      'docs/**',
      'test-results/**',
      'playwright-report/**',
    ],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: [
      'packages/web/**/*.{ts,tsx}',
      'packages/ui/**/*.{ts,tsx}',
      'packages/charts/**/*.{ts,tsx}',
    ],
    extends: [reactHooks.configs.flat.recommended, jsxA11y.flatConfigs.recommended],
  },
);
