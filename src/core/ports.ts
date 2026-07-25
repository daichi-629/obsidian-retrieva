import type { CardFilter } from "./card-filter";
import type { CardError, IndexedCard, ParsedCard, Preset } from "./types";

export interface FileAdapter<FileRef = unknown> {
  listMarkdown(): FileRef[] | Promise<FileRef[]>;
  get(path: string): FileRef | null;
  read(file: FileRef): Promise<string>;
  readFresh(file: FileRef): Promise<string>;
  write(file: FileRef, source: string): Promise<void>;
  create(path: string, source: string): Promise<FileRef>;
}

/** Read model consumed by views and card use-cases. */
export interface CardIndexReader {
  onChange(listener: () => void): () => void;
  getCard(path: string): IndexedCard | undefined;
  listCards(): IndexedCard[];
  cardsMatching(filter: CardFilter): IndexedCard[];
  scopeTags(): string[];
  getParsed(path: string): ParsedCard | undefined;
  hasParsed(path: string): boolean;
  invalidPaths(): string[];
  invalidErrors(path: string): CardError[];
  isExcluded(path: string): boolean;
}

/** Valid preset definitions available to card operations and settings UI. */
export interface PresetCatalog {
  getPreset(id: string): Preset | undefined;
  presetEntries(): [string, Preset][];
  presetPaths(): string[];
  hasPresetDefinition(id: string): boolean;
}

/** Commands that synchronize the read model with the vault. */
export interface CardIndexLifecycle {
  start(): Promise<void>;
  refresh(path: string): Promise<void>;
  rebuild(): Promise<void>;
  deepValidate(): Promise<void>;
}
