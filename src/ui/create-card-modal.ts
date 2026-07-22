import { Modal, Notice, Setting } from "obsidian";
import type RetrievaPlugin from "../main";
import { t } from "../i18n";

export class CreateCardModal extends Modal {
  private front = "";
  private back = "";
  private filename = "";
  private presetId = "default";
  constructor(
    private readonly retrieva: RetrievaPlugin,
    private readonly pair: boolean,
  ) {
    super(retrieva.app);
  }
  override onOpen(): void {
    this.contentEl.createEl("h2", { text: this.pair ? t("create.pairTitle") : t("create.title") });
    const active = this.app.workspace.getActiveFile();
    const base = active?.basename ?? "Card";
    this.front = active ? `![[${active.path}#Front]]` : "";
    this.back = active ? `![[${active.path}#Back]]` : "";
    this.filename = base;
    new Setting(this.contentEl).setName(t("create.front")).addText(text =>
      text.setValue(this.front).onChange(value => {
        this.front = value.trim();
      }),
    );
    new Setting(this.contentEl).setName(t("create.back")).addText(text =>
      text.setValue(this.back).onChange(value => {
        this.back = value.trim();
      }),
    );
    new Setting(this.contentEl).setName(t("create.filename")).addText(text =>
      text.setValue(this.filename).onChange(value => {
        this.filename = value.trim();
      }),
    );
    new Setting(this.contentEl).setName(t("create.preset")).addDropdown(dropdown => {
      for (const preset of this.retrieva.index.presets.values())
        dropdown.addOption(preset.id, preset.id);
      dropdown.setValue(this.presetId).onChange(value => {
        this.presetId = value;
      });
    });
    new Setting(this.contentEl).addButton(button =>
      button
        .setButtonText(t("create.submit"))
        .setCta()
        .onClick(async () => {
          if (
            !this.front ||
            !this.back ||
            !this.filename ||
            !this.retrieva.index.presets.has(this.presetId)
          ) {
            new Notice(t("create.required"));
            return;
          }
          try {
            await this.retrieva.createCards({
              front: this.front,
              back: this.back,
              filename: this.filename,
              presetId: this.presetId,
              pair: this.pair,
            });
            this.close();
          } catch (error) {
            new Notice(String(error));
          }
        }),
    );
  }
  override onClose(): void {
    this.contentEl.empty();
  }
}
