import { IDENTIFIERS, MARKERS } from "./identifiers";
import type { CardFormat, CardFormatParseResult } from "./card-format";

function occurrences(source: string, needle: string): number[] {
  const result: number[] = [];
  for (let offset = 0; ; offset += needle.length) {
    const index = source.indexOf(needle, offset);
    if (index < 0) return result;
    result.push(index);
    offset = index;
  }
}

export function undoLastReview(
  source: string,
  document: { rawEventLines: string[]; ranges?: { log: [number, number] | null } },
  eventId: string,
): string {
  if (!document.ranges?.log) throw new Error("Card does not contain a log section");
  if (document.rawEventLines.length <= 1)
    throw new Error("Cannot undo the creation event of a card");

  const [start, end] = document.ranges.log;
  const lastLine = document.rawEventLines.at(-1);
  if (!lastLine) throw new Error("No review events available to undo");

  let parsed: { eid?: string };
  try {
    parsed = JSON.parse(lastLine);
  } catch {
    throw new Error("Failed to parse the last event line");
  }

  if (parsed.eid !== eventId) throw new Error("Event ID mismatch");

  const remainingLines = document.rawEventLines.slice(0, -1);
  const remaining = `<!--${IDENTIFIERS.logMarker}\n${remainingLines.join("\n")}\n${IDENTIFIERS.logMarker}-->`;
  const before = source.slice(0, start);
  const after = source.slice(end);
  return before + remaining + after;
}

function stripCodeBlocks(source: string): string {
  return source
    .replace(/```[\s\S]*?```/g, m => " ".repeat(m.length))
    .replace(/`[^`\n]+`/g, m => " ".repeat(m.length));
}

/** The original single Front/Back card format. */
export const frontBackCardFormat: CardFormat = {
  id: "front-back",
  supports(frontmatter): boolean {
    const format = frontmatter[IDENTIFIERS.cardFormatKey];
    return format === undefined || format === this.id;
  },
  parse(source: string, frontmatterEnd: number): CardFormatParseResult {
    const errors = [];
    const searchSource = " ".repeat(frontmatterEnd) + stripCodeBlocks(source.slice(frontmatterEnd));

    const answerRegex = /(?:^|\n)[ \t]*<!--\s*RETRIEVA-ANSWER\s*-->/g;
    const answers = [...searchSource.matchAll(answerRegex)].map(
      m => m.index! + (m[0].startsWith("\n") ? 1 : 0),
    );
    if (answers.length !== 1)
      errors.push({
        code: "answer-marker-count",
        message: "Answer marker must appear exactly once",
      });

    const cardRegex = new RegExp(
      `<!--\\s*${IDENTIFIERS.cardMarker}\\s+(\\{[\\s\\S]*?\\})\\s*-->`,
      "g",
    );
    const cards = [...searchSource.matchAll(cardRegex)];
    if (cards.length !== 1)
      errors.push({ code: "card-marker-count", message: "Card marker must appear exactly once" });

    let cardId: string | null = null;
    const card = cards[0];
    if (card?.[1])
      try {
        const payload: unknown = JSON.parse(card[1]);
        if (
          typeof payload === "object" &&
          payload !== null &&
          typeof (payload as { id?: unknown }).id === "string"
        )
          cardId = (payload as { id: string }).id;
        else errors.push({ code: "card-payload", message: "Card marker JSON must include an id" });
      } catch {
        errors.push({ code: "card-payload", message: "Invalid JSON in card marker" });
      }

    const logStartRegex = new RegExp(`<!--\\s*${IDENTIFIERS.logMarker}`, "g");
    const logEndRegex = new RegExp(`${IDENTIFIERS.logMarker}\\s*-->`, "g");
    const logStarts = [...searchSource.matchAll(logStartRegex)].map(m => m.index);
    const logEnds = [...searchSource.matchAll(logEndRegex)].map(m => m.index);

    if (logStarts.length !== 1 || logEnds.length !== 1)
      errors.push({ code: "log-marker-count", message: "Log markers must appear exactly once" });

    let logContent: string | null = null;
    let log: [number, number] | null = null;
    if (logStarts.length === 1 && logEnds.length === 1) {
      const contentStart = logStarts[0]! + MARKERS.logStart.length;
      const contentEnd = logEnds[0]!;
      if (contentEnd <= contentStart)
        errors.push({ code: "log-order", message: "Log end precedes log start" });
      else {
        log = [logStarts[0]!, contentEnd + MARKERS.logEnd.length];
        logContent = source
          .slice(contentStart, contentEnd)
          .replace(/^\r?\n/, "")
          .replace(/\r?\n$/, "");
      }
    }
    const answer = answers[0];
    const cardIndex = card?.index;
    const endIndices = [cardIndex, logStarts[0], source.length].filter(
      (x): x is number => typeof x === "number",
    );
    const backEnd = endIndices.length > 0 ? Math.min(...endIndices) : source.length;

    return {
      cardId,
      front: answer === undefined ? "" : source.slice(frontmatterEnd, answer).trim(),
      back:
        answer === undefined ? "" : source.slice(answer + MARKERS.answer.length, backEnd).trim(),
      ranges: {
        answer: answer === undefined ? null : [answer, answer + MARKERS.answer.length],
        card: cardIndex === undefined || !card ? null : [cardIndex, cardIndex + card[0].length],
        log,
      },
      logContent,
      errors,
    };
  },
  undoLastReview,
};
