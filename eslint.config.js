// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  { ignores: ['dist/*', 'modules/*/android/**', 'modules/*/ios/**'] },
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      // El proyecto eliminó todos los `as any`; que no vuelvan sin una razón escrita.
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
]);
