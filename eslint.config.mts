import obsidianmd from "eslint-plugin-obsidianmd";
import globals from "globals";
import { defineConfig, globalIgnores } from "eslint/config";
import svelte from "eslint-plugin-svelte";
import ts from "typescript-eslint";
import svelteConfig from "./svelte.config.js";

export default defineConfig(
  globalIgnores([
    "node_modules",
    "main.js",
    "esbuild.config.mjs",
    "package.json",
    "versions.json",
    "test-vault",
  ]),
  {
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: {
        projectService: {
          allowDefaultProject: ["eslint.config.mts", "manifest.json"],
        },
        tsconfigRootDir: import.meta.dirname,
        extraFileExtensions: [".json"],
      },
    },
  },
  ...obsidianmd.configs.recommended,
  ...svelte.configs.recommended,
  {
    files: ["**/*.svelte", "**/*.svelte.ts"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        extraFileExtensions: [".svelte"],
        parser: ts.parser,
        svelteConfig,
      },
    },
  },
  {
    files: [
      "src/settings.ts",
      "src/ui/confirm-skill-overwrite-modal.ts",
      "src/ui/confirm-modal.ts",
    ],
    rules: {
      "@typescript-eslint/no-deprecated": "off",
    },
  },
  {
    files: ["src/settings.ts"],
    rules: {
      "obsidianmd/settings-tab/prefer-setting-definitions": "off",
    },
  },
  {
    files: ["scripts/**/*.ts"],
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      "obsidianmd/no-nodejs-modules": "off",
      "obsidianmd/hardcoded-config-path": "off",
      "obsidianmd/rule-custom-message": "off",
    },
  },
);
