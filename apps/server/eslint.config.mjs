import { defineConfig, globalIgnores } from "eslint/config";
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import eslintConfigPackage from "@repo/eslint-config";

const eslintConfig = defineConfig([
  ...tseslint.config(
    {
      ignores: ["eslint.config.mjs"],
    },
    eslint.configs.recommended,
    ...tseslint.configs.recommendedTypeChecked,
    ...eslintConfigPackage.serverConfig({
      tsconfigRootDir: import.meta.dirname,
    }),
    globalIgnores(["dist/**", "coverage/**", "node_modules/**"])
  ),
]);

export default eslintConfig;
