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
      '**/dist-demo/**',
      '**/node_modules/**',
      '.claude/**',
      'docs/**',
      'test-results/**',
      'playwright-report/**',
      // The Helm chart's link to infra/cube/cube.js, linted where it lives.
      'deploy/helm/*/files/**',
    ],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    // node-pg-migrate loads migrations as CommonJS modules in Node.
    files: ['**/db/migrations/*.cjs'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: { exports: 'writable', module: 'writable', require: 'readonly' },
    },
  },
  {
    // Cube loads its configuration as a CommonJS module in its own Node process.
    files: ['infra/cube/cube.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        module: 'writable',
        require: 'readonly',
        __dirname: 'readonly',
        process: 'readonly',
        fetch: 'readonly',
      },
    },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  {
    files: [
      'packages/web/**/*.{ts,tsx}',
      'packages/ui/**/*.{ts,tsx}',
      'packages/charts/**/*.{ts,tsx}',
    ],
    extends: [reactHooks.configs.flat.recommended, jsxA11y.flatConfigs.recommended],
  },
);
