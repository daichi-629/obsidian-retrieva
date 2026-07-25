import * as fs from "node:fs/promises";
import * as fsSync from "node:fs";
import * as path from "node:path";
import type { FileAdapter } from "../src/core";

export interface NodeFileRef {
  path: string;
  fullPath: string;
}

export class NodeFileAdapter implements FileAdapter<NodeFileRef> {
  constructor(public readonly rootDir: string) {}

  private toFullPath(relativePath: string): string {
    return path.join(this.rootDir, relativePath);
  }

  onChange(_listener: (file: any) => void): any[] {
    return [];
  }

  async listMarkdown(): Promise<NodeFileRef[]> {
    const results: NodeFileRef[] = [];
    const root = this.rootDir;
    async function scan(dir: string) {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            await scan(full);
          } else if (entry.isFile() && entry.name.endsWith(".md")) {
            const rel = path.relative(root, full).replace(/\\/g, "/");
            results.push({ path: rel, fullPath: full });
          }
        }
      } catch {
        // Ignore non-existent directories
      }
    }
    await scan(root);
    return results;
  }

  get(relativePath: string): NodeFileRef | null {
    const full = this.toFullPath(relativePath);
    if (!fsSync.existsSync(full)) return null;
    return { path: relativePath.replace(/\\/g, "/"), fullPath: full };
  }

  async read(file: NodeFileRef): Promise<string> {
    return await fs.readFile(file.fullPath, "utf-8");
  }

  async readFresh(file: NodeFileRef): Promise<string> {
    return await fs.readFile(file.fullPath, "utf-8");
  }

  async write(file: NodeFileRef, source: string): Promise<void> {
    await fs.mkdir(path.dirname(file.fullPath), { recursive: true });
    await fs.writeFile(file.fullPath, source, "utf-8");
  }

  async create(relativePath: string, source: string): Promise<NodeFileRef> {
    const full = this.toFullPath(relativePath);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, source, "utf-8");
    return { path: relativePath.replace(/\\/g, "/"), fullPath: full };
  }
}
