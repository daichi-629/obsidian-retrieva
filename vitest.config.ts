import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      obsidian: path.resolve(__dirname, "tests/obsidian-mock.ts"),
    },
  },
  plugins: [
    {
      name: "markdown-as-text",
      enforce: "pre",
      transform(source, id) {
        if (id.endsWith(".md")) return `export default ${JSON.stringify(source)}`;
      },
    },
  ],
});
