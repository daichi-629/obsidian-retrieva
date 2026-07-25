import {
  hasCardTag,
  hasMachineMarker,
  IDENTIFIERS,
  parseCardMarkdown,
  parsePresetMarkdown,
  type CardError,
  type IndexedCard,
  type ParsedCard,
  type Preset,
} from "../core";

/** A Markdown document supplied to the indexer, independent of Obsidian's API. */
export interface CardIndexSource {
  path: string;
  source: string;
}

export interface CardIndexSnapshot {
  cards: Map<string, IndexedCard>;
  parsed: Map<string, ParsedCard>;
  invalid: Map<string, CardError[]>;
  presets: Map<string, Preset>;
  presetDefinitionIds: Set<string>;
}

export interface BuildCardIndexOptions {
  /** Also report machine-marked documents that are missing the card tag. */
  deepValidation?: boolean;
}

const duplicatePresetError = (id: string): CardError => ({
  code: "duplicate-preset",
  message: `Duplicate preset: ${id}`,
});

const duplicateCardError = (id: string): CardError => ({
  code: "duplicate-card-id",
  message: `Duplicate card ID: ${id}`,
});

function toIndexedCard(parsed: ParsedCard): IndexedCard | undefined {
  const errors = [...parsed.errors];
  if (!parsed.presetId)
    errors.push({ code: "missing-preset-reference", message: "Preset reference is missing" });
  if (errors.length || !parsed.cardId || !parsed.presetId || !parsed.events.length)
    return undefined;

  const last = parsed.events.at(-1)!;
  return {
    path: parsed.path,
    cardId: parsed.cardId,
    presetId: parsed.presetId,
    siblingGroupId: parsed.siblingGroupId,
    tags: parsed.tags,
    state: last.state,
    lastEventId: last.eid,
    createdAt: parsed.events[0]!.at,
    events: parsed.events,
  };
}

function indexPresets(
  sources: CardIndexSource[],
  invalid: Map<string, CardError[]>,
): { presets: Map<string, Preset>; presetDefinitionIds: Set<string>; presetPaths: Set<string> } {
  const presets = new Map<string, Preset>();
  const presetDefinitionIds = new Set<string>();
  const pathsById = new Map<string, string[]>();
  const presetPaths = new Set<string>();

  for (const { path, source } of sources) {
    const result = parsePresetMarkdown(path, source);
    if (!result.preset) {
      if (source.includes(IDENTIFIERS.presetDefinitionKey)) invalid.set(path, result.errors);
      continue;
    }
    presetPaths.add(path);
    presetDefinitionIds.add(result.preset.id);
    presets.set(result.preset.id, result.preset);
    pathsById.set(result.preset.id, [...(pathsById.get(result.preset.id) ?? []), path]);
  }

  for (const [id, paths] of pathsById) {
    if (paths.length < 2) continue;
    presets.delete(id);
    for (const path of paths) invalid.set(path, [duplicatePresetError(id)]);
  }
  return { presets, presetDefinitionIds, presetPaths };
}

function indexCards(
  sources: CardIndexSource[],
  presetPaths: Set<string>,
  presets: Map<string, Preset>,
  invalid: Map<string, CardError[]>,
  deepValidation: boolean,
): { cards: Map<string, IndexedCard>; parsed: Map<string, ParsedCard> } {
  const parsed = new Map<string, ParsedCard>();
  for (const { path, source } of sources) {
    if (presetPaths.has(path) || !hasCardTag(source)) continue;
    parsed.set(path, parseCardMarkdown(path, source));
  }

  if (deepValidation)
    for (const { path, source } of sources)
      if (hasMachineMarker(source) && !parsed.has(path)) {
        const document = parseCardMarkdown(path, source);
        parsed.set(path, document);
      }

  const cards = new Map<string, IndexedCard>();
  for (const document of parsed.values()) {
    const card = toIndexedCard(document);
    if (!card) {
      const errors = [...document.errors];
      if (!document.presetId)
        errors.push({ code: "missing-preset-reference", message: "Preset reference is missing" });
      else if (!presets.has(document.presetId))
        errors.push({ code: "missing-preset", message: `Preset not found: ${document.presetId}` });
      invalid.set(document.path, errors);
      continue;
    }
    if (!presets.has(card.presetId)) {
      invalid.set(card.path, [
        ...document.errors,
        { code: "missing-preset", message: `Preset not found: ${card.presetId}` },
      ]);
      continue;
    }
    cards.set(card.path, card);
  }
  return { cards, parsed };
}

function invalidateDuplicateCardIds(
  cards: Map<string, IndexedCard>,
  parsed: Map<string, ParsedCard>,
  invalid: Map<string, CardError[]>,
): void {
  const pathsById = new Map<string, string[]>();
  for (const document of parsed.values())
    if (document.cardId)
      pathsById.set(document.cardId, [...(pathsById.get(document.cardId) ?? []), document.path]);

  for (const [id, paths] of pathsById) {
    if (paths.length < 2) continue;
    for (const path of paths) {
      cards.delete(path);
      const errors = invalid.get(path) ?? [];
      if (!errors.some(error => error.code === "duplicate-card-id"))
        invalid.set(path, [...errors, duplicateCardError(id)]);
    }
  }
}

/** Builds a complete, internally consistent card index without performing I/O. */
export function buildCardIndex(
  sources: CardIndexSource[],
  { deepValidation = false }: BuildCardIndexOptions = {},
): CardIndexSnapshot {
  const invalid = new Map<string, CardError[]>();
  const { presets, presetDefinitionIds, presetPaths } = indexPresets(sources, invalid);
  const { cards, parsed } = indexCards(sources, presetPaths, presets, invalid, deepValidation);
  invalidateDuplicateCardIds(cards, parsed, invalid);
  if (deepValidation)
    for (const { path, source } of sources)
      if (hasMachineMarker(source) && !hasCardTag(source)) {
        const errors = invalid.get(path) ?? [];
        if (!errors.some(error => error.code === "missing-card-tag"))
          invalid.set(path, [
            ...errors,
            { code: "missing-card-tag", message: `Card tag ${IDENTIFIERS.cardTag} is missing` },
          ]);
      }
  return { cards, parsed, invalid, presets, presetDefinitionIds };
}
