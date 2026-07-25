import type { EventRef, Plugin, TAbstractFile } from "obsidian";
import { normalizePath, TFile } from "obsidian";
import type { FileAdapter } from "../core";

export class ObsidianFileAdapter implements FileAdapter<TFile> {
  constructor(private readonly plugin: Plugin) {}
  listMarkdown(): TFile[] {
    return this.plugin.app.vault.getMarkdownFiles();
  }
  read(file: TFile): Promise<string> {
    return this.plugin.app.vault.cachedRead(file);
  }
  readFresh(file: TFile): Promise<string> {
    return this.plugin.app.vault.read(file);
  }
  async write(file: TFile, source: string): Promise<void> {
    await this.plugin.app.vault.process(file, () => source);
  }
  get(path: string): TFile | null {
    const file = this.plugin.app.vault.getAbstractFileByPath(normalizePath(path));
    return file instanceof TFile ? file : null;
  }
  async create(path: string, source: string): Promise<TFile> {
    const normalized = normalizePath(path);
    const parent = normalized.split("/").slice(0, -1).join("/");
    if (parent && !this.plugin.app.vault.getAbstractFileByPath(parent))
      await this.plugin.app.vault.createFolder(parent);
    return this.plugin.app.vault.create(normalized, source);
  }
  onChange(callback: (file: TAbstractFile) => void): EventRef[] {
    return [
      this.plugin.app.vault.on("create", callback),
      this.plugin.app.vault.on("modify", callback),
      this.plugin.app.vault.on("delete", callback),
      this.plugin.app.vault.on("rename", callback),
    ];
  }
}
