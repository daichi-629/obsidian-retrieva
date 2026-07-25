import { appendEvent, createReviewEvent, createStateEvent, undoLastReview } from "./events";
import { parseCardMarkdown } from "./card-parser";
import { parsePresetMarkdown } from "./preset";
import { calculateAnswerCandidates } from "./scheduler";
import type { CardIndexLifecycle, FileAdapter, PresetCatalog } from "./ports";
import type { Rating } from "./types";
import { uuidv7 } from "./id";
import { CardWriteLock } from "./card-write-lock";

export type WriteResult =
  { status: "written"; eventId: string; sourceAfter: string } | { status: "stale"; reason: string };

/** Applies normal review and state-transition writes to valid cards. */
export class CardService {
  constructor(
    private readonly files: FileAdapter,
    private readonly lifecycle: CardIndexLifecycle,
    private readonly presets: PresetCatalog,
    private readonly lock: CardWriteLock,
  ) {}

  async review(
    path: string,
    expectedEventId: string,
    expectedPresetFingerprint: string,
    rating: Rating,
    durationMs: number,
    now: Date,
    zone: string,
  ): Promise<WriteResult> {
    return this.lock.run(path, async () => {
      const file = this.files.get(path);
      if (!file) {
        await this.lifecycle.refresh(path);
        return { status: "stale", reason: "Card file no longer exists" };
      }
      const source = await this.files.readFresh(file);
      const parsed = parseCardMarkdown(path, source);
      const last = parsed.events.at(-1);
      if (parsed.errors.length || !last || last.eid !== expectedEventId || !parsed.presetId) {
        await this.lifecycle.refresh(path);
        return { status: "stale", reason: "Card history changed" };
      }
      const preset = this.presets.getPreset(parsed.presetId);
      if (!preset) {
        await this.lifecycle.rebuild();
        return { status: "stale", reason: "Preset is unavailable" };
      }
      const presetFile = this.files.get(preset.sourcePath);
      if (!presetFile) {
        await this.lifecycle.rebuild();
        return { status: "stale", reason: "Preset file no longer exists" };
      }
      const freshPreset = parsePresetMarkdown(
        preset.sourcePath,
        await this.files.readFresh(presetFile),
      ).preset;
      if (!freshPreset || freshPreset.fingerprint !== expectedPresetFingerprint) {
        await this.lifecycle.rebuild();
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
      await this.lifecycle.refresh(path);
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
    return this.lock.run(path, async () => {
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
      await this.lifecycle.refresh(path);
      return { status: "written", eventId, sourceAfter };
    });
  }
  async undo(path: string, eventId: string, exactSourceAfter: string): Promise<boolean> {
    return this.lock.run(path, async () => {
      const file = this.files.get(path);
      if (!file) return false;
      const source = await this.files.readFresh(file);
      if (source !== exactSourceAfter) return false;
      const parsed = parseCardMarkdown(path, source);
      const before = undoLastReview(source, parsed, eventId);
      await this.files.write(file, before);
      await this.lifecycle.refresh(path);
      return true;
    });
  }
}
