const prettier = require("eslint-config-prettier");
const { createFsdBoundariesConfig } = require("./boundaries.cjs");
const { createImportOrderRule } = require("./import-order.cjs");

function webConfig() {
  return [
    prettier,
    {
      rules: {
        "import/order": createImportOrderRule(),
      },
      ignores: ["components/ui/**"],
    },
    createFsdBoundariesConfig({
      sharedPatterns: ["src/styles/**/*", "src/tasks/**/*"],
      neverImportPatterns: ["src/*", "src/tasks/**/*"],
    }),
  ];
}

module.exports = {
  webConfig,
};
