import { dueNow, eventOccurredToday } from "./date";
import type { IndexedCard, Preset, QueueResult } from "./types";

const priorityMap: Record<string, number> = { learning: 0, relearning: 1, review: 2, new: 3 };
const priority = (card: IndexedCard): number => priorityMap[card.state.phase] ?? 3;
const dueKey = (card: IndexedCard): string =>
  card.state.due?.kind === "instant"
    ? card.state.due.at
    : card.state.due?.kind === "day"
      ? card.state.due.date
      : card.createdAt;

export function buildQueue(
  cards: IndexedCard[],
  presets:
    | Map<string, Preset>
    | { getPreset?(id: string): Preset | undefined; get?(id: string): Preset | undefined },
  now: Date,
): QueueResult {
  const reviewedGroups = new Set<string>();
  const reviewedToday = new Set<string>();
  for (const card of cards) {
    if (!card.siblingGroupId) continue;
    for (const event of card.events) {
      if (event.type !== "review" || !eventOccurredToday(event.at, now)) continue;
      reviewedGroups.add(card.siblingGroupId);
      reviewedToday.add(card.cardId);
    }
  }
  const ready: IndexedCard[] = [],
    future: IndexedCard[] = [],
    suspended: IndexedCard[] = [],
    siblingExcluded: IndexedCard[] = [];
  for (const card of cards) {
    if (card.state.suspended) {
      suspended.push(card);
      continue;
    }
    const preset =
      typeof (presets as any).getPreset === "function"
        ? (presets as any).getPreset(card.presetId)
        : (presets as any).get(card.presetId);
    const groupReviewed = card.siblingGroupId ? reviewedGroups.has(card.siblingGroupId) : false;
    const exclude =
      !reviewedToday.has(card.cardId) &&
      groupReviewed &&
      (card.state.phase === "new"
        ? (preset?.excludeNewSiblingsToday ?? true)
        : (preset?.excludeReviewSiblingsToday ?? true));
    if (exclude) {
      siblingExcluded.push(card);
      continue;
    }
    (dueNow(card.state.due, now) ? ready : future).push(card);
  }
  ready.sort(
    (a, b) =>
      priority(a) - priority(b) ||
      dueKey(a).localeCompare(dueKey(b)) ||
      a.cardId.localeCompare(b.cardId),
  );
  future.sort((a, b) => dueKey(a).localeCompare(dueKey(b)) || a.cardId.localeCompare(b.cardId));

  const filteredReady: IndexedCard[] = [];
  const seenGroupsInReady = new Set<string>();

  for (const card of ready) {
    if (card.siblingGroupId) {
      const preset =
        typeof (presets as any).getPreset === "function"
          ? (presets as any).getPreset(card.presetId)
          : (presets as any).get(card.presetId);
      const exclude =
        card.state.phase === "new"
          ? (preset?.excludeNewSiblingsToday ?? true)
          : (preset?.excludeReviewSiblingsToday ?? true);
      if (exclude && seenGroupsInReady.has(card.siblingGroupId)) {
        siblingExcluded.push(card);
        continue;
      }
      seenGroupsInReady.add(card.siblingGroupId);
    }
    filteredReady.push(card);
  }

  return {
    ready: filteredReady,
    future,
    suspended,
    siblingExcluded,
    totalValid: cards.length,
    nextDue: future[0]?.state.due ?? null,
  };
}
