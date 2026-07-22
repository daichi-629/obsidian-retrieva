import { RATINGS, type CardError, type CardEvent, type CardState } from "./types";

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isInteger = (value: unknown): value is number =>
  Number.isInteger(value) && (value as number) >= 0;
const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const isDate = (value: unknown): value is string =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
const isInstant = (value: unknown): value is string =>
  typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
  Number.isFinite(Date.parse(value));

export function validateState(value: unknown): value is CardState {
  if (
    !isObject(value) ||
    value.v !== 1 ||
    !["new", "learning", "review", "relearning"].includes(String(value.phase))
  )
    return false;
  if (
    !isInteger(value.interval) ||
    !isInteger(value.reps) ||
    !isInteger(value.lapses) ||
    !isInteger(value.learningStep) ||
    typeof value.suspended !== "boolean"
  )
    return false;
  if (!(value.stability === null || (isFiniteNumber(value.stability) && value.stability >= 0)))
    return false;
  if (!(value.difficulty === null || (isFiniteNumber(value.difficulty) && value.difficulty >= 0)))
    return false;
  if (value.due === null) return value.phase === "new";
  if (!isObject(value.due)) return false;
  return (
    (value.due.kind === "day" && isDate(value.due.date)) ||
    (value.due.kind === "instant" && isInstant(value.due.at))
  );
}

export function parseEvent(value: unknown): { event?: CardEvent; error?: string } {
  if (!isObject(value)) return { error: "Event must be an object" };
  if (value.v !== 1) return { error: "Unsupported event schema" };
  if (typeof value.eid !== "string" || value.eid.length === 0) return { error: "Missing event ID" };
  if (!(value.parent === null || typeof value.parent === "string"))
    return { error: "Invalid parent" };
  if (!isInstant(value.at) || typeof value.zone !== "string" || !validateState(value.state))
    return { error: "Invalid event timestamp, zone, or state" };
  if (
    !(["created", "review", "suspend", "resume", "reset", "checkpoint"] as unknown[]).includes(
      value.type,
    )
  )
    return { error: "Invalid event type" };
  if (value.type === "created") {
    if (value.state.phase !== "new" || value.state.suspended)
      return { error: "Created event must contain a new active state" };
    return { event: value as unknown as CardEvent };
  }
  if (typeof value.scheduler !== "string") return { error: "Missing scheduler" };
  if (
    value.type === "review" &&
    (!RATINGS.includes(value.rating as never) || !isInteger(value.durationMs))
  )
    return { error: "Invalid review fields" };
  if (value.type === "suspend" && value.state.suspended !== true)
    return { error: "Suspend event must contain a suspended state" };
  if ((value.type === "resume" || value.type === "reset") && value.state.suspended !== false)
    return { error: `${String(value.type)} event must contain an active state` };
  if (value.type === "reset" && value.state.phase !== "new")
    return { error: "Reset event must contain a new state" };
  if (value.type === "checkpoint") {
    if (
      !Array.isArray(value.reviews) ||
      !value.reviews.every(
        review =>
          Array.isArray(review) &&
          review.length === 2 &&
          isInstant(review[0]) &&
          RATINGS.includes(review[1] as never),
      )
    )
      return { error: "Invalid checkpoint reviews" };
  }
  return { event: value as unknown as CardEvent };
}

export function validateLinearHistory(events: CardEvent[]): CardError[] {
  const errors: CardError[] = [];
  const ids = new Map<string, string>();
  const reviewParents = new Set<string>();
  let createdCount = 0;
  events.forEach((event, index) => {
    if (event.type === "created") createdCount++;
    const serialized = JSON.stringify(event);
    const previous = ids.get(event.eid);
    if (previous !== undefined)
      errors.push({
        code: previous === serialized ? "duplicate-eid" : "conflicting-eid",
        message: `Duplicate event ID: ${event.eid}`,
        line: index + 1,
      });
    ids.set(event.eid, serialized);
    if (event.type === "review" && event.parent !== null) {
      if (reviewParents.has(event.parent))
        errors.push({
          code: "review-branch",
          message: `Multiple review events have parent ${event.parent}`,
          line: index + 1,
        });
      reviewParents.add(event.parent);
    }
    if (index === 0) {
      if (event.type !== "created" && event.type !== "checkpoint")
        errors.push({ code: "first-not-created", message: "First event must be created", line: 1 });
      if (event.parent !== null)
        errors.push({
          code: "created-parent",
          message: "First event parent must be null",
          line: 1,
        });
    } else if (event.parent !== events[index - 1]?.eid) {
      errors.push({
        code: "parent-mismatch",
        message: `Parent must be ${events[index - 1]?.eid ?? "null"}`,
        line: index + 1,
      });
    }
  });
  const startsWithCheckpoint = events[0]?.type === "checkpoint";
  if (createdCount === 0 && !startsWithCheckpoint)
    errors.push({ code: "missing-created", message: "Created event is missing" });
  if (createdCount > 1)
    errors.push({ code: "multiple-created", message: "Created event appears more than once" });
  return errors;
}
