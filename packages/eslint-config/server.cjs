const eslintPluginPrettierRecommended = require("eslint-plugin-prettier/recommended");
const prettier = require("eslint-config-prettier");
const boundaries = require("eslint-plugin-boundaries");
const importPlugin = require("eslint-plugin-import");
const globals = require("globals");
const { createImportOrderRule } = require("./import-order.cjs");

function serverConfig({ tsconfigRootDir }) {
  return [
    prettier,
    eslintPluginPrettierRecommended,
    {
      languageOptions: {
        globals: {
          ...globals.node,
          ...globals.jest,
        },
        sourceType: "module",
        parserOptions: {
          projectService: true,
          tsconfigRootDir,
        },
      },
      plugins: { boundaries, import: importPlugin },
      settings: {
        "import/resolver": {
          typescript: {
            alwaysTryTypes: true,
            project: "./tsconfig.json",
          },
        },
        "boundaries/elements": [
          { type: "core", pattern: "src/core/**/*" },
          { type: "shared", pattern: "src/shared/**/*" },
          { type: "database", pattern: "src/database/**/*" },
          {
            type: "presentation",
            pattern: "src/modules/*([^/]+)/controllers/**/*",
            capture: ["module"],
          },
          {
            type: "business",
            pattern: "src/modules/*([^/]+)/services/**/*",
            capture: ["module"],
          },
          {
            type: "data-access",
            pattern: "src/modules/*([^/]+)/repositories/**/*",
            capture: ["module"],
          },
          {
            type: "dto",
            pattern: "src/modules/*([^/]+)/dto/**/*",
            capture: ["module"],
          },
        ],
      },
      rules: {
        "@typescript-eslint/no-explicit-any": "off",
        "@typescript-eslint/no-floating-promises": "warn",
        "@typescript-eslint/no-unsafe-argument": "warn",
        "prettier/prettier": ["error", { endOfLine: "auto" }],
        "import/order": createImportOrderRule(),
        "boundaries/dependencies": [
          "error",
          {
            default: "disallow",
            rules: [
              {
                from: { type: "core" },
                allow: { to: { type: ["core", "shared"] } },
              },
              {
                from: { type: "database" },
                allow: { to: { type: ["database", "core", "shared"] } },
              },
              { from: { type: "shared" }, allow: { to: { type: ["shared"] } } },
              {
                from: { type: "presentation" },
                allow: {
                  to: [
                    { type: "core" },
                    { type: "shared" },
                    {
                      type: "business",
                      captured: {
                        module: "{{ from.captured.module }}",
                      },
                    },
                    {
                      type: "dto",
                      captured: {
                        module: "{{ from.captured.module }}",
                      },
                    },
                  ],
                },
              },
              {
                from: { type: "business" },
                allow: {
                  to: [
                    { type: "core" },
                    { type: "shared" },
                    { type: "database" },
                    {
                      type: "data-access",
                      captured: {
                        module: "{{ from.captured.module }}",
                      },
                    },
                    {
                      type: "dto",
                      captured: {
                        module: "{{ from.captured.module }}",
                      },
                    },
                    { type: "business" },
                  ],
                },
              },
              {
                from: { type: "data-access" },
                allow: {
                  to: [
                    { type: "core" },
                    { type: "shared" },
                    { type: "database" },
                    {
                      type: "dto",
                      captured: {
                        module: "{{ from.captured.module }}",
                      },
                    },
                  ],
                },
              },
            ],
          },
        ],
      },
    },
  ];
}

module.exports = {
  serverConfig,
};
