import js from '@eslint/js';
import globals from 'globals';
import prettier from 'eslint-config-prettier';

export default [
  js.configs.recommended,
  prettier,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.browser
      }
    },
    rules: {
      'no-unused-vars': [
        'error',
        {
          varsIgnorePattern: '^_',
          argsIgnorePattern: '^_'
        }
      ],
      'no-console': 'off',
      'no-empty': 'warn',
      'no-undef': 'warn',
      'no-redeclare': 'warn',
      'no-cond-assign': 'warn',
      'no-constant-binary-expression': 'warn',
      'no-case-declarations': 'warn',
      'no-dupe-else-if': 'warn',
      'no-unsafe-finally': 'warn',
      'no-async-promise-executor': 'warn'
    }
  },
  {
    files: ['**/*.mjs', '**/duckdb-bundle.mjs', '**/bundle.mjs'],
    rules: {
      'no-unused-vars': 'off',
      'no-undef': 'off',
      'no-redeclare': 'off',
      'no-cond-assign': 'off',
      'no-constant-binary-expression': 'off',
      'no-unsafe-finally': 'off'
    }
  },
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'data_out/**',
      'cache/**',
      'apps/web/deps/**',
      '**/*.min.js',
      'coverage/**',
      '**/duckdb-bundle.mjs'
    ]
  }
];
