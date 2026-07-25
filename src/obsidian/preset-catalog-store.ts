import type { Preset } from "../core";

/** Owns the settings-side view of valid preset definitions. */
export class PresetCatalogStore {
  private presets = new Map<string, Preset>();
  private presetDefinitionIds = new Set<string>();

  replace(presets: Map<string, Preset>, presetDefinitionIds: Set<string>): void {
    this.presets = presets;
    this.presetDefinitionIds = presetDefinitionIds;
  }
  getPreset(id: string): Preset | undefined {
    return this.presets.get(id);
  }
  presetEntries(): [string, Preset][] {
    return [...this.presets];
  }
  presetPaths(): string[] {
    return [...this.presets.values()].map(preset => preset.sourcePath);
  }
  hasPresetDefinition(id: string): boolean {
    return this.presetDefinitionIds.has(id);
  }
}
