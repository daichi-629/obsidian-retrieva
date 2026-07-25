import type { EventRef, Plugin, TAbstractFile } from "obsidian";
import { debounce } from "obsidian";
import {
  isPathExcluded,
  type CardIndexLifecycle,
  type CardIndexReader,
  type CardFilter,
  type IndexedCard,
  type ParsedCard,
  type Preset,
  type PresetCatalog,
  type CardError,
} from "../core";
import { buildCardIndex } from "./card-index-model";
import { CardIndexSourceLoader } from "./card-index-source-loader";
import { CardIndexStore } from "./card-index-store";
import { ObsidianFileAdapter } from "./file-adapter";
import { PresetCatalogStore } from "./preset-catalog-store";

/** Coordinates Obsidian lifecycle events with the index's I/O-free model and read store. */
export class CardIndex implements CardIndexReader, CardIndexLifecycle, PresetCatalog {
  private readonly store = new CardIndexStore();
  private readonly presets = new PresetCatalogStore();
  private readonly loader: CardIndexSourceLoader;
  private refs: EventRef[] = [];
  private queued = Promise.resolve();
  private readonly updateDebounced = debounce(() => void this.rebuild(), 150, false);

  constructor(
    private readonly plugin: Plugin,
    private readonly files: ObsidianFileAdapter,
    private readonly excludedDirectories: () => string[] = () => [],
  ) {
    this.loader = new CardIndexSourceLoader(this.files, path => this.isExcluded(path));
  }

  isExcluded(path: string): boolean {
    return isPathExcluded(path, this.excludedDirectories());
  }
  onChange(listener: () => void): () => void {
    return this.store.onChange(listener);
  }
  async start(): Promise<void> {
    await this.rebuild();
    this.refs = this.files.onChange(this.onVaultChange);
    for (const ref of this.refs) this.plugin.registerEvent(ref);
  }
  rebuild(): Promise<void> {
    return this.enqueue(() => this.rebuildNow());
  }
  refresh(path: string): Promise<void> {
    return this.enqueue(() => this.rebuildNow(path));
  }
  deepValidate(): Promise<void> {
    return this.enqueue(() => this.rebuildNow(undefined, true));
  }

  private readonly onVaultChange = (_file: TAbstractFile): void => {
    this.updateDebounced();
  };
  private enqueue(operation: () => Promise<void>): Promise<void> {
    const next = this.queued.then(operation, operation);
    this.queued = next.catch(() => undefined);
    return next;
  }
  private async rebuildNow(freshPath?: string, deepValidation = false): Promise<void> {
    const sources = await this.loader.load(freshPath);
    const snapshot = buildCardIndex(sources, { deepValidation });
    this.presets.replace(snapshot.presets, snapshot.presetDefinitionIds);
    this.store.replace(snapshot);
  }

  getCard(path: string): IndexedCard | undefined {
    return this.store.getCard(path);
  }
  listCards(): IndexedCard[] {
    return this.store.listCards();
  }
  cardsMatching(filter: CardFilter): IndexedCard[] {
    return this.store.cardsMatching(filter);
  }
  scopeTags(): string[] {
    return this.store.scopeTags();
  }
  getParsed(path: string): ParsedCard | undefined {
    return this.store.getParsed(path);
  }
  hasParsed(path: string): boolean {
    return this.store.hasParsed(path);
  }
  getPreset(id: string) {
    return this.presets.getPreset(id);
  }
  presetEntries(): [string, Preset][] {
    return this.presets.presetEntries();
  }
  presetPaths(): string[] {
    return this.presets.presetPaths();
  }
  hasPresetDefinition(id: string): boolean {
    return this.presets.hasPresetDefinition(id);
  }
  invalidPaths(): string[] {
    return this.store.invalidPaths();
  }
  invalidErrors(path: string): CardError[] {
    return this.store.invalidErrors(path);
  }
}
