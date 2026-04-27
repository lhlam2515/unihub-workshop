import { defineConfig } from 'eslint/config';
import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import boundaries from 'eslint-plugin-boundaries';
import importPlugin from 'eslint-plugin-import';

const eslintConfig = defineConfig([
  ...tseslint.config(
    {
      ignores: ['eslint.config.mjs'],
    },
    eslint.configs.recommended,
    ...tseslint.configs.recommendedTypeChecked,
    eslintPluginPrettierRecommended,
    {
      languageOptions: {
        globals: {
          ...globals.node,
          ...globals.jest,
        },
        sourceType: 'module',
        parserOptions: {
          projectService: true,
          tsconfigRootDir: import.meta.dirname,
        },
      },
      plugins: { boundaries, import: importPlugin },
      settings: {
        'import/resolver': {
          typescript: {
            alwaysTryTypes: true,
            project: './tsconfig.json',
          },
        },
        'boundaries/elements': [
          { type: 'core', pattern: 'src/core/**/*' },
          { type: 'shared', pattern: 'src/shared/**/*' },
          { type: 'database', pattern: 'src/database/**/*' },
          {
            type: 'presentation',
            pattern: 'src/modules/*([^/]+)/controllers/**/*',
            capture: ['module'],
          },
          {
            type: 'business',
            pattern: 'src/modules/*([^/]+)/services/**/*',
            capture: ['module'],
          },
          {
            type: 'data-access',
            pattern: 'src/modules/*([^/]+)/repositories/**/*',
            capture: ['module'],
          },
          {
            type: 'dto',
            pattern: 'src/modules/*([^/]+)/dto/**/*',
            capture: ['module'],
          },
        ],
      },
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-floating-promises': 'warn',
        '@typescript-eslint/no-unsafe-argument': 'warn',
        'prettier/prettier': ['error', { endOfLine: 'auto' }],

        'import/order': [
          'error',
          {
            groups: [
              'builtin',
              'external',
              'internal',
              ['parent', 'sibling', 'index'],
              'object',
              'type',
            ],
            'newlines-between': 'always',
            pathGroups: [
              {
                pattern: '@/**',
                group: 'internal',
                position: 'before',
              },
            ],
            pathGroupsExcludedImportTypes: ['builtin'],
            alphabetize: {
              order: 'asc',
              caseInsensitive: true,
            },
          },
        ],

        'boundaries/element-types': [
          'error',
          {
            default: 'disallow',
            rules: [
              { from: 'core', allow: ['core', 'shared'] },
              { from: 'shared', allow: ['shared'] },
              { from: 'database', allow: ['shared', 'core'] },

              {
                from: 'presentation',
                allow: [
                  'core',
                  'shared',
                  ['business', { module: '${from.module}' }],
                  ['dto', { module: '${from.module}' }],
                ],
              },
              {
                from: 'business',
                allow: [
                  'core',
                  'shared',
                  'database',
                  ['data-access', { module: '${from.module}' }],
                  ['dto', { module: '${from.module}' }],
                  'business',
                ],
              },
              {
                from: 'data-access',
                allow: [
                  'core',
                  'shared',
                  'database',
                  ['dto', { module: '${from.module}' }],
                ],
              },
            ],
          },
        ],
      },
    }
  ),
]);

export default eslintConfig;
