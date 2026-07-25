import { Modal, Setting } from "obsidian";
import type { App } from "obsidian";
import { t } from "../i18n";

export class ConfirmModal extends Modal {
  private resolve: ((confirmed: boolean) => void) | null = null;
  private confirmed = false;

  constructor(
    app: App,
    private readonly message: string,
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
    this.contentEl.createEl("p", { text: this.message });
    new Setting(this.contentEl)
      .addButton(button => button.setButtonText(t("common.cancel")).onClick(() => this.close()))
      .addButton(button =>
        button
          .setButtonText(t("settings.delete"))
          .setWarning()
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
