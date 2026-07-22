import { Modal, Setting } from "obsidian";
import type { App } from "obsidian";
import { t } from "../i18n";

export class ConfirmSkillOverwriteModal extends Modal {
  private resolve: ((confirmed: boolean) => void) | null = null;
  private confirmed = false;

  constructor(
    app: App,
    private readonly paths: string[],
  ) {
    super(app);
  }

  confirm(): Promise<boolean> {
    return new Promise(resolve => {
      this.resolve = resolve;
      this.open();
    });
  }

  override onOpen(): void {
    this.contentEl.createEl("h2", { text: t("skills.confirmTitle") });
    this.contentEl.createEl("p", { text: t("skills.confirmDescription") });
    const list = this.contentEl.createEl("ul");
    for (const path of this.paths) list.createEl("li", { text: path });
    new Setting(this.contentEl)
      .addButton(button => button.setButtonText(t("common.cancel")).onClick(() => this.close()))
      .addButton(button =>
        button
          .setButtonText(t("common.overwrite"))
          .setDestructive()
          .onClick(() => {
            this.confirmed = true;
            this.close();
          }),
      );
  }

  override onClose(): void {
    this.contentEl.empty();
    this.resolve?.(this.confirmed);
    this.resolve = null;
  }
}
