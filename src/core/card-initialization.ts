import { offsetDateTime } from "./date";
import { hasCardTag, parseCardMarkdown } from "./card-parser";
import { IDENTIFIERS, MARKERS } from "./identifiers";
import { NEW_STATE, type CreatedEvent } from "./types";

export interface CardInitializationInput {
  cardId: string;
  eventId: string;
  now: Date;
  zone: string;
}

export function initializeCardMarkdown(
  source: string,
  input: CardInitializationInput,
): string | null {
  if (
    !hasCardTag(source) ||
    source.includes(IDENTIFIERS.cardMarker) ||
    source.includes(IDENTIFIERS.logMarker)
  )
    return null;
  const parsed = parseCardMarkdown("", source);
  if (!parsed.presetId || !parsed.ranges.answer) return null;
  const created: CreatedEvent = {
    v: 1,
    eid: input.eventId,
    type: "created",
    parent: null,
    at: offsetDateTime(input.now),
    zone: input.zone,
    state: { ...NEW_STATE },
  };
  const cardMarkerPart = source.includes(IDENTIFIERS.cardMarker)
    ? ""
    : `${MARKERS.cardPrefix}${JSON.stringify({ v: 1, id: input.cardId })}-->`;
  const logMarkerPart = source.includes(IDENTIFIERS.logMarker)
    ? ""
    : `${MARKERS.logStart}${parsed.newline}${JSON.stringify(created)}${parsed.newline}${MARKERS.logEnd}`;

  const parts = [cardMarkerPart, logMarkerPart].filter(Boolean);
  if (parts.length === 0) return null;

  const separator = source.endsWith(parsed.newline)
    ? parsed.newline
    : `${parsed.newline}${parsed.newline}`;
  return `${source}${separator}${parts.join(`${parsed.newline}${parsed.newline}`)}${parsed.newline}`;
}
