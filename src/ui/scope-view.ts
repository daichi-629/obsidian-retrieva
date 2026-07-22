import { getAllTags, ItemView, Notice, Setting, type WorkspaceLeaf } from "obsidian";
import { buildQueue } from "../core";
import { t } from "../i18n";
import type RetrievaPlugin from "../main";
import { SCOPE_VIEW_TYPE } from "./view-types";

export class ScopeView extends ItemView {
  constructor(
    leaf: WorkspaceLeaf,
    private readonly plugin: RetrievaPlugin,
  ) {
    super(leaf);
  }
  getViewType(): string {
    return SCOPE_VIEW_TYPE;
  }
  getDisplayText(): string {
    return "Retrieva";
  }
  override getIcon(): string {
    return "brain-circuit";
  }
  override async onOpen(): Promise<void> {
    this.register(this.plugin.index.onChange(() => this.display()));
    this.display();
  }
  private count(tag: string): string {
    const queue = buildQueue(
      this.plugin.index.cardsForTag(tag),
      this.plugin.effectivePresets(),
      new Date(),
    );
    return `${queue.ready.length} / ${queue.totalValid}`;
  }
  private display(): void {
    const root = this.contentEl;
    root.empty();
    root.addClass("retrieva-view");
    root.createEl("h2", { text: t("scope.choose") });
    if (this.plugin.settingsStore.value.savedScopes.length) {
      root.createEl("h3", { text: t("settings.savedScopes") });
      const list = root.createDiv("retrieva-list");
      for (const scope of this.plugin.settingsStore.value.savedScopes) {
        const row = list.createEl("button", { cls: "retrieva-list-row" });
        row.createSpan({ text: scope.name });
        row.createEl("small", { text: this.count(scope.tag) });
        row.onclick = () => {
          void this.plugin.openReview(scope.name, scope.tag);
        };
      }
    }
    root.createEl("h3", { text: t("scope.newTag") });
    let tag = "",
      save = false,
      name = "";
    const result = root.createEl("p", { text: t("scope.selectTag") });
    const refresh = (): void => {
      result.setText(tag ? this.count(tag) : t("scope.selectTag"));
    };
    new Setting(root).setName(t("scope.tag")).addSearch(search => {
      search.setPlaceholder("flashcards/example").onChange(value => {
        tag = value.replace(/^#/, "").trim();
        refresh();
      });
      const tags = [
        ...new Set(
          this.app.vault
            .getMarkdownFiles()
            .flatMap(file => {
              const cache = this.app.metadataCache.getFileCache(file);
              return cache ? (getAllTags(cache) ?? []) : [];
            })
            .map(value => value.replace(/^#/, "")),
        ),
      ];
      search.inputEl.setAttr("list", "retrieva-tags");
      const datalist = root.createEl("datalist");
      datalist.id = "retrieva-tags";
      tags.forEach(value => datalist.createEl("option", { value }));
    });
    new Setting(root).setName(t("scope.saveWithName")).addToggle(toggle =>
      toggle.onChange(value => {
        save = value;
        nameSetting.settingEl.toggle(value);
      }),
    );
    const nameSetting = new Setting(root).setName(t("scope.name")).addText(text =>
      text.onChange(value => {
        name = value.trim();
      }),
    );
    nameSetting.settingEl.hide();
    new Setting(root).addButton(button =>
      button
        .setButtonText(t("common.start"))
        .setCta()
        .onClick(async () => {
          if (!tag) {
            new Notice(t("scope.chooseFirst"));
            return;
          }
          if (save && name) {
            this.plugin.settingsStore.value.savedScopes.push({ name, tag });
            await this.plugin.settingsStore.save();
          }
          await this.plugin.openReview(name || `#${tag}`, tag);
        }),
    );
  }
}
