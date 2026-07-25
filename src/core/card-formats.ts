import { IDENTIFIERS } from "./identifiers";
import type { CardError } from "./types";
import type { CardFormat } from "./card-format";
import { frontBackCardFormat } from "./front-back-card-format";

const formats: readonly CardFormat[] = [frontBackCardFormat];

export function resolveCardFormat(frontmatter: Record<string, unknown>): {
  format: CardFormat;
  errors: CardError[];
} {
  const format = formats.find(candidate => candidate.supports(frontmatter));
  if (format) return { format, errors: [] };
  return {
    format: frontBackCardFormat,
    errors: [
      {
        code: "unsupported-card-format",
        message: `Unsupported card format: ${String(frontmatter[IDENTIFIERS.cardFormatKey])}`,
      },
    ],
  };
}

export { frontBackCardFormat } from "./front-back-card-format";
export type { CardFormat } from "./card-format";
