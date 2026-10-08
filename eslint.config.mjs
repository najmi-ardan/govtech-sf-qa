import eslint from '@eslint/js';
import playwright from 'eslint-plugin-playwright';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['node_modules/**', 'reports/**', 'test-results/**', 'playwright-report/**', 'storage/**', 'logs/**'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['pages/**/*.ts', 'auth/**/*.ts', 'api/**/*.ts', 'data/**/*.ts', 'config/**/*.ts', 'utils/**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.property.name='waitForTimeout']",
          message: 'No fixed sleeps: wait on a locator, URL or expect.poll instead.',
        },
        {
          selector: "CallExpression[callee.property.name=/^(locator|\\$|\\$\\$)$/] > Literal[value=/^(xpath=|\\/\\/)/]",
          message: 'No XPath in page objects. Use a role or label locator.',
        },
      ],
    },
  },
  {
    files: ['tests/**/*.ts'],
    ...playwright.configs['flat/recommended'],
    rules: {
      ...playwright.configs['flat/recommended'].rules,
      'playwright/no-wait-for-timeout': 'error',
      'playwright/no-focused-test': 'error',
      'playwright/no-conditional-in-test': 'off',
      'playwright/no-conditional-expect': 'off',
      'playwright/no-skipped-test': 'off',
    },
  },
);
