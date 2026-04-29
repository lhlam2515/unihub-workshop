// https://docs.expo.dev/guides/using-eslint/
const { defineConfig, globalIgnores } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");
const eslintConfig = require("@repo/eslint-config");

module.exports = defineConfig([
  expoConfig,
  ...eslintConfig.mobileConfig(),
  globalIgnores([".expo/**", "dist/**", "node_modules/**"]),
]);
