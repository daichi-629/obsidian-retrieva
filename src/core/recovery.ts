import type { CardEvent } from "./types";

export function sortAndRegenerateParents(events: CardEvent[]): CardEvent[] {
  const sorted = [...events].sort(
    (a, b) => Date.parse(a.at) - Date.parse(b.at) || a.eid.localeCompare(b.eid),
  );
  return sorted.map((event, index) => ({
    ...event,
    parent: index === 0 ? null : sorted[index - 1]!.eid,
  }));
}
