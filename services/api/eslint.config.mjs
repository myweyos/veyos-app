// @ts-check
import tseslint from "typescript-eslint";

export default tseslint.config(
  // Base TypeScript rules
  ...tseslint.configs.recommendedTypeChecked,

  {
    languageOptions: {
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // Project-specific overrides
  {
    rules: {
      // NestJS uses decorators extensively — empty constructors are fine
      "@typescript-eslint/no-empty-function": "off",

      // postgres.js tagged templates return typed rows; unsafe calls are intentional
      // in migration.runner.ts where we execute raw SQL from known-good files
      "@typescript-eslint/no-unsafe-call": "warn",
      "@typescript-eslint/no-unsafe-assignment": "warn",
      "@typescript-eslint/no-unsafe-member-access": "warn",
      "@typescript-eslint/no-unsafe-return": "warn",
      "@typescript-eslint/no-unsafe-argument": "warn",

      // Unused vars: allow leading _ to silence for intentional ignores
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],

      // Explicit return types on public API surface; relax for internal arrow fns
      "@typescript-eslint/explicit-module-boundary-types": "off",

      // Disallow floating promises — critical in NestJS lifecycle hooks
      "@typescript-eslint/no-floating-promises": "error",

      // require-await: skip — NestJS interfaces often force async signatures
      "@typescript-eslint/require-await": "off",
    },
  },

  // Ignore compiled output
  {
    ignores: ["dist/**", "node_modules/**"],
  },
);
