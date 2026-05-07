const eslintPluginPrettierRecommended = require("eslint-plugin-prettier/recommended");
const prettier = require("eslint-config-prettier");
const boundaries = require("eslint-plugin-boundaries");
const importPlugin = require("eslint-plugin-import");
const globals = require("globals");
const { createImportOrderRule } = require("./import-order.cjs");

const SAME_MODULE = "{{ from.captured.module }}";

function target(type) {
  return { type };
}

function sameModuleTarget(type) {
  return { type, captured: { module: SAME_MODULE } };
}

function targets(...types) {
  return types.map(target);
}

function sameModuleTargets(...types) {
  return types.map(sameModuleTarget);
}

function createBoundariesRule({ fromType, moduleName, allow }) {
  return {
    from: moduleName
      ? { type: fromType, captured: { module: moduleName } }
      : { type: fromType },
    allow: { to: allow },
  };
}

function createBoundariesRules(fromTypes, allow) {
  return fromTypes.map((fromType) => createBoundariesRule({ fromType, allow }));
}

function createModuleBoundariesRules(moduleName, fromTypes, allow) {
  return fromTypes.map((fromType) =>
    createBoundariesRule({ fromType, moduleName, allow })
  );
}

const CORE_SHARED = targets("core", "shared");
const CORE_SHARED_INFRA = targets("core", "shared", "infra");
const CORE_SHARED_DATABASE_INFRA = targets(
  "core",
  "shared",
  "database",
  "infra"
);

const SERVER_ELEMENT_PATTERNS = [
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
  { type: "infra", pattern: "src/infra/**/*" },
];

const BOUNDARY_RULES = [
  createBoundariesRule({ fromType: "core", allow: CORE_SHARED_INFRA }),
  createBoundariesRule({
    fromType: "database",
    allow: targets("core", "shared", "database"),
  }),
  createBoundariesRule({ fromType: "shared", allow: targets("shared") }),
  createBoundariesRule({
    fromType: "presentation",
    allow: [...CORE_SHARED, ...sameModuleTargets("business", "dto")],
  }),
  ...createBoundariesRules(
    ["business", "mechanics", "pipeline"],
    [
      ...CORE_SHARED_DATABASE_INFRA,
      ...sameModuleTargets("data-access", "dto", "business"),
    ]
  ),
  createBoundariesRule({
    fromType: "data-access",
    allow: [...CORE_SHARED_DATABASE_INFRA, sameModuleTarget("dto")],
  }),
  createBoundariesRule({
    fromType: "channels",
    allow: [...CORE_SHARED_INFRA, ...sameModuleTargets("dto", "data-access")],
  }),
  ...createBoundariesRules(
    ["workers"],
    [
      ...CORE_SHARED_DATABASE_INFRA,
      ...sameModuleTargets("business", "data-access", "dto"),
    ]
  ),
  createBoundariesRule({
    fromType: "cron",
    allow: [
      ...CORE_SHARED_DATABASE_INFRA,
      ...sameModuleTargets("business", "data-access", "dto"),
      target("business"),
    ],
  }),
  ...createBoundariesRules(
    ["gateways", "providers"],
    [...CORE_SHARED_INFRA, sameModuleTarget("dto")]
  ),
  createBoundariesRule({
    fromType: "guards",
    allow: [...CORE_SHARED_INFRA, ...sameModuleTargets("dto", "business")],
  }),
  createBoundariesRule({ fromType: "decorators", allow: CORE_SHARED }),
  createBoundariesRule({
    fromType: "infra",
    allow: targets("core", "shared", "infra"),
  }),
  ...createModuleBoundariesRules(
    "notification",
    ["business"],
    [...CORE_SHARED_DATABASE_INFRA, ...sameModuleTargets("data-access", "dto")]
  ),
  ...createModuleBoundariesRules("rate-limit", ["business"], CORE_SHARED_INFRA),
];

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
        "boundaries/elements": SERVER_ELEMENT_PATTERNS,
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
          { default: "disallow", rules: BOUNDARY_RULES },
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
