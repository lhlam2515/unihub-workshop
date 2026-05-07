const boundaries = require("eslint-plugin-boundaries");

function createFsdBoundariesConfig({
  include = ["src/**/*"],
  sharedPatterns = [],
  neverImportPatterns = ["src/*"],
} = {}) {
  return {
    plugins: { boundaries },
    settings: {
      "boundaries/include": include,
      "boundaries/elements": [
        {
          mode: "full",
          type: "shared",
          pattern: [
            "src/components/**/*",
            ...sharedPatterns,
            "src/context/**/*",
            "src/providers/**/*",
            "src/database/**/*",
            "src/constants/**/*",
            "src/hooks/**/*",
            "src/lib/**/*",
            "src/types/**/*",
          ],
        },
        {
          mode: "full",
          type: "feature",
          capture: ["featureName"],
          pattern: ["src/features/*/**/*"],
        },
        {
          mode: "full",
          type: "widget",
          pattern: ["src/widgets/**/*"],
        },
        {
          mode: "full",
          type: "app",
          capture: ["_", "fileName"],
          pattern: ["src/app/**/*"],
        },
        {
          mode: "full",
          type: "neverImport",
          pattern: neverImportPatterns,
        },
      ],
    },
    rules: {
      "boundaries/no-unknown": ["error"],
      "boundaries/no-unknown-files": ["error"],
      "boundaries/dependencies": [
        "error",
        {
          default: "disallow",
          rules: [
            {
              from: { type: "shared" },
              allow: { to: { type: "shared" } },
            },
            {
              from: { type: "feature" },
              allow: {
                to: [
                  { type: "shared" },
                  {
                    type: "feature",
                    captured: {
                      featureName: "{{ from.captured.featureName }}",
                    },
                  },
                ],
              },
            },
            {
              from: { type: "widget" },
              allow: { to: { type: ["shared", "feature"] } },
            },
            {
              from: [{ type: "app" }, { type: "neverImport" }],
              allow: { to: { type: ["shared", "feature", "widget"] } },
            },
            {
              from: { type: "app" },
              allow: { to: { type: "app", internalPath: "*.css" } },
            },
          ],
        },
      ],
    },
  };
}

module.exports = {
  createFsdBoundariesConfig,
};
