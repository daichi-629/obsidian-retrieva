import { parse as parseYaml } from "yaml";
import { IDENTIFIERS, MARKERS } from "./identifiers";
import type { CardError, CardEvent, ParsedCard } from "./types";
import { parseEvent, validateLinearHistory } from "./validation";

function occurrences(source: string, needle: string): number[] {
  const result: number[] = [];
  for (let offset = 0; ; offset += needle.length) {
    const index = source.indexOf(needle, offset);
    if (index < 0) return result;
    result.push(index);
    offset = index;
  }
}

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

export function parseCardMarkdown(path: string, source: string): ParsedCard {
  const errors: CardError[] = [];
  const newline = source.includes("\r\n") ? "\r\n" : "\n";
  const fm = frontmatterOf(source);
  if (fm.error) errors.push({ code: "frontmatter", message: fm.error });
  const answerMatches = occurrences(source, MARKERS.answer);
  const cardPattern = new RegExp(`<!--${IDENTIFIERS.cardMarker}\\s+({[^\\r\\n]*})\\s*-->`, "g");
  const cardMatches = [...source.matchAll(cardPattern)];
  const logStarts = occurrences(source, MARKERS.logStart);
  const logEnds = occurrences(source, MARKERS.logEnd);
  if (answerMatches.length !== 1)
    errors.push({ code: "answer-marker-count", message: "Answer marker must appear exactly once" });
  if (cardMatches.length !== 1)
    errors.push({ code: "card-marker-count", message: "Card marker must appear exactly once" });
  if (logStarts.length !== 1 || logEnds.length !== 1)
    errors.push({ code: "log-marker-count", message: "Log markers must appear exactly once" });

  let cardId: string | null = null;
  const cardMatch = cardMatches[0];
  if (cardMatch) {
    try {
      const metadata = JSON.parse(cardMatch[1] ?? "") as { v?: unknown; id?: unknown };
      if (metadata.v !== 1 || typeof metadata.id !== "string" || metadata.id.length === 0)
        throw new Error("invalid schema");
      cardId = metadata.id;
    } catch {
      errors.push({ code: "invalid-card-marker", message: "Card marker JSON is invalid" });
    }
  }

  const rawEventLines: string[] = [];
  const events: CardEvent[] = [];
  let logRange: [number, number] | null = null;
  if (logStarts.length === 1 && logEnds.length === 1) {
    const contentStart = logStarts[0]! + MARKERS.logStart.length;
    const contentEnd = logEnds[0]!;
    if (contentEnd <= contentStart)
      errors.push({ code: "log-order", message: "Log end precedes log start" });
    else {
      logRange = [logStarts[0]!, contentEnd + MARKERS.logEnd.length];
      const content = source
        .slice(contentStart, contentEnd)
        .replace(/^\r?\n/, "")
        .replace(/\r?\n$/, "");
      for (const [index, line] of content.split(/\r?\n/).entries()) {
        if (line.trim().length === 0) continue;
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
    }
  }
  const answer = answerMatches[0];
  const cardIndex = cardMatch?.index;
  const front = answer === undefined ? "" : source.slice(fm.end, answer).trim();
  const backEnd = cardIndex ?? logStarts[0] ?? source.length;
  const back =
    answer === undefined ? "" : source.slice(answer + MARKERS.answer.length, backEnd).trim();
  const presetValue = fm.data[IDENTIFIERS.presetKey];
  const siblingValue = fm.data[IDENTIFIERS.siblingGroupKey];
  return {
    path,
    source,
    newline,
    finalNewline: source.endsWith("\n"),
    frontmatter: fm.data,
    tags: normalizeTags(fm.data.tags),
    presetId: typeof presetValue === "string" ? presetValue : null,
    siblingGroupId: typeof siblingValue === "string" ? siblingValue : null,
    cardId,
    front,
    back,
    events,
    rawEventLines,
    errors,
    ranges: {
      answer: answer === undefined ? null : [answer, answer + MARKERS.answer.length],
      card:
        cardIndex === undefined || !cardMatch ? null : [cardIndex, cardIndex + cardMatch[0].length],
      log: logRange,
    },
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
