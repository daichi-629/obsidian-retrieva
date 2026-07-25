import { parse as parseYaml } from "yaml";
import { IDENTIFIERS } from "./identifiers";
import { resolveCardFormat } from "./card-formats";
import type { CardError, CardEvent, ParsedCard } from "./types";
import { parseEvent, validateLinearHistory } from "./validation";

function frontmatterOf(source: string): {
  data: Record<string, unknown>;
  end: number;
  error?: string;
} {
  const match = /^(?:\uFEFF)?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(source);
  if (!match) return { data: {}, end: 0 };
  try {
    const parsed: unknown = parseYaml(match[1] ?? "");
    return {
      data:
        typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {},
      end: match[0].length,
    };
  } catch (error) {
    return { data: {}, end: match[0].length, error: `Invalid frontmatter: ${String(error)}` };
  }
}

function normalizeTags(value: unknown): string[] {
  const values = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[ ,]+/)
      : [];
  return values
    .filter((tag): tag is string => typeof tag === "string")
    .map(tag => tag.replace(/^#/, ""));
}

function parseEvents(content: string | null): {
  rawEventLines: string[];
  events: CardEvent[];
  errors: CardError[];
} {
  if (content === null) return { rawEventLines: [], events: [], errors: [] };
  const rawEventLines: string[] = [];
  const events: CardEvent[] = [];
  const errors: CardError[] = [];
  for (const [index, line] of content.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    rawEventLines.push(line);
    try {
      const result = parseEvent(JSON.parse(line));
      if (result.event) events.push(result.event);
      else
        errors.push({
          code: "event-schema",
          message: result.error ?? "Invalid event",
          line: index + 1,
        });
    } catch {
      errors.push({ code: "invalid-json", message: "Invalid JSONL row", line: index + 1 });
    }
  }
  if (!errors.some(error => error.code === "invalid-json" || error.code === "event-schema"))
    errors.push(...validateLinearHistory(events));
  return { rawEventLines, events, errors };
}

/** Parses common card metadata and delegates Markdown structure to the selected card format. */
export function parseCardMarkdown(path: string, source: string): ParsedCard {
  const frontmatter = frontmatterOf(source);
  const { format, errors: formatErrors } = resolveCardFormat(frontmatter.data);
  const structure = format.parse(source, frontmatter.end);
  const eventLog = parseEvents(structure.logContent);
  const presetValue = frontmatter.data[IDENTIFIERS.presetKey];
  const siblingValue = frontmatter.data[IDENTIFIERS.siblingGroupKey];
  return {
    path,
    source,
    newline: source.includes("\r\n") ? "\r\n" : "\n",
    finalNewline: source.endsWith("\n"),
    frontmatter: frontmatter.data,
    tags: normalizeTags(frontmatter.data.tags),
    presetId: typeof presetValue === "string" ? presetValue : null,
    siblingGroupId: typeof siblingValue === "string" ? siblingValue : null,
    formatId: format.id,
    cardId: structure.cardId,
    front: structure.front,
    back: structure.back,
    events: eventLog.events,
    rawEventLines: eventLog.rawEventLines,
    errors: [
      ...(frontmatter.error ? [{ code: "frontmatter", message: frontmatter.error }] : []),
      ...formatErrors,
      ...structure.errors,
      ...eventLog.errors,
    ],
    ranges: structure.ranges,
  };
}

export function hasCardTag(source: string): boolean {
  return normalizeTags(frontmatterOf(source).data.tags).includes(IDENTIFIERS.cardTag);
}

export function hasMachineMarker(source: string): boolean {
  return (
    source.includes(IDENTIFIERS.cardMarker) ||
    source.includes(IDENTIFIERS.logMarker) ||
    source.includes(IDENTIFIERS.answerMarker)
  );
}
