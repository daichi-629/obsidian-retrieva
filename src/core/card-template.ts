import { stringify as stringifyYaml } from "yaml";
import { IDENTIFIERS, MARKERS } from "./identifiers";
import { offsetDateTime } from "./date";
import { NEW_STATE, type CreatedEvent } from "./types";

export interface CardTemplateInput {
  front: string;
  back: string;
  presetId: string;
  cardId: string;
  eventId: string;
  now: Date;
  zone: string;
  siblingGroupId?: string;
}
export function renderCardTemplate(input: CardTemplateInput): string {
  const frontmatter: Record<string, unknown> = { [IDENTIFIERS.presetKey]: input.presetId };
  if (input.siblingGroupId) frontmatter[IDENTIFIERS.siblingGroupKey] = input.siblingGroupId;
  frontmatter.tags = [IDENTIFIERS.cardTag];
  const created: CreatedEvent = {
    v: 1,
    eid: input.eventId,
    type: "created",
    parent: null,
    at: offsetDateTime(input.now),
    zone: input.zone,
    state: { ...NEW_STATE },
  };
  return `---\n${stringifyYaml(frontmatter).trimEnd()}\n---\n\n${input.front}\n\n${MARKERS.answer}\n\n${input.back}\n\n${MARKERS.cardPrefix}${JSON.stringify({ v: 1, id: input.cardId })}-->\n\n${MARKERS.logStart}\n${JSON.stringify(created)}\n${MARKERS.logEnd}\n`;
}
