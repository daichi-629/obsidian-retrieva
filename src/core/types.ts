export const RATINGS = ["again", "hard", "good", "easy"] as const;
export type Rating = (typeof RATINGS)[number];
export type Phase = "new" | "learning" | "review" | "relearning";

export type Due = { kind: "instant"; at: string } | { kind: "day"; date: string };

export interface CardState {
  v: 1;
  phase: Phase;
  due: Due | null;
  interval: number;
  stability: number | null;
  difficulty: number | null;
  reps: number;
  lapses: number;
  learningStep: number;
  suspended: boolean;
}

export interface BaseEvent {
  v: 1;
  eid: string;
  parent: string | null;
  at: string;
  zone: string;
  state: CardState;
}
export interface CreatedEvent extends BaseEvent {
  type: "created";
}
export interface ReviewEvent extends BaseEvent {
  type: "review";
  scheduler: string;
  rating: Rating;
  durationMs: number;
}
export interface StateEvent extends BaseEvent {
  type: "suspend" | "resume" | "reset";
  scheduler: string;
}
export interface CheckpointEvent extends BaseEvent {
  type: "checkpoint";
  scheduler: string;
  reviews: [at: string, rating: Rating][];
}
export type CardEvent = CreatedEvent | ReviewEvent | StateEvent | CheckpointEvent;

export interface Preset {
  id: string;
  scheduler: "fsrs";
  desiredRetention: number;
  maximumIntervalDays: number;
  learningSteps: string[];
  relearningSteps: string[];
  excludeNewSiblingsToday: boolean;
  excludeReviewSiblingsToday: boolean;
  sourcePath: string;
  fingerprint: string;
}

export interface ParsedCard {
  path: string;
  source: string;
  newline: "\n" | "\r\n";
  finalNewline: boolean;
  frontmatter: Record<string, unknown>;
  tags: string[];
  presetId: string | null;
  siblingGroupId: string | null;
  cardId: string | null;
  front: string;
  back: string;
  events: CardEvent[];
  rawEventLines: string[];
  errors: CardError[];
  ranges: {
    answer: [number, number] | null;
    card: [number, number] | null;
    log: [number, number] | null;
  };
}

export interface CardError {
  code: string;
  message: string;
  line?: number;
}

export interface IndexedCard {
  path: string;
  cardId: string;
  presetId: string;
  siblingGroupId: string | null;
  tags: string[];
  state: CardState;
  lastEventId: string;
  createdAt: string;
  events: CardEvent[];
}

export interface QueueResult {
  ready: IndexedCard[];
  future: IndexedCard[];
  suspended: IndexedCard[];
  siblingExcluded: IndexedCard[];
  totalValid: number;
  nextDue: Due | null;
}

export const NEW_STATE: CardState = Object.freeze({
  v: 1,
  phase: "new",
  due: null,
  interval: 0,
  stability: null,
  difficulty: null,
  reps: 0,
  lapses: 0,
  learningStep: 0,
  suspended: false,
});
