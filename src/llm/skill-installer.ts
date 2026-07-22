import type { Vault } from "obsidian";
import retrievaSkill from "../../skills/retrieva/SKILL.md";

export const PROJECT_SKILL_PATHS = [
  ".agents/skills/retrieva/SKILL.md",
  ".claude/skills/retrieva/SKILL.md",
] as const;

export type SkillInstallStatus = "created" | "updated" | "unchanged";

async function ensureFolder(vault: Vault, path: string): Promise<void> {
  let current = "";
  for (const segment of path.split("/")) {
    current = current ? `${current}/${segment}` : segment;
    if (!vault.getAbstractFileByPath(current)) await vault.createFolder(current);
  }
}

export async function installProjectSkills(
  vault: Vault,
): Promise<Record<(typeof PROJECT_SKILL_PATHS)[number], SkillInstallStatus>> {
  const result = {} as Record<(typeof PROJECT_SKILL_PATHS)[number], SkillInstallStatus>;
  for (const rawPath of PROJECT_SKILL_PATHS) {
    const path = rawPath;
    const parent = path.split("/").slice(0, -1).join("/");
    await ensureFolder(vault, parent);
    const existing = vault.getFileByPath(path);
    if (!existing) {
      await vault.create(path, retrievaSkill);
      result[rawPath] = "created";
      continue;
    }
    const current = await vault.read(existing);
    if (current === retrievaSkill) {
      result[rawPath] = "unchanged";
      continue;
    }
    await vault.modify(existing, retrievaSkill);
    result[rawPath] = "updated";
  }
  return result;
}
