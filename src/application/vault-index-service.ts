import type { CardIndexLifecycle, PresetCatalog } from "../core";

/** Application use-cases for keeping the vault index ready and trustworthy. */
export class VaultIndexService {
  constructor(
    private readonly lifecycle: CardIndexLifecycle,
    private readonly presets: PresetCatalog,
    private readonly ensureDefaultPreset: () => Promise<void>,
  ) {}

  async initialize(): Promise<void> {
    await this.lifecycle.start();
    if (!this.presets.hasPresetDefinition("default")) {
      await this.ensureDefaultPreset();
      await this.lifecycle.rebuild();
    }
  }
  rebuild(): Promise<void> {
    return this.lifecycle.rebuild();
  }
  async validateVault(): Promise<void> {
    await this.lifecycle.rebuild();
    await this.lifecycle.deepValidate();
  }
}
