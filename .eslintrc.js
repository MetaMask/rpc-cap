module.exports = {
  extends: ['@metamask/eslint-config', '@metamask/eslint-config-nodejs'],

  overrides: [
    {
      files: ['**/*.ts'],
      extends: ['@metamask/eslint-config-typescript'],
    },

    {
      files: ['*.js', '*.json'],
      parserOptions: {
        sourceType: 'script',
      },
      rules: {
        '@typescript-eslint/no-require-imports': 'off',
        '@typescript-eslint/no-var-requires': 'off',
      },
    },

    {
      files: ['**/*.d.ts'],
      rules: {
        'import/unambiguous': 'off',
      },
    },

    // TODO: remove after migrating to jest
    {
      files: ['**/test/*.js'],
      rules: {
        'no-shadow': ['error', { allow: ['t'] }],
      },
    },
  ],

  ignorePatterns: ['!.eslintrc.js', 'dist/'],
};
