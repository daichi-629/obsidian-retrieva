import { parse as parseYaml } from "yaml";
import { IDENTIFIERS } from "./identifiers";
import type { CardError, Preset } from "./types";

export interface ParsedPreset {
  preset?: Preset;
  errors: CardError[];
}
const bool = (value: unknown, fallback: boolean): boolean =>
  typeof value === "boolean" ? value : fallback;
const strings = (value: unknown, fallback: string[]): string[] =>
  Array.isArray(value) && value.every(item => typeof item === "string") ? value : fallback;

export function parsePresetMarkdown(path: string, source: string): ParsedPreset {
  const match = /^(?:\uFEFF)?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(source);
  if (!match)
    return { errors: [{ code: "preset-frontmatter", message: "Preset frontmatter is missing" }] };
  try {
    const data = parseYaml(match[1] ?? "") as Record<string, unknown>;
    if (data[IDENTIFIERS.presetDefinitionKey] !== true)
      return { errors: [{ code: "not-preset", message: "Not a preset definition" }] };
    const id = data[IDENTIFIERS.presetIdKey];
    const retention = data["desired-retention"] ?? 0.9;
    const max = data["maximum-interval-days"] ?? 36500;
    if (typeof id !== "string" || !id.trim()) throw new Error("preset ID is required");
    if (data.scheduler !== "fsrs") throw new Error("scheduler must be fsrs");
    if (typeof retention !== "number" || retention < 0.7 || retention > 0.99)
      throw new Error("desired-retention must be between 0.7 and 0.99");
    if (!Number.isInteger(max) || (max as number) < 1)
      throw new Error("maximum-interval-days must be a positive integer");
    const canonical = JSON.stringify(data);
    return {
      errors: [],
      preset: {
        id,
        scheduler: "fsrs",
        desiredRetention: retention,
        maximumIntervalDays: max as number,
        learningSteps: strings(data["learning-steps"], ["1m", "10m"]),
        relearningSteps: strings(data["relearning-steps"], ["10m"]),
        excludeNewSiblingsToday: bool(data["exclude-new-siblings-today"], true),
        excludeReviewSiblingsToday: bool(data["exclude-review-siblings-today"], true),
        sourcePath: path,
        fingerprint: canonical,
      },
    };
  } catch (error) {
    return { errors: [{ code: "preset-schema", message: String(error) }] };
  }
}
