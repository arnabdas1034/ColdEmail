import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier";
import nextPlugin from "@next/eslint-plugin-next";

const eslintConfig = defineConfig([
  // TypeScript-ESLint recommended rules.
  // Uses @typescript-eslint/parser — no Babel, no hanging, full TS support.
  ...tseslint.configs.recommended,

  // Project-specific rule overrides & Next.js rules
  {
    files: ["**/*.ts", "**/*.tsx"],
    plugins: {
      "@next/next": nextPlugin,
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,

      // No 'any' — enforces the strict TypeScript bar we committed to.
      // Break if removed: TypeScript becomes meaningless; bugs hide at runtime.
      "@typescript-eslint/no-explicit-any": "error",

      // Unused vars as warnings, not errors (TS already catches them at build).
      "@typescript-eslint/no-unused-vars": "warn",

      // Warn on console.* — reminder to remove debug logs before shipping.
      // "warn" not "error" so it never blocks a build.
      "no-console": "warn",
    },
  },

  // Must be last — disables ESLint formatting rules that conflict with Prettier.
  eslintConfigPrettier,

  // Ignore generated and build output directories.
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "node_modules/**"]),
]);

export default eslintConfig;
