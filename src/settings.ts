import type { App, Plugin } from "obsidian";
import type { SettingDefinitionItem } from "obsidian";
import { PluginSettingTab, Setting } from "obsidian";
import { t } from "./i18n";
import { normalizeExcludedDirectories } from "./core";

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

export class SettingsStore {
  value: RetrievaSettings = { ...DEFAULT_SETTINGS };
  constructor(private readonly plugin: Plugin) {}
  async load(): Promise<void> {
    const data = (await this.plugin.loadData()) as Partial<RetrievaSettings> | null;
    this.value = {
      ...DEFAULT_SETTINGS,
      ...(data ?? {}),
      savedScopes: Array.isArray(data?.savedScopes) ? data.savedScopes : [],
      excludedDirectories: Array.isArray(data?.excludedDirectories)
        ? normalizeExcludedDirectories(data.excludedDirectories)
        : [],
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
    private readonly installProjectSkills: () => Promise<void>,
    private readonly rebuildIndex: () => Promise<void>,
  ) {
    super(app, plugin);
  }
  override getSettingDefinitions(): SettingDefinitionItem[] {
    return [
      {
        name: t("settings.cardsFolder"),
        render: setting => {
          setting.addText(text =>
            text.setValue(this.store.value.cardsFolder).onChange(async value => {
              this.store.value.cardsFolder = value.trim();
              await this.store.save();
            }),
          );
        },
      },
      {
        name: t("settings.excludedDirectories"),
        desc: t("settings.excludedDirectoriesDescription"),
        render: setting => {
          setting.addTextArea(text => {
            text
              .setPlaceholder("Archive\ntemplates")
              .setValue(this.store.value.excludedDirectories.join("\n"))
              .onChange(async value => {
                this.store.value.excludedDirectories = normalizeExcludedDirectories(
                  value.split("\n"),
                );
                await this.store.save();
              });
            text.inputEl.addEventListener("blur", () => void this.rebuildIndex());
          });
        },
      },
      this.toggleDefinition("settings.ribbon", "showRibbonIcon"),
      this.toggleDefinition("settings.excludeNew", "excludeNewSiblingsToday"),
      this.toggleDefinition("settings.excludeReview", "excludeReviewSiblingsToday"),
      {
        type: "group",
        heading: t("settings.savedScopes"),
        items: [
          ...this.store.value.savedScopes.map((scope, index) => ({
            name: scope.name || t("settings.newScope"),
            render: (setting: Setting) => {
              setting
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
                      this.update();
                    }),
                );
            },
          })),
          {
            name: t("settings.addScope"),
            render: setting => {
              setting.addButton(button =>
                button.setButtonText(t("settings.addScope")).onClick(async () => {
                  this.store.value.savedScopes.push({ name: t("settings.newScope"), tag: "" });
                  await this.store.save();
                  this.update();
                }),
              );
            },
          },
        ],
      },
      {
        type: "group",
        heading: t("settings.presets"),
        items: this.presetPaths().map(path => ({
          name: path,
          render: (setting: Setting) => {
            setting.addButton(button =>
              button.setButtonText(t("common.open")).onClick(() => void this.openPreset(path)),
            );
          },
        })),
      },
      {
        type: "group",
        heading: t("settings.llmSkills"),
        items: [
          {
            name: t("settings.installSkills"),
            desc: t("settings.installSkillsDescription"),
            render: setting => {
              setting.addButton(button =>
                button.setButtonText(t("settings.installSkillsButton")).onClick(async () => {
                  button.setDisabled(true);
                  try {
                    await this.installProjectSkills();
                  } finally {
                    button.setDisabled(false);
                  }
                }),
              );
            },
          },
        ],
      },
    ];
  }

  private toggleDefinition(
    nameKey: "settings.ribbon" | "settings.excludeNew" | "settings.excludeReview",
    key: "showRibbonIcon" | "excludeNewSiblingsToday" | "excludeReviewSiblingsToday",
  ): SettingDefinitionItem {
    return {
      name: t(nameKey),
      render: setting => {
        setting.addToggle(toggle =>
          toggle.setValue(this.store.value[key]).onChange(async value => {
            this.store.value[key] = value;
            await this.store.save();
          }),
        );
      },
    };
  }
}
