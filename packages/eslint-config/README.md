# @repo/eslint-config

Shared ESLint config package for the workspace apps.

## What it provides

- `mobileConfig({ includeAssets })`
- `webConfig()`
- `serverConfig({ tsconfigRootDir })`
- `createImportOrderRule({ internalPosition })`
- `createFsdBoundariesConfig({ include, sharedPatterns, neverImportPatterns })`

The package keeps shared lint policy in one place and lets each app keep only the framework-specific pieces locally.

## Design goals

- Keep `eslint-config-next` in the web app root config.
- Share common `import/order` and FSD boundaries rules across mobile and web.
- Keep server-specific parser and Node globals in the server config.
- Use `boundaries/dependencies` with object selectors instead of the deprecated `boundaries/element-types` syntax.

## Usage

### Mobile

```js
const { defineConfig, globalIgnores } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");
const eslintConfig = require("@repo/eslint-config");

module.exports = defineConfig([
  expoConfig,
  ...eslintConfig.mobileConfig({ includeAssets: true }),
  globalIgnores([".expo/**", "dist/**", "node_modules/**"]),
]);
```

### Web

```js
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import eslintConfigPackage from "@repo/eslint-config";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  ...eslintConfigPackage.webConfig(),
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
]);

export default eslintConfig;
```

### Server

```js
import { defineConfig, globalIgnores } from "eslint/config";
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import eslintConfigPackage from "@repo/eslint-config";

const eslintConfig = defineConfig([
  globalIgnores(["dist/**", "coverage/**", "node_modules/**"]),
  ...tseslint.config(
    {
      ignores: ["eslint.config.mjs"],
    },
    eslint.configs.recommended,
    ...tseslint.configs.recommendedTypeChecked,
    ...eslintConfigPackage.serverConfig({
      tsconfigRootDir: import.meta.dirname,
    })
  ),
]);

export default eslintConfig;
```

## FSD boundaries

The shared boundaries helper is built for the workspace's FSD-style layout:

- `shared`
- `feature`
- `widget`
- `app`
- `neverImport`

Mobile can optionally include `assets/**/*` in `shared` so assets stay available to shared UI and feature code.
Web can include `src/tasks/**/*` in its shared area and restrict `neverImport` accordingly.

## Notes

- Web must keep the Next.js ESLint presets in the app root config.
- `import/order` is standardized to keep `@/**` before internal imports.
- Shared helper files are split by concern to keep the package easy to maintain.
