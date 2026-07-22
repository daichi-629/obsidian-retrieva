import {
  appendEvent,
  calculateAnswerCandidates,
  createReviewEvent,
  createStateEvent,
  IDENTIFIERS,
  MARKERS,
  NEW_STATE,
  offsetDateTime,
  parseCardMarkdown,
  parsePresetMarkdown,
  undoLastReview,
  uuidv7,
  type CardEvent,
  type Rating,
} from "../core";
import { CardIndex } from "./card-index";

export type WriteResult =
  { status: "written"; eventId: string; sourceAfter: string } | { status: "stale"; reason: string };
export class CardRepository {
  private readonly writing = new Set<string>();
  constructor(private readonly index: CardIndex) {}
  private async locked<T>(path: string, operation: () => Promise<T>): Promise<T> {
    if (this.writing.has(path)) throw new Error("This card is already being updated");
    this.writing.add(path);
    try {
      return await operation();
    } finally {
      this.writing.delete(path);
    }
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
      const file = this.index.files.get(path);
      if (!file) return { status: "stale", reason: "Card file no longer exists" };
      const source = await this.index.files.readFresh(file);
      const parsed = parseCardMarkdown(path, source);
      const last = parsed.events.at(-1);
      if (parsed.errors.length || !last || last.eid !== expectedEventId || !parsed.presetId)
        return { status: "stale", reason: "Card history changed" };
      const preset = this.index.presets.get(parsed.presetId);
      if (!preset) return { status: "stale", reason: "Preset is unavailable" };
      const presetFile = this.index.files.get(preset.sourcePath);
      if (!presetFile) return { status: "stale", reason: "Preset file no longer exists" };
      const freshPreset = parsePresetMarkdown(
        preset.sourcePath,
        await this.index.files.readFresh(presetFile),
      ).preset;
      if (!freshPreset || freshPreset.fingerprint !== expectedPresetFingerprint)
        return { status: "stale", reason: "Preset changed; answer choices were refreshed" };
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
      await this.index.files.write(file, sourceAfter);
      const verified = parseCardMarkdown(path, await this.index.files.readFresh(file));
      if (verified.events.at(-1)?.eid !== eventId || verified.errors.length)
        throw new Error("Review write verification failed");
      await this.index.refresh(path);
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
      const file = this.index.files.get(path);
      if (!file) return { status: "stale", reason: "Card file no longer exists" };
      const source = await this.index.files.readFresh(file);
      const parsed = parseCardMarkdown(path, source);
      const last = parsed.events.at(-1);
      if (parsed.errors.length || !last || last.eid !== expectedEventId)
        return { status: "stale", reason: "Card history changed" };
      const eventId = uuidv7(now.getTime());
      const event = createStateEvent(type, last.state, last.eid, { now, zone, eventId });
      const sourceAfter = appendEvent(source, parsed, event);
      await this.index.files.write(file, sourceAfter);
      await this.index.refresh(path);
      return { status: "written", eventId, sourceAfter };
    });
  }
  async undo(path: string, eventId: string, exactSourceAfter: string): Promise<boolean> {
    return this.locked(path, async () => {
      const file = this.index.files.get(path);
      if (!file) return false;
      const source = await this.index.files.readFresh(file);
      if (source !== exactSourceAfter) return false;
      const parsed = parseCardMarkdown(path, source);
      const before = undoLastReview(source, parsed, eventId);
      await this.index.files.write(file, before);
      await this.index.refresh(path);
      return true;
    });
  }
  async repairMetadata(path: string, reissueCardId: boolean): Promise<void> {
    await this.locked(path, async () => {
      const file = this.index.files.get(path);
      if (!file) throw new Error("Card file no longer exists");
      let source = await this.index.files.readFresh(file);
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
        const events = ordered.map(
          (event, index) =>
            ({ ...event, parent: index === 0 ? null : ordered[index - 1]!.eid }) as CardEvent,
        );
        const log = `${MARKERS.logStart}${parsed.newline}${events.map(event => JSON.stringify(event)).join(parsed.newline)}${parsed.newline}${MARKERS.logEnd}`;
        if (parsed.ranges.log)
          source = source.slice(0, parsed.ranges.log[0]) + log + source.slice(parsed.ranges.log[1]);
        else
          source = `${source}${source.endsWith(parsed.newline) ? "" : parsed.newline}${parsed.newline}${log}${parsed.newline}`;
      }
      await this.index.files.write(file, source);
      await this.index.refresh(path);
    });
  }
}
