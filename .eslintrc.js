module.exports = {
  extends: [
    '@metamask/eslint-config',
    '@metamask/eslint-config/config/nodejs',
  ],
  parserOptions: {
    ecmaVersion: 2018,
  },
  plugins: [
    'json',
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
  ignorePatterns: [
    '!.eslintrc.js',
    'node_modules/',
    'dist/',
  ],
};
