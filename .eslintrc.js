module.exports = {
  extends: [
    '@metamask/eslint-config',
    '@metamask/eslint-config/config/nodejs',
  ],
  rules: {
    // '@typescript-eslint/consistent-type-definitions': ['error', 'interface'],
  },
  plugins: [
    'json',
  ],
  ignorePatterns: [
    '!.eslintrc.js',
    'node_modules/',
    'dist/',
  ],
  overrides: [
    {
      files: [
        '**/*.ts',
      ],
      extends: [
        '@metamask/eslint-config/config/typescript',
      ],
    },
    {
      files: [
        '*.js',
        '*.json',
      ],
      parserOptions: {
        sourceType: 'script',
      },
      rules: {
        '@typescript-eslint/no-require-imports': 'off',
        '@typescript-eslint/no-var-requires': 'off',
      },
    },
  ],
};
