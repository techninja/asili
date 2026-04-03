import prettier from 'eslint-config-prettier';
import jsdoc from 'eslint-plugin-jsdoc';
import unusedImports from 'eslint-plugin-unused-imports';

export default [
  {
    files: ['**/*.js'],
    plugins: { jsdoc, 'unused-imports': unusedImports },
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: {
        console: 'readonly',
        document: 'readonly',
        window: 'readonly',
        HTMLElement: 'readonly',
        CustomEvent: 'readonly',
        EventSource: 'readonly',
        localStorage: 'readonly',
        fetch: 'readonly',
        setTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        requestAnimationFrame: 'readonly',
        process: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        Event: 'readonly',
        globalThis: 'readonly',
      },
    },
    rules: {
      semi: ['error', 'always'],
      indent: ['error', 2, { SwitchCase: 1 }],
      'no-var': 'error',
      'prefer-const': 'error',
      eqeqeq: ['error', 'always'],
      'no-unused-vars': 'off',
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-console': 'off',

      // JSDoc enforcement
      'jsdoc/require-jsdoc': [
        'warn',
        {
          require: { FunctionDeclaration: true },
          checkConstructors: false,
        },
      ],
      'jsdoc/require-param-type': 'warn',
      'jsdoc/require-returns-type': 'warn',
      'jsdoc/valid-types': 'warn',
    },
  },
  {
    files: ['**/*.test.js'],
    rules: {
      'jsdoc/require-jsdoc': 'off',
      'no-unused-vars': 'off',
      'unused-imports/no-unused-vars': 'off',
    },
  },
  {
    ignores: ['node_modules/', 'src/vendor/'],
  },
  prettier,
];
