const prettier = require("eslint-config-prettier");
const eslintPluginPrettierRecommended = require("eslint-plugin-prettier/recommended");
const { createFsdBoundariesConfig } = require("./boundaries.cjs");
const { createImportOrderRule } = require("./import-order.cjs");

function mobileConfig({ includeAssets = false } = {}) {
  return [
    prettier,
    eslintPluginPrettierRecommended,
    {
      rules: {
        "import/order": createImportOrderRule(),
      },
      ignores: ["components/ui/**"],
    },
    createFsdBoundariesConfig({
      include: includeAssets ? ["src/**/*", "assets/**/*"] : ["src/**/*"],
      sharedPatterns: includeAssets ? ["assets/**/*"] : [],
    }),
  ];
}

module.exports = {
  mobileConfig,
};
