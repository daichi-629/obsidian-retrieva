import {
  cardsMatching,
  collectScopeTags,
  type CardError,
  type CardFilter,
  type IndexedCard,
  type ParsedCard,
} from "../core";
import type { CardIndexSnapshot } from "./card-index-model";

type CardIndexReadState = Pick<CardIndexSnapshot, "cards" | "parsed" | "invalid">;

/** Owns index state and all read-side query operations. */
export class CardIndexStore {
  private snapshot: CardIndexReadState = {
    cards: new Map(),
    parsed: new Map(),
    invalid: new Map(),
  };
  private readonly listeners = new Set<() => void>();

  replace(snapshot: CardIndexReadState): void {
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener();
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  getCard(path: string): IndexedCard | undefined {
    return this.snapshot.cards.get(path);
  }
  listCards(): IndexedCard[] {
    return [...this.snapshot.cards.values()];
  }
  cardsMatching(filter: CardFilter): IndexedCard[] {
    return cardsMatching(this.snapshot.cards.values(), filter);
  }
  scopeTags(): string[] {
    return collectScopeTags(this.snapshot.cards.values());
  }
  getParsed(path: string): ParsedCard | undefined {
    return this.snapshot.parsed.get(path);
  }
  hasParsed(path: string): boolean {
    return this.snapshot.parsed.has(path);
  }
  invalidPaths(): string[] {
    return [...this.snapshot.invalid.keys()];
  }
  invalidErrors(path: string): CardError[] {
    return this.snapshot.invalid.get(path) ?? [];
  }
}
