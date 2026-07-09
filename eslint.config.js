import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import unicorn from 'eslint-plugin-unicorn';

export default [
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: { parser: tsparser },
    plugins: { '@typescript-eslint': tseslint, unicorn },
    rules: {
      ...tseslint.configs.recommended.rules,
      'unicorn/prefer-node-protocol': 'error',
      'unicorn/no-array-for-each': 'error',
      'unicorn/no-useless-undefined': 'error',
      eqeqeq: 'error',
    },
    ignores: [
      'eslint.config.js',
      'jest.config.js',
      'commitlint.config.mjs',
      'lint-staged.config.mjs',
      'dist/**',
      'node_modules/**',
      'coverage/**',
    ],
  },
];
