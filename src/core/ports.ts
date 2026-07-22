import type { IndexedCard, ParsedCard, Preset, QueueResult } from "./types";

export interface FileAdapter<FileRef = unknown> {
  listMarkdown(): FileRef[] | Promise<FileRef[]>;
  read(file: FileRef): Promise<string>;
  write(file: FileRef, source: string): Promise<void>;
}

export interface CardRenderer<Output = unknown> {
  render(card: ParsedCard, side: "front" | "back"): Output | Promise<Output>;
}

export interface QueueFilter {
  filter(cards: IndexedCard[], presets: Map<string, Preset>, now: Date): QueueResult;
}
