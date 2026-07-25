import type { App, Plugin } from "obsidian";
import { PluginSettingTab, Setting } from "obsidian";
import { normalizeExcludedDirectories } from "./core";
import { t } from "./i18n";

export interface SavedScope {
  name: string;
  tag: string;
}
export interface RetrievaSettings {
  savedScopes: SavedScope[];
  cardsFolder: string;
  excludedDirectories: string[];
  showRibbonIcon: boolean;
  excludeNewSiblingsToday: boolean;
  excludeReviewSiblingsToday: boolean;
}
export const DEFAULT_SETTINGS: RetrievaSettings = {
  savedScopes: [],
  cardsFolder: "Cards",
  excludedDirectories: [],
  showRibbonIcon: true,
  excludeNewSiblingsToday: true,
  excludeReviewSiblingsToday: true,
};

/** Persists validated plugin settings. */
export class SettingsStore {
  value: RetrievaSettings = { ...DEFAULT_SETTINGS };
  constructor(private readonly plugin: Plugin) {}

  async load(): Promise<void> {
    const data = (await this.plugin.loadData()) as Partial<RetrievaSettings> | null;
    this.value = {
      ...DEFAULT_SETTINGS,
      cardsFolder:
        typeof data?.cardsFolder === "string"
          ? data.cardsFolder.trim()
          : DEFAULT_SETTINGS.cardsFolder,
      showRibbonIcon:
        typeof data?.showRibbonIcon === "boolean"
          ? data.showRibbonIcon
          : DEFAULT_SETTINGS.showRibbonIcon,
      excludeNewSiblingsToday:
        typeof data?.excludeNewSiblingsToday === "boolean"
          ? data.excludeNewSiblingsToday
          : DEFAULT_SETTINGS.excludeNewSiblingsToday,
      excludeReviewSiblingsToday:
        typeof data?.excludeReviewSiblingsToday === "boolean"
          ? data.excludeReviewSiblingsToday
          : DEFAULT_SETTINGS.excludeReviewSiblingsToday,
      savedScopes: Array.isArray(data?.savedScopes)
        ? data.savedScopes
            .filter(
              (scope): scope is SavedScope =>
                typeof scope === "object" &&
                scope !== null &&
                typeof scope.name === "string" &&
                typeof scope.tag === "string",
            )
            .map(scope => ({ name: scope.name.trim(), tag: scope.tag.replace(/^#/, "").trim() }))
        : [],
      excludedDirectories: Array.isArray(data?.excludedDirectories)
        ? normalizeExcludedDirectories(data.excludedDirectories)
        : [],
    };
  }
  save(): Promise<void> {
    return this.plugin.saveData(this.value);
  }
}

export interface SettingsActions {
  openPreset(path: string): Promise<void>;
  presetPaths(): string[];
  installProjectSkills(): Promise<void>;
  rebuildIndex(): Promise<void>;
}

/** Obsidian settings UI; settings-specific rendering stays outside the plugin lifecycle. */
export class RetrievaSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    plugin: Plugin,
    private readonly store: SettingsStore,
    private readonly actions: SettingsActions,
  ) {
    super(app, plugin);
  }
  override display(): void {
    this.containerEl.empty();
    this.renderGeneralSettings();
    this.renderScopes();
    this.renderPresets();
    this.renderSkillInstaller();
  }
  private renderGeneralSettings(): void {
    new Setting(this.containerEl).setName(t("settings.cardsFolder")).addText(text =>
      text.setValue(this.store.value.cardsFolder).onChange(async value => {
        this.store.value.cardsFolder = value.trim();
        await this.store.save();
      }),
    );
    new Setting(this.containerEl)
      .setName(t("settings.excludedDirectories"))
      .setDesc(t("settings.excludedDirectoriesDescription"))
      .addTextArea(text => {
        text
          .setPlaceholder("Archive\ntemplates")
          .setValue(this.store.value.excludedDirectories.join("\n"))
          .onChange(async value => {
            this.store.value.excludedDirectories = normalizeExcludedDirectories(value.split("\n"));
            await this.store.save();
          });
        text.inputEl.addEventListener("blur", () => void this.actions.rebuildIndex());
      });
    this.addToggle("settings.ribbon", "showRibbonIcon");
    this.addToggle("settings.excludeNew", "excludeNewSiblingsToday");
    this.addToggle("settings.excludeReview", "excludeReviewSiblingsToday");
  }
  private addToggle(
    name: "settings.ribbon" | "settings.excludeNew" | "settings.excludeReview",
    key: "showRibbonIcon" | "excludeNewSiblingsToday" | "excludeReviewSiblingsToday",
  ): void {
    new Setting(this.containerEl).setName(t(name)).addToggle(toggle =>
      toggle.setValue(this.store.value[key]).onChange(async value => {
        this.store.value[key] = value;
        await this.store.save();
      }),
    );
  }
  private renderScopes(): void {
    new Setting(this.containerEl).setName(t("settings.savedScopes")).setHeading();
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
  }
  private renderPresets(): void {
    new Setting(this.containerEl).setName(t("settings.presets")).setHeading();
    for (const path of this.actions.presetPaths())
      new Setting(this.containerEl)
        .setName(path)
        .addButton(button =>
          button.setButtonText(t("common.open")).onClick(() => void this.actions.openPreset(path)),
        );
  }
  private renderSkillInstaller(): void {
    new Setting(this.containerEl).setName(t("settings.llmSkills")).setHeading();
    new Setting(this.containerEl)
      .setName(t("settings.installSkills"))
      .setDesc(t("settings.installSkillsDescription"))
      .addButton(button =>
        button.setButtonText(t("settings.installSkillsButton")).onClick(async () => {
          button.setDisabled(true);
          try {
            await this.actions.installProjectSkills();
          } finally {
            button.setDisabled(false);
          }
        }),
      );
  }
}
