import { initializeCardMarkdown, uuidv7, type FileAdapter } from "../core";
import type { CardIndexSource } from "./card-index-model";

type FileWithPath = { path: string };

/** Loads indexable Markdown and performs the narrowly-scoped draft initialization write. */
export class CardIndexSourceLoader<FileRef extends FileWithPath = FileWithPath> {
  constructor(
    private readonly files: FileAdapter<FileRef>,
    private readonly isExcluded: (path: string) => boolean,
  ) {}

  async load(freshPath?: string): Promise<CardIndexSource[]> {
    const files = (await this.files.listMarkdown()).filter(file => !this.isExcluded(file.path));
    return Promise.all(files.map(file => this.loadFile(file, file.path === freshPath)));
  }

  private async loadFile(file: FileRef, fresh: boolean): Promise<CardIndexSource> {
    const source = await (fresh ? this.files.readFresh(file) : this.files.read(file));
    return { path: file.path, source: await this.initializeIfNeeded(file, source) };
  }

  private async initializeIfNeeded(file: FileRef, source: string): Promise<string> {
    const now = new Date();
    const initialized = initializeCardMarkdown(source, {
      cardId: uuidv7(now.getTime()),
      eventId: uuidv7(now.getTime() + 1),
      now,
      zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
    if (initialized === null) return source;
    await this.files.write(file, initialized);
    return initialized;
  }
}
