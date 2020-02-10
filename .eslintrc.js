module.exports = {

  parser: '@typescript-eslint/parser',

  plugins: ['@typescript-eslint'],

  extends: [
    '@metamask/eslint-config',
    '@metamask/eslint-config/config/typescript',
    '@metamask/eslint-config/config/nodejs',
  ],
}
