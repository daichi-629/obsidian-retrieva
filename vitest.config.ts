import { defineConfig } from "vitest/config";

export default defineConfig({
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
