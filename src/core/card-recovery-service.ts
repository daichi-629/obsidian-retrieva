import { offsetDateTime } from "./date";
import { IDENTIFIERS, MARKERS } from "./identifiers";
import { uuidv7 } from "./id";
import { parseCardMarkdown } from "./card-parser";
import type { CardIndexLifecycle, CardIndexReader, FileAdapter, PresetCatalog } from "./ports";
import type { CardEvent } from "./types";
import { NEW_STATE } from "./types";
import { CardWriteLock } from "./card-write-lock";

export type SaveDraftResult = "saved" | "still-invalid" | "missing-markers" | "not-found";

/** Repairs card metadata and raw event logs without exposing write primitives to the UI. */
export class CardRecoveryService {
  constructor(
    private readonly files: FileAdapter,
    private readonly index: CardIndexReader & PresetCatalog,
    private readonly lifecycle: CardIndexLifecycle,
    private readonly lock: CardWriteLock,
  ) {}

  async repairMetadata(path: string, reissueCardId: boolean): Promise<void> {
    await this.lock.run(path, async () => {
      const file = this.files.get(path);
      if (!file) throw new Error("Card file no longer exists");
      let source = await this.files.readFresh(file);
      let parsed = parseCardMarkdown(path, source);
      const now = new Date();

      if (!parsed.presetId || !this.index.getPreset(parsed.presetId)) {
        const availablePreset = this.index.getPreset("default")
          ? "default"
          : this.index.presetEntries()[0]?.[0];
        if (availablePreset) {
          if (source.includes(`${IDENTIFIERS.presetKey}:`))
            source = source.replace(
              new RegExp(`${IDENTIFIERS.presetKey}:.*`),
              `${IDENTIFIERS.presetKey}: ${availablePreset}`,
            );
          else if (/^---\r?\n/.test(source))
            source = source.replace(
              /^(---\r?\n)/,
              `$1${IDENTIFIERS.presetKey}: ${availablePreset}\n`,
            );
          else
            source = `---\n${IDENTIFIERS.presetKey}: ${availablePreset}\ntags: [${IDENTIFIERS.cardTag}]\n---\n${source}`;
          parsed = parseCardMarkdown(path, source);
        }
      }
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
            const start = source.indexOf(prefix);
            const end = source.indexOf("-->", start);
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
        const created: CardEvent = {
          v: 1,
          eid: uuidv7(now.getTime() + 1),
          type: "created",
          parent: null,
          at: offsetDateTime(now),
          zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          state: { ...NEW_STATE },
        };
        const events = [created, ...parsed.events].map((event, index, all) => ({
          ...event,
          parent: index === 0 ? null : all[index - 1]!.eid,
        }));
        const log = `${MARKERS.logStart}${parsed.newline}${events.map(event => JSON.stringify(event)).join(parsed.newline)}${parsed.newline}${MARKERS.logEnd}`;
        source = parsed.ranges.log
          ? source.slice(0, parsed.ranges.log[0]) + log + source.slice(parsed.ranges.log[1])
          : `${source}${source.endsWith(parsed.newline) ? "" : parsed.newline}${parsed.newline}${log}${parsed.newline}`;
      }
      await this.files.write(file, source);
      await this.lifecycle.refresh(path);
    });
  }

  async loadRawLog(path: string): Promise<string | null> {
    const file = this.files.get(path);
    if (!file) return null;
    return parseCardMarkdown(path, await this.files.readFresh(file)).rawEventLines.join("\n");
  }

  async saveRawLog(path: string, events: CardEvent[]): Promise<SaveDraftResult> {
    return this.lock.run(path, async () => {
      const file = this.files.get(path);
      if (!file) return "not-found";
      const source = await this.files.readFresh(file);
      const parsed = parseCardMarkdown(path, source);
      const start = source.indexOf(MARKERS.logStart);
      const end = source.indexOf(MARKERS.logEnd, start + MARKERS.logStart.length);
      if (start < 0 || end < 0) return "missing-markers";
      const replacement = `${MARKERS.logStart}${parsed.newline}${events.map(event => JSON.stringify(event)).join(parsed.newline)}${parsed.newline}`;
      await this.files.write(file, source.slice(0, start) + replacement + source.slice(end));
      await this.lifecycle.refresh(path);
      return this.index.invalidErrors(path).length > 0 ? "still-invalid" : "saved";
    });
  }
}
