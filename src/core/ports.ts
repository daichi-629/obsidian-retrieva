import type { CardError, IndexedCard, ParsedCard, Preset } from "./types";

export interface FileAdapter<FileRef = unknown> {
  listMarkdown(): FileRef[] | Promise<FileRef[]>;
  get(path: string): FileRef | null;
  read(file: FileRef): Promise<string>;
  readFresh(file: FileRef): Promise<string>;
  write(file: FileRef, source: string): Promise<void>;
  create(path: string, source: string): Promise<FileRef>;
}

export interface Cache {
  onChange(listener: () => void): () => void;
  getCard(path: string): IndexedCard | undefined;
  listCards(): IndexedCard[];
  cardsForTag(tag: string): IndexedCard[];
  scopeTags(): string[];
  getParsed(path: string): ParsedCard | undefined;
  hasParsed(path: string): boolean;
  getPreset(id: string): Preset | undefined;
  presetEntries(): [string, Preset][];
  presetPaths(): string[];
  hasPresetDefinition(id: string): boolean;
  invalidPaths(): string[];
  invalidErrors(path: string): CardError[];
  isExcluded(path: string): boolean;
  start(): Promise<void>;
  refresh(path: string): Promise<void>;
  rebuild(): Promise<void>;
  deepValidate(): Promise<void>;
}
