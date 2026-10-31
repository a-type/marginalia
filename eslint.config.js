//  @ts-check

import { tanstackConfig } from '@tanstack/eslint-config';

export default [
  ...tanstackConfig,
  {
    rules: {
      'import/no-cycle': 'off',
      'import/order': 'off',
      'import/consistent-type-specifier-style': 'off',
      'sort-imports': 'off',
      '@typescript-eslint/array-type': 'off',
      '@typescript-eslint/require-await': 'off',
      'pnpm/json-enforce-catalog': 'off',
    },
  },
  {
    files: ['.railway/**/*.ts', 'packages/bible/vitest.config.ts'],
    languageOptions: {
      parserOptions: {
        project: './tsconfig.eslint.json',
      },
    },
  },
  {
    ignores: [
      'eslint.config.js',
      'prettier.config.js',
      'app/src/**/usfm-source/**',
      'app/src/lexicons/**',
      'app/src/paraglide/**',
      'app/src/routeTree.gen.ts',
      'packages/atproto/src/lexicons/**',
      '**/.output/**',
      '**/.tanstack/**',
      '**/dist/**',
      '**/dist-indexer/**',
    ],
  },
];
