import { Rating as FsrsRating, State, fsrs, generatorParameters, type Card } from "ts-fsrs";
import { offsetDateTime } from "./date";
import type { CardState, Preset, Rating } from "./types";

const stateMap: Record<CardState["phase"], State> = {
  new: State.New,
  learning: State.Learning,
  review: State.Review,
  relearning: State.Relearning,
};
const phaseMap: Record<State, CardState["phase"]> = {
  [State.New]: "new",
  [State.Learning]: "learning",
  [State.Review]: "review",
  [State.Relearning]: "relearning",
};

function toCard(state: CardState, now: Date, lastReviewAt?: string): Card {
  const due =
    state.due === null
      ? now
      : state.due.kind === "instant"
        ? new Date(state.due.at)
        : new Date(`${state.due.date}T00:00:00`);
  return {
    due,
    stability: state.stability ?? 0,
    difficulty: state.difficulty ?? 0,
    elapsed_days: 0,
    scheduled_days: state.interval,
    learning_steps: state.learningStep,
    reps: state.reps,
    lapses: state.lapses,
    state: stateMap[state.phase],
    ...(state.reps > 0 ? { last_review: new Date(lastReviewAt ?? now) } : {}),
  };
}

function fromCard(card: Card, previous: CardState): CardState {
  const phase = phaseMap[card.state];
  const isShort = phase === "learning" || phase === "relearning";
  return {
    v: 1,
    phase,
    due: isShort
      ? { kind: "instant", at: offsetDateTime(card.due) }
      : phase === "new"
        ? null
        : {
            kind: "day",
            date: `${card.due.getFullYear()}-${String(card.due.getMonth() + 1).padStart(2, "0")}-${String(card.due.getDate()).padStart(2, "0")}`,
          },
    interval: card.scheduled_days,
    stability: Number(card.stability.toFixed(6)),
    difficulty: Number(card.difficulty.toFixed(6)),
    reps: card.reps,
    lapses: card.lapses,
    learningStep: card.learning_steps,
    suspended: previous.suspended,
  };
}

export function calculateAnswerCandidates(
  state: CardState,
  preset: Preset,
  now: Date,
  lastReviewAt?: string,
): Record<Rating, CardState> {
  const scheduler = fsrs(
    generatorParameters({
      request_retention: preset.desiredRetention,
      maximum_interval: preset.maximumIntervalDays,
      learning_steps: preset.learningSteps as `${number}${"m" | "h" | "d"}`[],
      relearning_steps: preset.relearningSteps as `${number}${"m" | "h" | "d"}`[],
      enable_fuzz: false,
    }),
  );
  const results = scheduler.repeat(toCard(state, now, lastReviewAt), now);
  return {
    again: fromCard(results[FsrsRating.Again].card, state),
    hard: fromCard(results[FsrsRating.Hard].card, state),
    good: fromCard(results[FsrsRating.Good].card, state),
    easy: fromCard(results[FsrsRating.Easy].card, state),
  };
}

export function formatDue(state: CardState, now: Date): string {
  if (!state.due) return "New";
  if (state.due.kind === "day")
    return `${Math.max(1, Math.round((new Date(`${state.due.date}T00:00:00`).getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) / 86400000))}d`;
  const minutes = Math.max(1, Math.round((Date.parse(state.due.at) - now.getTime()) / 60000));
  return minutes < 60 ? `${minutes}m` : `${Math.round(minutes / 60)}h`;
}
