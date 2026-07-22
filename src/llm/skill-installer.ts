import type { Vault } from "obsidian";
import retrievaSkill from "../../skills/retrieva/SKILL.md";

export const PROJECT_SKILL_PATHS = [
  ".agents/skills/retrieva/SKILL.md",
  ".claude/skills/retrieva/SKILL.md",
] as const;

export type SkillInstallStatus = "created" | "updated" | "unchanged";

export async function projectSkillConflicts(vault: Vault): Promise<string[]> {
  const conflicts: string[] = [];
  for (const path of PROJECT_SKILL_PATHS)
    if ((await vault.adapter.exists(path)) && (await vault.adapter.read(path)) !== retrievaSkill)
      conflicts.push(path);
  return conflicts;
}

async function ensureFolder(vault: Vault, path: string): Promise<void> {
  let current = "";
  for (const segment of path.split("/")) {
    current = current ? `${current}/${segment}` : segment;
    if (!(await vault.adapter.exists(current))) await vault.adapter.mkdir(current);
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
    if (!(await vault.adapter.exists(path))) {
      await vault.adapter.write(path, retrievaSkill);
      result[rawPath] = "created";
      continue;
    }
    const current = await vault.adapter.read(path);
    if (current === retrievaSkill) {
      result[rawPath] = "unchanged";
      continue;
    }
    await vault.adapter.write(path, retrievaSkill);
    result[rawPath] = "updated";
  }
  return result;
}
