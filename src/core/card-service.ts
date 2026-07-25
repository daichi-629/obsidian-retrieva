import { appendEvent, createReviewEvent, createStateEvent, undoLastReview } from "./events";
import { IDENTIFIERS, MARKERS } from "./identifiers";
import { parseCardMarkdown } from "./card-parser";
import { parsePresetMarkdown } from "./preset";
import { renderCardTemplate } from "./card-template";
import { calculateAnswerCandidates } from "./scheduler";
import { offsetDateTime } from "./date";
import type { Cache, FileAdapter } from "./ports";
import { NEW_STATE, type CardEvent, type Rating } from "./types";
import { uuidv7 } from "./id";

export type WriteResult =
  { status: "written"; eventId: string; sourceAfter: string } | { status: "stale"; reason: string };

export type SaveDraftResult = "saved" | "still-invalid" | "missing-markers" | "not-found";

export class CardService {
  private readonly writing = new Set<string>();
  constructor(
    private readonly files: FileAdapter,
    private readonly cache: Cache,
  ) {}
  private async locked<T>(path: string, operation: () => Promise<T>): Promise<T> {
    if (this.writing.has(path)) throw new Error("This card is already being updated");
    this.writing.add(path);
    try {
      return await operation();
    } finally {
      this.writing.delete(path);
    }
  }

  onChange(listener: () => void) {
    return this.cache.onChange(listener);
  }
  getCard(path: string) {
    return this.cache.getCard(path);
  }
  listCards() {
    return this.cache.listCards();
  }
  cardsForTag(tag: string) {
    return this.cache.cardsForTag(tag);
  }
  scopeTags() {
    return this.cache.scopeTags();
  }
  getParsed(path: string) {
    return this.cache.getParsed(path);
  }
  hasParsed(path: string) {
    return this.cache.hasParsed(path);
  }
  getPreset(id: string) {
    return this.cache.getPreset(id);
  }
  presetEntries() {
    return this.cache.presetEntries();
  }
  presetPaths() {
    return this.cache.presetPaths();
  }
  hasPresetDefinition(id: string) {
    return this.cache.hasPresetDefinition(id);
  }
  invalidPaths() {
    return this.cache.invalidPaths();
  }
  invalidErrors(path: string) {
    return this.cache.invalidErrors(path);
  }
  isExcluded(path: string) {
    return this.cache.isExcluded(path);
  }
  start() {
    return this.cache.start();
  }
  rebuild() {
    return this.cache.rebuild();
  }
  async validateVault(): Promise<void> {
    await this.cache.rebuild();
    await this.cache.deepValidate();
  }

  async review(
    path: string,
    expectedEventId: string,
    expectedPresetFingerprint: string,
    rating: Rating,
    durationMs: number,
    now: Date,
    zone: string,
  ): Promise<WriteResult> {
    return this.locked(path, async () => {
      const file = this.files.get(path);
      if (!file) {
        await this.cache.refresh(path);
        return { status: "stale", reason: "Card file no longer exists" };
      }
      const source = await this.files.readFresh(file);
      const parsed = parseCardMarkdown(path, source);
      const last = parsed.events.at(-1);
      if (parsed.errors.length || !last || last.eid !== expectedEventId || !parsed.presetId) {
        await this.cache.refresh(path);
        return { status: "stale", reason: "Card history changed" };
      }
      const preset = this.cache.getPreset(parsed.presetId);
      if (!preset) {
        await this.cache.rebuild();
        return { status: "stale", reason: "Preset is unavailable" };
      }
      const presetFile = this.files.get(preset.sourcePath);
      if (!presetFile) {
        await this.cache.rebuild();
        return { status: "stale", reason: "Preset file no longer exists" };
      }
      const freshPreset = parsePresetMarkdown(
        preset.sourcePath,
        await this.files.readFresh(presetFile),
      ).preset;
      if (!freshPreset || freshPreset.fingerprint !== expectedPresetFingerprint) {
        await this.cache.rebuild();
        return { status: "stale", reason: "Preset changed; answer choices were refreshed" };
      }
      const candidates = calculateAnswerCandidates(last.state, freshPreset, now, last.at);
      const eventId = uuidv7(now.getTime());
      const event = createReviewEvent({
        cardState: last.state,
        nextState: candidates[rating],
        rating,
        parent: last.eid,
        durationMs,
        now,
        zone,
        eventId,
      });
      const sourceAfter = appendEvent(source, parsed, event);
      await this.files.write(file, sourceAfter);
      const verified = parseCardMarkdown(path, await this.files.readFresh(file));
      if (verified.events.at(-1)?.eid !== eventId || verified.errors.length)
        throw new Error("Review write verification failed");
      await this.cache.refresh(path);
      return { status: "written", eventId, sourceAfter };
    });
  }
  async stateChange(
    path: string,
    expectedEventId: string,
    type: "suspend" | "resume" | "reset",
    now: Date,
    zone: string,
  ): Promise<WriteResult> {
    return this.locked(path, async () => {
      const file = this.files.get(path);
      if (!file) return { status: "stale", reason: "Card file no longer exists" };
      const source = await this.files.readFresh(file);
      const parsed = parseCardMarkdown(path, source);
      const last = parsed.events.at(-1);
      if (parsed.errors.length || !last || last.eid !== expectedEventId)
        return { status: "stale", reason: "Card history changed" };
      const eventId = uuidv7(now.getTime());
      const event = createStateEvent(type, last.state, last.eid, { now, zone, eventId });
      const sourceAfter = appendEvent(source, parsed, event);
      await this.files.write(file, sourceAfter);
      await this.cache.refresh(path);
      return { status: "written", eventId, sourceAfter };
    });
  }
  async undo(path: string, eventId: string, exactSourceAfter: string): Promise<boolean> {
    return this.locked(path, async () => {
      const file = this.files.get(path);
      if (!file) return false;
      const source = await this.files.readFresh(file);
      if (source !== exactSourceAfter) return false;
      const parsed = parseCardMarkdown(path, source);
      const before = undoLastReview(source, parsed, eventId);
      await this.files.write(file, before);
      await this.cache.refresh(path);
      return true;
    });
  }
  async repairMetadata(path: string, reissueCardId: boolean): Promise<void> {
    await this.locked(path, async () => {
      const file = this.files.get(path);
      if (!file) throw new Error("Card file no longer exists");
      let source = await this.files.readFresh(file);
      let parsed = parseCardMarkdown(path, source);
      const now = new Date();
      if (reissueCardId || !parsed.cardId) {
        const marker = `${MARKERS.cardPrefix}${JSON.stringify({ v: 1, id: uuidv7(now.getTime()) })}-->`;
        if (parsed.ranges.card)
          source =
            source.slice(0, parsed.ranges.card[0]) + marker + source.slice(parsed.ranges.card[1]);
        else {
          const prefix = `<!--${IDENTIFIERS.cardMarker}`;
          const positions = source.split(prefix).length - 1;
          if (positions > 1)
            throw new Error("Multiple card markers must be resolved in the editor first");
          if (positions === 1) {
            const start = source.indexOf(prefix),
              end = source.indexOf("-->", start);
            if (end < 0) throw new Error("Unclosed card marker must be fixed in the editor");
            source = source.slice(0, start) + marker + source.slice(end + 3);
          } else {
            const insert = source.indexOf(MARKERS.logStart);
            source =
              source.slice(0, insert >= 0 ? insert : source.length) +
              `${marker}${parsed.newline}${parsed.newline}` +
              source.slice(insert >= 0 ? insert : source.length);
          }
        }
        parsed = parseCardMarkdown(path, source);
      }
      if (!parsed.events.some(event => event.type === "created")) {
        if (
          parsed.errors.some(
            error =>
              error.code === "invalid-json" ||
              error.code === "event-schema" ||
              error.code === "log-marker-count",
          )
        )
          throw new Error(
            "Fix malformed JSONL or duplicate log markers before generating a created event",
          );
        const created: CardEvent = {
          v: 1,
          eid: uuidv7(now.getTime() + 1),
          type: "created",
          parent: null,
          at: offsetDateTime(now),
          zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          state: { ...NEW_STATE },
        };
        const ordered = [created, ...parsed.events];
        const events = ordered.map((event, index) => ({
          ...event,
          parent: index === 0 ? null : ordered[index - 1]!.eid,
        }));
        const log = `${MARKERS.logStart}${parsed.newline}${events.map(event => JSON.stringify(event)).join(parsed.newline)}${parsed.newline}${MARKERS.logEnd}`;
        if (parsed.ranges.log)
          source = source.slice(0, parsed.ranges.log[0]) + log + source.slice(parsed.ranges.log[1]);
        else
          source = `${source}${source.endsWith(parsed.newline) ? "" : parsed.newline}${parsed.newline}${log}${parsed.newline}`;
      }
      await this.files.write(file, source);
      await this.cache.refresh(path);
    });
  }

  async createCards(input: {
    front: string;
    back: string;
    filename: string;
    presetId: string;
    folder: string;
    pair: boolean;
  }): Promise<
    { status: "exists" } | { status: "created"; paths: string[]; reverseError?: string }
  > {
    const safe = input.filename.replace(/[\\/:*?"<>|]/g, "-");
    const names = input.pair ? [`${safe} (Front).md`, `${safe} (Back).md`] : [`${safe}.md`];
    const full = names.map(name => (input.folder ? `${input.folder}/${name}` : name));
    if (full.some(path => this.files.get(path))) return { status: "exists" };
    const now = new Date();
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const group = input.pair ? uuidv7(now.getTime()) : undefined;
    const first = renderCardTemplate({
      front: input.front,
      back: input.back,
      presetId: input.presetId,
      cardId: uuidv7(now.getTime()),
      eventId: uuidv7(now.getTime() + 1),
      now,
      zone,
      siblingGroupId: group,
    });
    await this.files.create(full[0]!, first);
    const paths = [full[0]!];
    let reverseError: string | undefined;
    if (input.pair)
      try {
        await this.files.create(
          full[1]!,
          renderCardTemplate({
            front: input.back,
            back: input.front,
            presetId: input.presetId,
            cardId: uuidv7(now.getTime() + 2),
            eventId: uuidv7(now.getTime() + 3),
            now: new Date(now.getTime() + 1),
            zone,
            siblingGroupId: group,
          }),
        );
        paths.push(full[1]!);
      } catch (error) {
        reverseError = String(error);
      }
    for (const path of paths) await this.cache.refresh(path);
    return { status: "created", paths, reverseError };
  }

  async loadRawLog(path: string): Promise<string | null> {
    const file = this.files.get(path);
    if (!file) return null;
    const parsed = parseCardMarkdown(path, await this.files.readFresh(file));
    return parsed.rawEventLines.join("\n");
  }
  async saveRawLog(path: string, events: CardEvent[]): Promise<SaveDraftResult> {
    return this.locked(path, async () => {
      const file = this.files.get(path);
      if (!file) return "not-found";
      const source = await this.files.readFresh(file);
      const parsed = parseCardMarkdown(path, source);
      const start = source.indexOf(MARKERS.logStart);
      const end = source.indexOf(MARKERS.logEnd, start + MARKERS.logStart.length);
      if (start < 0 || end < 0) return "missing-markers";
      const replacement = `${MARKERS.logStart}${parsed.newline}${events.map(event => JSON.stringify(event)).join(parsed.newline)}${parsed.newline}`;
      const repaired = source.slice(0, start) + replacement + source.slice(end);
      await this.files.write(file, repaired);
      await this.cache.refresh(path);
      return this.cache.invalidErrors(path).length > 0 ? "still-invalid" : "saved";
    });
  }
}
