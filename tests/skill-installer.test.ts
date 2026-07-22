import { beforeEach, describe, expect, it } from "vitest";

import {
  PROJECT_SKILL_PATHS,
  installProjectSkills,
  projectSkillConflicts,
} from "../src/llm/skill-installer";

class MemoryVault {
  files = new Map<string, string>();
  folders = new Set<string>();
  adapter = {
    exists: async (path: string) => this.folders.has(path) || this.files.has(path),
    mkdir: async (path: string) => {
      if (this.folders.has(path)) throw new Error("Folder already exists");
      this.folders.add(path);
    },
    read: async (path: string) => this.files.get(path) ?? "",
    write: async (path: string, content: string) => {
      this.files.set(path, content);
    },
  };
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
    expect(vault.files.get(PROJECT_SKILL_PATHS[0])).toContain(
      "ask the user before creating a card",
    );
    expect(vault.files.get(PROJECT_SKILL_PATHS[0])).not.toContain("default is `Cards`");
  });

  it("is idempotent and updates stale copies", async () => {
    await installProjectSkills(vault as never);
    vault.files.set(PROJECT_SKILL_PATHS[0], "old");
    expect(await installProjectSkills(vault as never)).toEqual({
      [PROJECT_SKILL_PATHS[0]]: "updated",
      [PROJECT_SKILL_PATHS[1]]: "unchanged",
    });
  });

  it("reports only existing skill files with different content", async () => {
    await installProjectSkills(vault as never);
    expect(await projectSkillConflicts(vault as never)).toEqual([]);
    vault.files.set(PROJECT_SKILL_PATHS[1], "user customization");
    expect(await projectSkillConflicts(vault as never)).toEqual([PROJECT_SKILL_PATHS[1]]);
  });

  it("uses the adapter when hidden parent folders already exist", async () => {
    vault.folders.add(".agents");
    vault.folders.add(".claude");
    await expect(installProjectSkills(vault as never)).resolves.toEqual({
      [PROJECT_SKILL_PATHS[0]]: "created",
      [PROJECT_SKILL_PATHS[1]]: "created",
    });
  });
});
