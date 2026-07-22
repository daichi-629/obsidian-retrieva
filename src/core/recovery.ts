import type { CardEvent } from "./types";
import { parseEvent, validateLinearHistory } from "./validation";

export interface RecoveryRow {
  raw: string;
  event: CardEvent | null;
  error: string | null;
}
export function parseRecoveryRows(lines: string[]): RecoveryRow[] {
  return lines.map(raw => {
    try {
      const result = parseEvent(JSON.parse(raw));
      return { raw, event: result.event ?? null, error: result.error ?? null };
    } catch {
      return { raw, event: null, error: "Invalid JSON" };
    }
  });
}
export function sortAndRegenerateParents(events: CardEvent[]): CardEvent[] {
  const sorted = [...events].sort(
    (a, b) => Date.parse(a.at) - Date.parse(b.at) || a.eid.localeCompare(b.eid),
  );
  return sorted.map(
    (event, index) =>
      ({ ...event, parent: index === 0 ? null : sorted[index - 1]!.eid }) as CardEvent,
  );
}
export function validateRecovery(events: CardEvent[]): string[] {
  return validateLinearHistory(events).map(error => error.message);
}
