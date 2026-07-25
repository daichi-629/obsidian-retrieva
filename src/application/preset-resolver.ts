import type { Preset, PresetCatalog } from "../core";

export interface PresetOverrides {
  excludeNewSiblingsToday: boolean;
  excludeReviewSiblingsToday: boolean;
}

/** Resolves the runtime preset view from file definitions and user overrides. */
export class PresetResolver {
  constructor(
    private readonly catalog: PresetCatalog,
    private readonly overrides: () => PresetOverrides,
  ) {}

  resolveAll(): Map<string, Preset> {
    const override = this.overrides();
    return new Map(
      this.catalog.presetEntries().map(([id, preset]) => [
        id,
        {
          ...preset,
          excludeNewSiblingsToday: override.excludeNewSiblingsToday,
          excludeReviewSiblingsToday: override.excludeReviewSiblingsToday,
        },
      ]),
    );
  }
}
