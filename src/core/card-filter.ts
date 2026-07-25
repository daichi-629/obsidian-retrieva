import type { IndexedCard } from "./types";

export type CardFilter = { kind: "tag"; tag: string } & ((card: IndexedCard) => boolean);

export function tagFilter(tag: string): CardFilter {
  const fn = (card: IndexedCard) => matchesFilter(card, { kind: "tag", tag } as any);
  return Object.assign(fn, { kind: "tag" as const, tag });
}

export function matchesFilter(card: IndexedCard, filter: CardFilter): boolean {
  switch (filter.kind) {
    case "tag": {
      const clean = filter.tag.replace(/^#/, "").trim().toLowerCase();
      if (!clean) return true;
      return card.tags.some(
        value => value.toLowerCase() === clean || value.toLowerCase().startsWith(`${clean}/`),
      );
    }
  }
}

export function cardsMatching(cards: Iterable<IndexedCard>, filter: CardFilter): IndexedCard[] {
  return [...cards].filter(card => matchesFilter(card, filter));
}
