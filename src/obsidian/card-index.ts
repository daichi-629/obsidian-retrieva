import type { EventRef, Plugin, TAbstractFile, TFile } from "obsidian";
import { debounce } from "obsidian";
import {
  hasCardTag,
  IDENTIFIERS,
  initializeCardMarkdown,
  collectScopeTags,
  isPathExcluded,
  parseCardMarkdown,
  parsePresetMarkdown,
  uuidv7,
  type CardError,
  type IndexedCard,
  type ParsedCard,
  type Preset,
} from "../core";
import { ObsidianFileAdapter } from "./file-adapter";

export class CardIndex {
  readonly cards = new Map<string, IndexedCard>();
  readonly parsed = new Map<string, ParsedCard>();
  readonly invalid = new Map<string, CardError[]>();
  readonly presets = new Map<string, Preset>();
  readonly presetDefinitionIds = new Set<string>();
  private refs: EventRef[] = [];
  private listeners = new Set<() => void>();
  private updateDebounced = debounce(
    (file: TAbstractFile) => {
      void this.updateFile(file);
    },
    150,
    true,
  );
  constructor(
    private readonly plugin: Plugin,
    readonly files: ObsidianFileAdapter,
    private readonly excludedDirectories: () => string[] = () => [],
  ) {}
  isExcluded(path: string): boolean {
    return isPathExcluded(path, this.excludedDirectories());
  }
  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  private emit(): void {
    this.listeners.forEach(listener => listener());
  }
  async start(): Promise<void> {
    await this.rebuild();
    this.refs = this.files.onChange(file => this.updateDebounced(file));
    this.refs.forEach(ref => this.plugin.registerEvent(ref));
  }
  async rebuild(): Promise<void> {
    this.cards.clear();
    this.parsed.clear();
    this.invalid.clear();
    this.presets.clear();
    this.presetDefinitionIds.clear();
    const files = this.files.listMarkdown().filter(file => !this.isExcluded(file.path));
    const contents = await Promise.all(
      files.map(async file => [file, await this.files.read(file)] as const),
    );
    for (let index = 0; index < contents.length; index++) {
      const [file, source] = contents[index]!;
      const initialized = await this.initializeIfNeeded(file, source);
      if (initialized !== source) contents[index] = [file, initialized];
    }
    const presetFiles = new Set<string>();
    const presetSources = new Map<string, string[]>();
    for (const [file, source] of contents) {
      const result = parsePresetMarkdown(file.path, source);
      if (!result.preset) {
        if (source.includes(IDENTIFIERS.presetDefinitionKey))
          this.invalid.set(file.path, result.errors);
        continue;
      }
      presetFiles.add(file.path);
      this.presetDefinitionIds.add(result.preset.id);
      presetSources.set(result.preset.id, [
        ...(presetSources.get(result.preset.id) ?? []),
        file.path,
      ]);
      if (!this.presets.has(result.preset.id)) this.presets.set(result.preset.id, result.preset);
    }
    for (const [id, paths] of presetSources)
      if (paths.length > 1) {
        this.presets.delete(id);
        for (const path of paths)
          this.invalid.set(path, [
            { code: "duplicate-preset", message: `Duplicate preset: ${id}` },
          ]);
      }
    for (const [file, source] of contents)
      if (!presetFiles.has(file.path)) this.parseOne(file, source);
    this.recomputeCards();
    this.emit();
  }
  private parseOne(file: TFile, source: string): void {
    const preset = parsePresetMarkdown(file.path, source);
    if (preset.preset) {
      if (this.presets.has(preset.preset.id))
        this.invalid.set(file.path, [
          { code: "duplicate-preset", message: `Duplicate preset: ${preset.preset.id}` },
        ]);
      else this.presets.set(preset.preset.id, preset.preset);
      return;
    }
    if (!hasCardTag(source)) return;
    const parsed = parseCardMarkdown(file.path, source);
    this.parsed.set(file.path, parsed);
  }
  private recomputeCards(): void {
    this.cards.clear();
    for (const path of this.parsed.keys()) this.invalid.delete(path);
    for (const parsed of this.parsed.values()) {
      const errors = [...parsed.errors];
      if (!parsed.presetId)
        errors.push({ code: "missing-preset-reference", message: "Preset reference is missing" });
      else if (!this.presets.has(parsed.presetId))
        errors.push({ code: "missing-preset", message: `Preset not found: ${parsed.presetId}` });
      if (errors.length || !parsed.cardId || !parsed.presetId || !parsed.events.length) {
        this.invalid.set(parsed.path, errors);
        continue;
      }
      const last = parsed.events.at(-1)!;
      this.cards.set(parsed.path, {
        path: parsed.path,
        cardId: parsed.cardId,
        presetId: parsed.presetId,
        siblingGroupId: parsed.siblingGroupId,
        tags: parsed.tags,
        state: last.state,
        lastEventId: last.eid,
        createdAt: parsed.events[0]!.at,
        events: parsed.events,
      });
    }
    const byId = new Map<string, IndexedCard[]>();
    for (const card of this.cards.values())
      byId.set(card.cardId, [...(byId.get(card.cardId) ?? []), card]);
    for (const [id, cards] of byId)
      if (cards.length > 1)
        for (const card of cards) {
          this.cards.delete(card.path);
          this.invalid.set(card.path, [
            { code: "duplicate-card-id", message: `Duplicate card ID: ${id}` },
          ]);
        }
  }
  private async updateFile(file: TAbstractFile): Promise<void> {
    for (const path of [...this.parsed.keys()])
      if (!this.files.get(path)) {
        this.parsed.delete(path);
        this.invalid.delete(path);
      }
    if (this.isExcluded(file.path)) {
      this.recomputeCards();
      this.emit();
      return;
    }
    const isExistingPreset = [...this.presets.values()].some(
      preset => preset.sourcePath === file.path,
    );
    const current = this.files.get(file.path);
    if (!current) {
      if (isExistingPreset) {
        await this.rebuild();
        return;
      }
      this.recomputeCards();
      this.emit();
      return;
    }
    if (current.extension === "md") {
      const source = await this.initializeIfNeeded(current, await this.files.read(current));
      if (isExistingPreset || parsePresetMarkdown(file.path, source).preset) {
        await this.rebuild();
        return;
      }
      this.parsed.delete(file.path);
      this.parseOne(current, source);
    }
    this.recomputeCards();
    this.emit();
  }
  async refresh(path: string): Promise<void> {
    const file = this.files.get(path);
    this.cards.delete(path);
    this.parsed.delete(path);
    this.invalid.delete(path);
    if (file && !this.isExcluded(file.path))
      this.parseOne(file, await this.initializeIfNeeded(file, await this.files.readFresh(file)));
    this.recomputeCards();
    this.emit();
  }
  cardsForTag(tag: string): IndexedCard[] {
    const clean = tag.replace(/^#/, "");
    return [...this.cards.values()].filter(card =>
      card.tags.some(value => value === clean || value.startsWith(`${clean}/`)),
    );
  }
  scopeTags(): string[] {
    return collectScopeTags(this.cards.values());
  }
  presetPaths(): string[] {
    return [...this.presets.values()].map(preset => preset.sourcePath);
  }
  private async initializeIfNeeded(file: TFile, source: string): Promise<string> {
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
