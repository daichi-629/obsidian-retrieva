import esbuild from "esbuild";
import sveltePlugin from "esbuild-svelte";
import { builtinModules } from "node:module";
import process from "node:process";
import svelteConfig from "./svelte.config.js";

const production = process.argv[2] === "production";
const context = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: ["obsidian", "electron", ...builtinModules],
  mainFields: ["svelte", "browser", "module", "main"],
  conditions: ["svelte", "browser"],
  format: "cjs",
  target: "es2022",
  loader: { ".md": "text" },
  logLevel: "info",
  minify: production,
  sourcemap: production ? false : "inline",
  treeShaking: true,
  outfile: "main.js",
  plugins: [sveltePlugin(svelteConfig)],
});

if (production) {
  await context.rebuild();
  await context.dispose();
} else {
  await context.watch();
}
