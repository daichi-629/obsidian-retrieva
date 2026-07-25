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

/** The original single Front/Back card format. */
export const frontBackCardFormat: CardFormat = {
  id: "front-back",
  supports(frontmatter): boolean {
    const format = frontmatter[IDENTIFIERS.cardFormatKey];
    return format === undefined || format === this.id;
  },
  parse(source, frontmatterEnd): CardFormatParseResult {
    const errors = [];
    const answers = occurrences(source, MARKERS.answer);
    const cardPattern = new RegExp(`<!--${IDENTIFIERS.cardMarker}\\s+({[^\\r\\n]*})\\s*-->`, "g");
    const cards = [...source.matchAll(cardPattern)];
    const logStarts = occurrences(source, MARKERS.logStart);
    const logEnds = occurrences(source, MARKERS.logEnd);
    if (answers.length !== 1)
      errors.push({
        code: "answer-marker-count",
        message: "Answer marker must appear exactly once",
      });
    if (cards.length !== 1)
      errors.push({ code: "card-marker-count", message: "Card marker must appear exactly once" });
    if (logStarts.length !== 1 || logEnds.length !== 1)
      errors.push({ code: "log-marker-count", message: "Log markers must appear exactly once" });

    let cardId: string | null = null;
    const card = cards[0];
    if (card) {
      try {
        const metadata = JSON.parse(card[1] ?? "") as { v?: unknown; id?: unknown };
        if (metadata.v !== 1 || typeof metadata.id !== "string" || metadata.id.length === 0)
          throw new Error("invalid schema");
        cardId = metadata.id;
      } catch {
        errors.push({ code: "invalid-card-marker", message: "Card marker JSON is invalid" });
      }
    }

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
    return {
      cardId,
      front: answer === undefined ? "" : source.slice(frontmatterEnd, answer).trim(),
      back:
        answer === undefined
          ? ""
          : source
              .slice(answer + MARKERS.answer.length, cardIndex ?? logStarts[0] ?? source.length)
              .trim(),
      ranges: {
        answer: answer === undefined ? null : [answer, answer + MARKERS.answer.length],
        card: cardIndex === undefined || !card ? null : [cardIndex, cardIndex + card[0].length],
        log,
      },
      logContent,
      errors,
    };
  },
};
