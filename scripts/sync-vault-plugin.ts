import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { PLUGIN_ID } from "../src/core/identifiers";

const ROOT = path.resolve(import.meta.dirname, "..");
const PLUGIN_DIR = path.join(ROOT, "test-vault/.obsidian/plugins", PLUGIN_ID);
const FILES = ["main.js", "manifest.json", "styles.css"];

async function main(): Promise<void> {
  await mkdir(PLUGIN_DIR, { recursive: true });
  for (const file of FILES) {
    try {
      await copyFile(path.join(ROOT, file), path.join(PLUGIN_DIR, file));
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT")
        throw new Error(`${file} not found — run \`pnpm build\` first.`);
      throw error;
    }
  }
  console.log(`Synced ${FILES.join(", ")} to ${PLUGIN_DIR}`);
}

void main();
