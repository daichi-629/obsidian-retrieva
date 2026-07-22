import { IDENTIFIERS } from "./identifiers";
import type { IndexedCard } from "./types";

export function collectScopeTags(cards: Iterable<IndexedCard>): string[] {
  const tags = new Set<string>();
  for (const card of cards)
    for (const tag of card.tags) {
      const clean = tag.replace(/^#/, "").trim();
      if (clean && clean !== IDENTIFIERS.cardTag) tags.add(clean);
    }
  return [...tags].sort((left, right) => left.localeCompare(right));
}
