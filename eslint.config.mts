import obsidianmd from "eslint-plugin-obsidianmd";
import globals from "globals";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig(
  globalIgnores([
    "node_modules",
    "main.js",
    "esbuild.config.mjs",
    "package.json",
    "package-lock.json",
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
  {
    files: ["src/settings.ts", "src/ui/confirm-skill-overwrite-modal.ts"],
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
