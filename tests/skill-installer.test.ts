import { beforeEach, describe, expect, it } from "vitest";

import { PROJECT_SKILL_PATHS, installProjectSkills } from "../src/llm/skill-installer";

class MemoryVault {
  files = new Map<string, string>();
  folders = new Set<string>();

  getAbstractFileByPath(path: string) {
    return this.folders.has(path) || this.files.has(path) ? { path } : null;
  }
  getFileByPath(path: string) {
    return this.files.has(path) ? ({ path } as never) : null;
  }
  async createFolder(path: string) {
    this.folders.add(path);
  }
  async create(path: string, content: string) {
    this.files.set(path, content);
    return { path } as never;
  }
  async read(file: { path: string }) {
    return this.files.get(file.path) ?? "";
  }
  async modify(file: { path: string }, content: string) {
    this.files.set(file.path, content);
  }
}

describe("project skill installer", () => {
  let vault: MemoryVault;
  beforeEach(() => {
    vault = new MemoryVault();
  });

  it("installs the same Retrieva skill for Codex and Claude Code", async () => {
    const result = await installProjectSkills(vault as never);
    expect(result).toEqual({
      [PROJECT_SKILL_PATHS[0]]: "created",
      [PROJECT_SKILL_PATHS[1]]: "created",
    });
    expect(vault.files.get(PROJECT_SKILL_PATHS[0])).toBe(vault.files.get(PROJECT_SKILL_PATHS[1]));
    expect(vault.files.get(PROJECT_SKILL_PATHS[0])).toContain("name: retrieva");
  });

  it("is idempotent and updates stale copies", async () => {
    await installProjectSkills(vault as never);
    vault.files.set(PROJECT_SKILL_PATHS[0], "old");
    expect(await installProjectSkills(vault as never)).toEqual({
      [PROJECT_SKILL_PATHS[0]]: "updated",
      [PROJECT_SKILL_PATHS[1]]: "unchanged",
    });
  });
});
