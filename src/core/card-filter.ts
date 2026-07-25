import type { IndexedCard } from "./types";

export type CardFilter = { kind: "tag"; tag: string };

export function tagFilter(tag: string): CardFilter {
  return { kind: "tag", tag };
}

export function matchesFilter(card: IndexedCard, filter: CardFilter): boolean {
  switch (filter.kind) {
    case "tag": {
      const clean = filter.tag.replace(/^#/, "");
      if (!clean) return true;
      return card.tags.some(value => value === clean || value.startsWith(`${clean}/`));
    }
  }
}

export function cardsMatching(cards: Iterable<IndexedCard>, filter: CardFilter): IndexedCard[] {
  return [...cards].filter(card => matchesFilter(card, filter));
}
