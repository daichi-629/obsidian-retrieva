import type { CardError, CardRanges } from "./types";

/** Structural extraction for one card Markdown format. */
export interface CardFormat {
  readonly id: string;
  supports(frontmatter: Record<string, unknown>): boolean;
  parse(source: string, frontmatterEnd: number): CardFormatParseResult;
}

export interface CardFormatParseResult {
  cardId: string | null;
  front: string;
  back: string;
  ranges: CardRanges;
  logContent: string | null;
  errors: CardError[];
}
