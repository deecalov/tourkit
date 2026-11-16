import eslint from "@eslint/js";
import prettier from "eslint-config-prettier";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "coverage/**",
      "test-results/**",
      "demo/dist/**",
      "site/**",
      "docs-site/api/**",
      "docs-site/.vitepress/cache/**",
      "docs-site/.vitepress/dist/**",
      "docs-site/.vitepress/.temp/**",
      ".playwright-mcp/**",
      "src/styles/css.generated.ts",
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    rules: {
      // The public API deliberately exposes fluent `this`-returning helpers.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/consistent-type-imports": ["error", { fixStyle: "inline-type-imports" }],
      "no-console": ["error", { allow: ["warn", "error"] }],
    },
  },
  {
    // Ambient declarations: `declare var` is the only way to type a global.
    files: ["**/*.d.ts"],
    rules: { "no-var": "off" },
  },
  {
    files: ["scripts/**", ".github/**/*.mjs", "bench/**", "demo/**", "*.config.ts", "*.config.js"],
    languageOptions: {
      globals: {
        console: "readonly",
        process: "readonly",
        URL: "readonly",
      },
    },
    rules: {
      "no-console": "off",
    },
  }
);
