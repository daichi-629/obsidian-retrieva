import { MARKERS } from "./identifiers";
import { offsetDateTime } from "./date";
import {
  NEW_STATE,
  type CardEvent,
  type CardState,
  type ParsedCard,
  type Rating,
  type ReviewEvent,
  type StateEvent,
} from "./types";

export interface EventContext {
  now: Date;
  zone: string;
  eventId: string;
}
export function createReviewEvent(
  input: EventContext & {
    cardState: CardState;
    nextState: CardState;
    rating: Rating;
    parent: string;
    durationMs: number;
  },
): ReviewEvent {
  return {
    v: 1,
    eid: input.eventId,
    type: "review",
    parent: input.parent,
    at: offsetDateTime(input.now),
    zone: input.zone,
    scheduler: "fsrs@1",
    rating: input.rating,
    durationMs: Math.max(0, Math.round(input.durationMs)),
    state: input.nextState,
  };
}
export function createStateEvent(
  type: "suspend" | "resume" | "reset",
  state: CardState,
  parent: string,
  context: EventContext,
): StateEvent {
  const next = type === "reset" ? { ...NEW_STATE } : { ...state, suspended: type === "suspend" };
  return {
    v: 1,
    eid: context.eventId,
    type,
    parent,
    at: offsetDateTime(context.now),
    zone: context.zone,
    scheduler: "fsrs@1",
    state: next,
  };
}
export function serializeEvent(event: CardEvent): string {
  return JSON.stringify(event);
}

export function appendEvent(source: string, parsed: ParsedCard, event: CardEvent): string {
  if (!parsed.ranges.log || parsed.errors.length)
    throw new Error("Cannot append to an invalid card");
  const end = source.indexOf(MARKERS.logEnd, parsed.ranges.log[0]);
  const before = source.slice(0, end);
  const separator = before.endsWith(parsed.newline) ? "" : parsed.newline;
  return `${before}${separator}${serializeEvent(event)}${parsed.newline}${source.slice(end)}`;
}

export function undoLastReview(
  source: string,
  parsed: ParsedCard,
  expectedEventId: string,
): string {
  const last = parsed.events.at(-1);
  if (!last || last.type !== "review" || last.eid !== expectedEventId || !parsed.ranges.log)
    throw new Error("Review can no longer be undone");
  const line = serializeEvent(last);
  const start = source.lastIndexOf(line, parsed.ranges.log[1]);
  if (start < 0) throw new Error("Review row not found");
  let end = start + line.length;
  if (source.slice(end, end + parsed.newline.length) === parsed.newline)
    end += parsed.newline.length;
  return source.slice(0, start) + source.slice(end);
}
