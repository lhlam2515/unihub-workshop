function createImportOrderRule({ internalPosition = "before" } = {}) {
  return [
    "error",
    {
      groups: [
        "builtin",
        "external",
        "internal",
        ["parent", "sibling", "index"],
        "object",
        "type",
      ],
      "newlines-between": "always",
      pathGroups: [
        {
          pattern: "@/**",
          group: "internal",
          position: internalPosition,
        },
      ],
      pathGroupsExcludedImportTypes: ["builtin"],
      alphabetize: {
        order: "asc",
        caseInsensitive: true,
      },
    },
  ];
}

module.exports = {
  createImportOrderRule,
};
