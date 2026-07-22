import type { App, Plugin } from "obsidian";
import { PluginSettingTab, Setting } from "obsidian";
import { t } from "./i18n";

export interface SavedScope {
  name: string;
  tag: string;
}
export interface RetrievaSettings {
  savedScopes: SavedScope[];
  cardsFolder: string;
  showRibbonIcon: boolean;
  excludeNewSiblingsToday: boolean;
  excludeReviewSiblingsToday: boolean;
}
export const DEFAULT_SETTINGS: RetrievaSettings = {
  savedScopes: [],
  cardsFolder: "Cards",
  showRibbonIcon: true,
  excludeNewSiblingsToday: true,
  excludeReviewSiblingsToday: true,
};

export class SettingsStore {
  value: RetrievaSettings = { ...DEFAULT_SETTINGS };
  constructor(private readonly plugin: Plugin) {}
  async load(): Promise<void> {
    const data = (await this.plugin.loadData()) as Partial<RetrievaSettings> | null;
    this.value = {
      ...DEFAULT_SETTINGS,
      ...(data ?? {}),
      savedScopes: Array.isArray(data?.savedScopes) ? data.savedScopes : [],
    };
  }
  async save(): Promise<void> {
    await this.plugin.saveData(this.value);
  }
}

export class RetrievaSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    plugin: Plugin,
    private readonly store: SettingsStore,
    private readonly openPreset: (path: string) => Promise<void>,
    private readonly presetPaths: () => string[],
  ) {
    super(app, plugin);
  }
  override display(): void {
    this.containerEl.empty();
    new Setting(this.containerEl).setName(t("settings.cardsFolder")).addText(text =>
      text.setValue(this.store.value.cardsFolder).onChange(async value => {
        this.store.value.cardsFolder = value.trim();
        await this.store.save();
      }),
    );
    new Setting(this.containerEl).setName(t("settings.ribbon")).addToggle(toggle =>
      toggle.setValue(this.store.value.showRibbonIcon).onChange(async value => {
        this.store.value.showRibbonIcon = value;
        await this.store.save();
      }),
    );
    new Setting(this.containerEl).setName(t("settings.excludeNew")).addToggle(toggle =>
      toggle.setValue(this.store.value.excludeNewSiblingsToday).onChange(async value => {
        this.store.value.excludeNewSiblingsToday = value;
        await this.store.save();
      }),
    );
    new Setting(this.containerEl).setName(t("settings.excludeReview")).addToggle(toggle =>
      toggle.setValue(this.store.value.excludeReviewSiblingsToday).onChange(async value => {
        this.store.value.excludeReviewSiblingsToday = value;
        await this.store.save();
      }),
    );
    this.containerEl.createEl("h3", { text: t("settings.savedScopes") });
    this.store.value.savedScopes.forEach((scope, index) => {
      new Setting(this.containerEl)
        .addText(text =>
          text.setValue(scope.name).onChange(async value => {
            scope.name = value;
            await this.store.save();
          }),
        )
        .addText(text =>
          text.setValue(scope.tag).onChange(async value => {
            scope.tag = value.replace(/^#/, "");
            await this.store.save();
          }),
        )
        .addExtraButton(button =>
          button
            .setIcon("trash")
            .setTooltip(t("settings.delete"))
            .onClick(async () => {
              this.store.value.savedScopes.splice(index, 1);
              await this.store.save();
              this.display();
            }),
        );
    });
    new Setting(this.containerEl).addButton(button =>
      button.setButtonText(t("settings.addScope")).onClick(async () => {
        this.store.value.savedScopes.push({ name: t("settings.newScope"), tag: "" });
        await this.store.save();
        this.display();
      }),
    );
    this.containerEl.createEl("h3", { text: t("settings.presets") });
    for (const path of this.presetPaths())
      new Setting(this.containerEl).setName(path).addButton(button =>
        button.setButtonText(t("common.open")).onClick(() => {
          void this.openPreset(path);
        }),
      );
  }
}
