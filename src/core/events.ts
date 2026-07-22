import { MARKERS } from "./identifiers";
import { offsetDateTime } from "./date";
import {
  NEW_STATE,
  type CardEvent,
  type CheckpointEvent,
  type CardState,
  type ParsedCard,
  type Rating,
  type ReviewEvent,
  type StateEvent,
} from "./types";

const COMPACT_AFTER_EVENTS = 100;
const KEEP_RECENT_EVENTS = 1;

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

function reviewsForCheckpoint(events: CardEvent[]): [string, Rating][] {
  let lastReset = -1;
  for (let index = events.length - 1; index >= 0; index--)
    if (events[index]?.type === "reset") {
      lastReset = index;
      break;
    }
  const relevant = lastReset >= 0 ? events.slice(lastReset + 1) : events;
  const reviews: [string, Rating][] = [];
  for (const event of relevant) {
    if (event.type === "checkpoint") reviews.push(...event.reviews);
    if (event.type === "review") reviews.push([event.at, event.rating]);
  }
  return reviews;
}

function serializeLog(parsed: ParsedCard, events: CardEvent[]): string {
  return `${MARKERS.logStart}${parsed.newline}${events.map(serializeEvent).join(parsed.newline)}${parsed.newline}${MARKERS.logEnd}`;
}

export function createCheckpointEvent(
  events: CardEvent[],
  context: EventContext & { parent: string | null },
): CheckpointEvent {
  const last = events.at(-1);
  if (!last) throw new Error("Cannot checkpoint an empty history");
  return {
    v: 1,
    eid: context.eventId,
    type: "checkpoint",
    parent: context.parent,
    at: offsetDateTime(context.now),
    zone: context.zone,
    scheduler: "fsrs@1",
    state: last.state,
    reviews: reviewsForCheckpoint(events),
  };
}

export function compactEvents(
  events: CardEvent[],
  context: EventContext,
  compactAfterEvents = COMPACT_AFTER_EVENTS,
  keepRecentEvents = KEEP_RECENT_EVENTS,
): CardEvent[] | null {
  if (events.length <= compactAfterEvents) return null;
  const keep = Math.max(0, keepRecentEvents);
  const checkpointSourceEnd = Math.max(1, events.length - keep);
  const checkpointSource = events.slice(0, checkpointSourceEnd);
  const recent = events.slice(checkpointSourceEnd);
  const checkpoint = createCheckpointEvent(checkpointSource, {
    ...context,
    parent: null,
  });
  const compacted = [checkpoint, ...recent].map((event, index, ordered) => ({
    ...event,
    parent: index === 0 ? null : ordered[index - 1]!.eid,
  }));
  return compacted;
}

export function compactLogIfNeeded(
  source: string,
  parsed: ParsedCard,
  context: EventContext,
): string {
  if (!parsed.ranges.log || parsed.errors.length) return source;
  const compacted = compactEvents(parsed.events, context);
  if (!compacted) return source;
  const log = serializeLog(parsed, compacted);
  return source.slice(0, parsed.ranges.log[0]) + log + source.slice(parsed.ranges.log[1]);
}

export function lastReviewAt(events: CardEvent[]): string | undefined {
  for (let index = events.length - 1; index >= 0; index--) {
    const event = events[index];
    if (event?.type === "review") return event.at;
    if (event?.type === "checkpoint") return event.reviews.at(-1)?.[0];
    if (event?.type === "reset") return undefined;
  }
  return undefined;
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
