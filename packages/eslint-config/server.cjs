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
          // Business-logic helpers
          {
            type: "mechanics",
            pattern: "src/modules/*([^/]+)/mechanics/**/*",
            capture: ["module"],
          },
          {
            type: "channels",
            pattern: "src/modules/*([^/]+)/channels/**/*",
            capture: ["module"],
          },
          {
            type: "pipeline",
            pattern: "src/modules/*([^/]+)/pipeline/**/*",
            capture: ["module"],
          },
          // Background processing
          {
            type: "workers",
            pattern: "src/modules/*([^/]+)/workers/**/*",
            capture: ["module"],
          },
          {
            type: "cron",
            pattern: "src/modules/*([^/]+)/cron/**/*",
            capture: ["module"],
          },
          // External-API adapters
          {
            type: "gateways",
            pattern: "src/modules/*([^/]+)/gateways/**/*",
            capture: ["module"],
          },
          {
            type: "providers",
            pattern: "src/modules/*([^/]+)/providers/**/*",
            capture: ["module"],
          },
          // Presentation-layer within modules
          {
            type: "guards",
            pattern: "src/modules/*([^/]+)/guards/**/*",
            capture: ["module"],
          },
          {
            type: "decorators",
            pattern: "src/modules/*([^/]+)/decorators/**/*",
            capture: ["module"],
          },
          // Infrastructure adapters
          { type: "infra", pattern: "src/infra/**/*" },
        ],
      },
      rules: {
        "@typescript-eslint/no-explicit-any": "off",
        "@typescript-eslint/no-floating-promises": "warn",
        "@typescript-eslint/no-unused-vars": [
          "error",
          { argsIgnorePattern: "^_" },
        ],
        "@typescript-eslint/no-unsafe-argument": "warn",
        "@typescript-eslint/only-throw-error": "off",
        "prettier/prettier": ["error", { endOfLine: "auto" }],
        "import/order": createImportOrderRule(),
        "boundaries/dependencies": [
          "error",
          {
            default: "disallow",
            rules: [
              {
                from: { type: "core" },
                allow: { to: { type: ["core", "shared", "infra"] } },
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
                    { type: "infra" },
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
                    { type: "infra" },
                    {
                      type: "dto",
                      captured: {
                        module: "{{ from.captured.module }}",
                      },
                    },
                  ],
                },
              },
              // ------------------------------------------------
              // New element types — business-logic helpers
              // ------------------------------------------------
              {
                from: { type: "mechanics" },
                allow: {
                  to: [
                    { type: "core" },
                    { type: "shared" },
                    { type: "database" },
                    { type: "infra" },
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
                    {
                      type: "business",
                      captured: {
                        module: "{{ from.captured.module }}",
                      },
                    },
                  ],
                },
              },
              {
                from: { type: "channels" },
                allow: {
                  to: [
                    { type: "core" },
                    { type: "shared" },
                    { type: "infra" },
                    {
                      type: "dto",
                      captured: {
                        module: "{{ from.captured.module }}",
                      },
                    },
                    {
                      type: "data-access",
                      captured: {
                        module: "{{ from.captured.module }}",
                      },
                    },
                  ],
                },
              },
              {
                from: { type: "pipeline" },
                allow: {
                  to: [
                    { type: "core" },
                    { type: "shared" },
                    { type: "database" },
                    { type: "infra" },
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
                    {
                      type: "business",
                      captured: {
                        module: "{{ from.captured.module }}",
                      },
                    },
                  ],
                },
              },
              // ------------------------------------------------
              // New element types — background processing
              // ------------------------------------------------
              {
                from: { type: "workers" },
                allow: {
                  to: [
                    { type: "core" },
                    { type: "shared" },
                    { type: "database" },
                    { type: "infra" },
                    {
                      type: "business",
                      captured: {
                        module: "{{ from.captured.module }}",
                      },
                    },
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
                  ],
                },
              },
              {
                from: { type: "cron" },
                allow: {
                  to: [
                    { type: "core" },
                    { type: "shared" },
                    { type: "database" },
                    { type: "infra" },
                    {
                      type: "business",
                      captured: {
                        module: "{{ from.captured.module }}",
                      },
                    },
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
                    // Cron jobs may trigger cross-module domain services
                    { type: "business" },
                  ],
                },
              },
              // ------------------------------------------------
              // New element types — external-API adapters
              // ------------------------------------------------
              {
                from: { type: "gateways" },
                allow: {
                  to: [
                    { type: "core" },
                    { type: "shared" },
                    { type: "infra" },
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
                from: { type: "providers" },
                allow: {
                  to: [
                    { type: "core" },
                    { type: "shared" },
                    { type: "infra" },
                    {
                      type: "dto",
                      captured: {
                        module: "{{ from.captured.module }}",
                      },
                    },
                  ],
                },
              },
              // ------------------------------------------------
              // New element types — presentation-layer in modules
              // ------------------------------------------------
              {
                from: { type: "guards" },
                allow: {
                  to: [
                    { type: "core" },
                    { type: "shared" },
                    { type: "infra" },
                    {
                      type: "dto",
                      captured: {
                        module: "{{ from.captured.module }}",
                      },
                    },
                    {
                      type: "business",
                      captured: {
                        module: "{{ from.captured.module }}",
                      },
                    },
                  ],
                },
              },
              {
                from: { type: "decorators" },
                allow: {
                  to: [{ type: "core" }, { type: "shared" }],
                },
              },
              // ------------------------------------------------
              // New element types — infrastructure adapters
              // ------------------------------------------------
              {
                from: { type: "infra" },
                allow: {
                  to: [{ type: "core" }, { type: "shared" }, { type: "infra" }],
                },
              },
              // ------------------------------------------------
              // Module-specific restrictions
              // ------------------------------------------------
              // notification: only consumes events via Redis Streams — no cross-module imports
              {
                from: {
                  type: "business",
                  captured: { module: "notification" },
                },
                allow: {
                  to: [
                    { type: "core" },
                    { type: "shared" },
                    { type: "database" },
                    { type: "infra" },
                    {
                      type: "data-access",
                      captured: { module: "notification" },
                    },
                    {
                      type: "dto",
                      captured: { module: "notification" },
                    },
                  ],
                },
              },
              // rate-limit: cross-cutting guard — only core + shared + infra (Redis)
              {
                from: { type: "business", captured: { module: "rate-limit" } },
                allow: {
                  to: [{ type: "core" }, { type: "shared" }, { type: "infra" }],
                },
              },
            ],
          },
        ],
      },
    },
    {
      files: ["**/*.spec.ts", "**/*.e2e-spec.ts", "**/*.integration.spec.ts"],
      rules: {
        "@typescript-eslint/unbound-method": "off",
        "@typescript-eslint/no-unsafe-assignment": "warn",
        "@typescript-eslint/no-unsafe-member-access": "off",
        "@typescript-eslint/no-unsafe-call": "off",
        "@typescript-eslint/only-throw-error": "off",
        "@typescript-eslint/no-unsafe-return": "warn",
        "@typescript-eslint/no-unsafe-argument": "warn",
        "@typescript-eslint/prefer-promise-reject-errors": "off",
      },
    },
  ];
}

module.exports = {
  serverConfig,
};
