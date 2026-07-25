import { dueNow, eventOccurredToday } from "./date";
import type { IndexedCard, Preset, QueueResult } from "./types";

const priority = (card: IndexedCard): number =>
  ({ learning: 0, relearning: 1, review: 2, new: 3 })[card.state.phase];
const dueKey = (card: IndexedCard): string =>
  card.state.due?.kind === "instant"
    ? card.state.due.at
    : card.state.due?.kind === "day"
      ? card.state.due.date
      : card.createdAt;

export function buildQueue(
  cards: IndexedCard[],
  presets: Map<string, Preset>,
  now: Date,
): QueueResult {
  const reviewedGroups = new Set<string>();
  const reviewedToday = new Set<string>();
  for (const card of cards) {
    if (!card.siblingGroupId) continue;
    for (const event of card.events) {
      const reviewed =
        event.type === "review"
          ? eventOccurredToday(event.at, now)
          : event.type === "checkpoint"
            ? event.reviews.some(([at]) => eventOccurredToday(at, now))
            : false;
      if (reviewed) {
        reviewedGroups.add(card.siblingGroupId);
        reviewedToday.add(card.cardId);
      }
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
    const preset = presets.get(card.presetId);
    const groupReviewed = card.siblingGroupId ? reviewedGroups.has(card.siblingGroupId) : false;
    const exclude =
      !reviewedToday.has(card.cardId) &&
      groupReviewed &&
      (card.state.phase === "new"
        ? preset?.excludeNewSiblingsToday
        : preset?.excludeReviewSiblingsToday);
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
  return {
    ready,
    future,
    suspended,
    siblingExcluded,
    totalValid: cards.length,
    nextDue: future[0]?.state.due ?? null,
  };
}
