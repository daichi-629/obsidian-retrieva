import { ItemView, Notice, Setting, type WorkspaceLeaf } from "obsidian";
import { IDENTIFIERS } from "../core";
import type RetrievaPlugin from "../main";
import { t } from "../i18n";
import { SUSPENDED_VIEW_TYPE } from "./view-types";

export class SuspendedView extends ItemView {
  constructor(
    leaf: WorkspaceLeaf,
    private readonly plugin: RetrievaPlugin,
  ) {
    super(leaf);
  }
  getViewType(): string {
    return SUSPENDED_VIEW_TYPE;
  }
  getDisplayText(): string {
    return t("suspended.title");
  }
  override getIcon(): string {
    return "circle-pause";
  }
  override async onOpen(): Promise<void> {
    await this.plugin.ensureIndexReady();
    this.register(this.plugin.index.onChange(() => this.display()));
    this.display();
  }
  private display(): void {
    const root = this.contentEl;
    root.empty();
    root.addClass("retrieva-view");
    root.createEl("h2", { text: t("suspended.title") });
    const cards = [...this.plugin.index.cards.values()]
      .filter(card => card.state.suspended)
      .sort((left, right) => left.path.localeCompare(right.path));
    if (!cards.length) {
      root.createEl("p", { text: t("suspended.empty") });
      return;
    }
    for (const card of cards)
      new Setting(root)
        .setName(card.path)
        .setDesc(
          card.tags
            .filter(tag => tag !== IDENTIFIERS.cardTag)
            .map(tag => `#${tag}`)
            .join(" "),
        )
        .addButton(button =>
          button.setButtonText(t("review.openCard")).onClick(() => {
            void this.plugin.openFile(card.path);
          }),
        )
        .addButton(button =>
          button.setButtonText(t("review.resume")).onClick(async () => {
            button.setDisabled(true);
            try {
              const result = await this.plugin.repository.stateChange(
                card.path,
                card.lastEventId,
                "resume",
                new Date(),
                Intl.DateTimeFormat().resolvedOptions().timeZone,
              );
              if (result.status === "stale") new Notice(result.reason);
              else new Notice(t("notice.cardResumed"));
            } finally {
              button.setDisabled(false);
            }
          }),
        );
  }
}
