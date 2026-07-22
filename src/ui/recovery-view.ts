import { ItemView, Notice, Setting, type WorkspaceLeaf } from "obsidian";
import {
  MARKERS,
  parseCardMarkdown,
  parseEvent,
  sortAndRegenerateParents,
  validateLinearHistory,
  type CardEvent,
} from "../core";
import type RetrievaPlugin from "../main";
import { t } from "../i18n";
import { RECOVERY_VIEW_TYPE } from "./view-types";

export class RecoveryView extends ItemView {
  private selectedPath: string | null = null;
  private draft = "";
  constructor(
    leaf: WorkspaceLeaf,
    private readonly plugin: RetrievaPlugin,
  ) {
    super(leaf);
  }
  getViewType(): string {
    return RECOVERY_VIEW_TYPE;
  }
  getDisplayText(): string {
    return t("recovery.title");
  }
  override getIcon(): string {
    return "wrench";
  }
  override async onOpen(): Promise<void> {
    await this.plugin.ensureIndexReady();
    this.register(
      this.plugin.index.onChange(() => {
        void this.display();
      }),
    );
    await this.display();
  }
  private async display(): Promise<void> {
    const root = this.contentEl;
    root.empty();
    root.addClass("retrieva-view");
    root.createEl("h2", { text: t("recovery.title") });
    const paths = [...this.plugin.index.invalid.keys()].sort();
    if (!paths.length) {
      root.createEl("p", { text: t("recovery.empty") });
      return;
    }
    const select = root.createEl("select");
    select.createEl("option", { text: t("recovery.choose"), value: "" });
    paths.forEach(path => select.createEl("option", { text: path, value: path }));
    select.value = this.selectedPath ?? "";
    select.onchange = async () => {
      this.selectedPath = select.value || null;
      await this.loadDraft();
      await this.display();
    };
    if (!this.selectedPath) return;
    const errors = this.plugin.index.invalid.get(this.selectedPath) ?? [];
    const list = root.createEl("ul");
    errors.forEach(error =>
      list.createEl("li", {
        text: error.line
          ? t("recovery.line", { line: error.line, message: error.message })
          : error.message,
      }),
    );
    if (!this.plugin.index.parsed.has(this.selectedPath)) {
      new Setting(root).addButton(button =>
        button
          .setButtonText(t("recovery.openPreset"))
          .setCta()
          .onClick(() => {
            void this.plugin.openFile(this.selectedPath!);
          }),
      );
      root.createEl("p", { text: t("recovery.fixPreset"), cls: "mod-muted" });
      return;
    }
    new Setting(root)
      .addButton(button =>
        button.setButtonText(t("recovery.openFile")).onClick(() => {
          void this.plugin.openFile(this.selectedPath!);
        }),
      )
      .addButton(button =>
        button.setButtonText(t("common.reload")).onClick(async () => {
          await this.loadDraft();
          await this.display();
        }),
      )
      .addButton(button =>
        button.setButtonText(t("recovery.generate")).onClick(async () => {
          try {
            await this.plugin.repository.repairMetadata(this.selectedPath!, false);
            await this.loadDraft();
            await this.display();
          } catch (error) {
            new Notice(String(error));
          }
        }),
      )
      .addButton(button =>
        button.setButtonText(t("recovery.reissue")).onClick(async () => {
          try {
            await this.plugin.repository.repairMetadata(this.selectedPath!, true);
            await this.loadDraft();
            await this.display();
          } catch (error) {
            new Notice(String(error));
          }
        }),
      );
    const textarea = root.createEl("textarea", { cls: "retrieva-editor" });
    textarea.value = this.draft;
    textarea.oninput = () => {
      this.draft = textarea.value;
    };
    new Setting(root)
      .addButton(button =>
        button.setButtonText(t("recovery.sort")).onClick(() => {
          const events = this.parseDraft();
          if (!events) return;
          this.draft = sortAndRegenerateParents(events)
            .map(event => JSON.stringify(event))
            .join("\n");
          void this.display();
        }),
      )
      .addButton(button =>
        button.setButtonText(t("common.validate")).onClick(() => {
          const events = this.parseDraft();
          if (!events) return;
          const errors = validateLinearHistory(events);
          new Notice(
            errors.length ? errors.map(error => error.message).join("\n") : t("recovery.valid"),
          );
        }),
      )
      .addButton(button =>
        button
          .setButtonText(t("recovery.save"))
          .setCta()
          .onClick(() => {
            void this.save();
          }),
      );
    root.createEl("p", { text: t("recovery.help"), cls: "mod-muted" });
  }
  private async loadDraft(): Promise<void> {
    if (!this.selectedPath) return;
    const file = this.plugin.index.files.get(this.selectedPath);
    if (!file) return;
    const parsed = parseCardMarkdown(file.path, await this.plugin.index.files.readFresh(file));
    this.draft = parsed.rawEventLines.join("\n");
  }
  private parseDraft(): CardEvent[] | null {
    const events: CardEvent[] = [];
    for (const [index, line] of this.draft.split(/\r?\n/).entries()) {
      if (!line.trim()) continue;
      try {
        const result = parseEvent(JSON.parse(line));
        if (!result.event) throw new Error(result.error);
        events.push(result.event);
      } catch (error) {
        new Notice(t("recovery.line", { line: index + 1, message: String(error) }));
        return null;
      }
    }
    return events;
  }
  private async save(): Promise<void> {
    if (!this.selectedPath) return;
    const events = this.parseDraft();
    if (!events) return;
    const errors = validateLinearHistory(events);
    if (errors.length) {
      new Notice(errors.map(error => error.message).join("\n"));
      return;
    }
    const file = this.plugin.index.files.get(this.selectedPath);
    if (!file) return;
    const source = await this.plugin.index.files.readFresh(file);
    const parsed = parseCardMarkdown(file.path, source);
    const start = source.indexOf(MARKERS.logStart),
      end = source.indexOf(MARKERS.logEnd, start + MARKERS.logStart.length);
    if (start < 0 || end < 0) {
      new Notice(t("recovery.fixMarkers"));
      return;
    }
    const replacement = `${MARKERS.logStart}${parsed.newline}${events.map(event => JSON.stringify(event)).join(parsed.newline)}${parsed.newline}`;
    const repaired = source.slice(0, start) + replacement + source.slice(end);
    await this.plugin.index.files.write(file, repaired);
    await this.plugin.index.refresh(file.path);
    if (this.plugin.index.invalid.has(file.path)) new Notice(t("recovery.stillInvalid"));
    else {
      new Notice(t("recovery.repaired"));
      this.selectedPath = null;
      this.draft = "";
    }
    await this.display();
  }
}
