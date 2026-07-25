import { describe, expect, it } from "vitest";
import {
  IDENTIFIERS,
  buildQueue,
  buildTagTree,
  cardsMatching,
  collectScopeTags,
  calculateAnswerCandidates,
  isPathExcluded,
  initializeCardMarkdown,
  parseCardMarkdown,
  parsePresetMarkdown,
  normalizeExcludedDirectories,
  sortAndRegenerateParents,
  tagFilter,
  validateLinearHistory,
  type CardEvent,
  type IndexedCard,
  type Preset,
} from "../src/core";
import { NEW_STATE } from "../src/core/types";
import { appendEvent, createReviewEvent, undoLastReview } from "../src/core/events";
import { dueNow } from "../src/core/date";
import { renderCardTemplate } from "../src/core/card-template";

const now = new Date("2026-07-22T04:00:00.000Z");
const presetSource = `---
${IDENTIFIERS.presetDefinitionKey}: true
${IDENTIFIERS.presetIdKey}: default
scheduler: fsrs
desired-retention: 0.9
maximum-interval-days: 36500
learning-steps: [1m, 10m]
relearning-steps: [10m]
exclude-new-siblings-today: true
exclude-review-siblings-today: true
---
`;
const preset = parsePresetMarkdown("preset.md", presetSource).preset!;
const cardSource = () =>
  renderCardTemplate({
    front: "![[Note#Front]]",
    back: "![[Note#Back]]",
    presetId: "default",
    cardId: "C1",
    eventId: "E1",
    now,
    zone: "Asia/Tokyo",
  });

describe("card Markdown", () => {
  it("initializes an LLM-authored card without requiring machine IDs", () => {
    const draft = `---\n${IDENTIFIERS.presetKey}: default\ntags: [${IDENTIFIERS.cardTag}]\n---\n\nQ\n\n<!--RETRIEVA-ANSWER-->\n\nA\n`;
    const initialized = initializeCardMarkdown(draft, {
      cardId: "C1",
      eventId: "E1",
      now,
      zone: "Asia/Tokyo",
    });
    expect(initialized).not.toBeNull();
    const parsed = parseCardMarkdown("Cards/llm.md", initialized!);
    expect(parsed.errors).toEqual([]);
    expect(parsed.cardId).toBe("C1");
    expect(parsed.events[0]?.eid).toBe("E1");
  });
  it("does not auto-repair partial or malformed machine metadata", () => {
    const draft = `---\n${IDENTIFIERS.presetKey}: default\ntags: [${IDENTIFIERS.cardTag}]\n---\n\nQ\n\n<!--RETRIEVA-ANSWER-->\n\nA\n`;
    const input = { cardId: "C1", eventId: "E1", now, zone: "UTC" };
    expect(initializeCardMarkdown(draft.replace("A\n", "A\n<!--RETRIEVA-LOG\n"), input)).toBeNull();
    expect(initializeCardMarkdown(draft.replace("<!--RETRIEVA-ANSWER-->", ""), input)).toBeNull();
  });
  it("round-trips all reconstructable state from one Markdown file", () => {
    const parsed = parseCardMarkdown("Cards/a.md", cardSource());
    expect(parsed.errors).toEqual([]);
    expect(parsed.cardId).toBe("C1");
    expect(parsed.presetId).toBe("default");
    expect(parsed.front).toBe("![[Note#Front]]");
    expect(parsed.back).toBe("![[Note#Back]]");
    expect(parsed.events[0]?.state).toEqual(NEW_STATE);
  });
  it("detects malformed JSONL and marker duplication", () => {
    const malformed = cardSource()
      .replace(JSON.stringify(parseCardMarkdown("x", cardSource()).events[0]), "not-json")
      .replace("<!--RETRIEVA-ANSWER-->", "<!--RETRIEVA-ANSWER-->\n<!--RETRIEVA-ANSWER-->");
    expect(parseCardMarkdown("x", malformed).errors.map(error => error.code)).toEqual(
      expect.arrayContaining(["invalid-json", "answer-marker-count"]),
    );
  });
  it("appends exactly one row without changing existing content and can undo it", () => {
    const source = cardSource();
    const parsed = parseCardMarkdown("x", source);
    const next = calculateAnswerCandidates(NEW_STATE, preset, now).good;
    const event = createReviewEvent({
      cardState: NEW_STATE,
      nextState: next,
      rating: "good",
      parent: "E1",
      durationMs: 1234,
      now,
      zone: "Asia/Tokyo",
      eventId: "E2",
    });
    const after = appendEvent(source, parsed, event);
    expect(after.replace(`${JSON.stringify(event)}\n`, "")).toBe(source);
    expect(parseCardMarkdown("x", after).events).toHaveLength(2);
    expect(undoLastReview(after, parseCardMarkdown("x", after), "E2")).toBe(source);
    expect(JSON.stringify(event)).not.toContain("preset");
  });
  it("preserves CRLF and final-newline policy", () => {
    const source = cardSource().replace(/\n/g, "\r\n").replace(/\r\n$/, "");
    const parsed = parseCardMarkdown("x", source);
    const event = createReviewEvent({
      cardState: NEW_STATE,
      nextState: calculateAnswerCandidates(NEW_STATE, preset, now).hard,
      rating: "hard",
      parent: "E1",
      durationMs: 1,
      now,
      zone: "UTC",
      eventId: "E2",
    });
    const after = appendEvent(source, parsed, event);
    expect(after.includes("\r\n" + JSON.stringify(event) + "\r\n")).toBe(true);
    expect(after.endsWith("\n")).toBe(false);
  });
});

describe("excluded directories", () => {
  it("normalizes directory settings and respects path boundaries", () => {
    expect(normalizeExcludedDirectories([" /Archive/ ", "Archive", "Drafts\\Old", ""])).toEqual([
      "Archive",
      "Drafts/Old",
    ]);
    expect(isPathExcluded("Archive/broken.md", ["Archive"])).toBe(true);
    expect(isPathExcluded("Archive-old/card.md", ["Archive"])).toBe(false);
    expect(isPathExcluded("Drafts/Old/card.md", ["Drafts\\Old"])).toBe(true);
  });
});

describe("linear history", () => {
  const event = (
    eid: string,
    parent: string | null,
    at: string,
    type: CardEvent["type"] = "review",
  ): CardEvent =>
    ({
      v: 1,
      eid,
      parent,
      type,
      at,
      zone: "UTC",
      scheduler: "fsrs@1",
      state: { ...NEW_STATE },
      ...(type === "review" ? { rating: "good" as const, durationMs: 1 } : {}),
    }) as CardEvent;
  it("rejects missing parents, branches, duplicate IDs, and multiple created events", () => {
    const events = [
      event("E1", null, "2026-01-01T00:00:00Z", "created"),
      event("E2", "E1", "2026-01-02T00:00:00Z"),
      event("E2", "E1", "2026-01-03T00:00:00Z"),
    ];
    expect(validateLinearHistory(events).map(error => error.code)).toEqual(
      expect.arrayContaining(["conflicting-eid", "parent-mismatch", "review-branch"]),
    );
  });
  it("sorts deterministically and regenerates a linear parent chain", () => {
    const repaired = sortAndRegenerateParents([
      event("E2", "bad", "2026-01-02T00:00:00Z"),
      event("E1", null, "2026-01-01T00:00:00Z", "created"),
    ]);
    expect(repaired.map(value => [value.eid, value.parent])).toEqual([
      ["E1", null],
      ["E2", "E1"],
    ]);
    expect(validateLinearHistory(repaired)).toEqual([]);
  });
});

describe("scheduling and queues", () => {
  it("lists only distinct deck tags used by Retrieva cards", () => {
    const cards = ["z/deck", "alpha", "alpha"].map((tag, index) => ({
      path: `${index}.md`,
      cardId: `C${index}`,
      presetId: "default",
      siblingGroupId: null,
      tags: [IDENTIFIERS.cardTag, tag],
      state: { ...NEW_STATE },
      lastEventId: `E${index}`,
      createdAt: now.toISOString(),
      events: [],
    })) satisfies IndexedCard[];
    expect(collectScopeTags(cards)).toEqual(["alpha", "z/deck"]);
  });
  it("nests hierarchical tags under their implied parent segments", () => {
    const tree = buildTagTree(["alpha", "science/basics", "science/chemistry"]);
    expect(tree).toEqual([
      { segment: "alpha", path: "alpha", children: [] },
      {
        segment: "science",
        path: "science",
        children: [
          { segment: "basics", path: "science/basics", children: [] },
          { segment: "chemistry", path: "science/chemistry", children: [] },
        ],
      },
    ]);
  });
  it("matches a tag filter against exact tags and their sub-tags", () => {
    const cards = ["alpha", "science/basics", "science/chemistry/organic"].map((tag, index) => ({
      path: `${index}.md`,
      cardId: `C${index}`,
      presetId: "default",
      siblingGroupId: null,
      tags: [IDENTIFIERS.cardTag, tag],
      state: { ...NEW_STATE },
      lastEventId: `E${index}`,
      createdAt: now.toISOString(),
      events: [],
    })) satisfies IndexedCard[];
    expect(cardsMatching(cards, tagFilter("science")).map(card => card.path)).toEqual([
      "1.md",
      "2.md",
    ]);
    expect(cardsMatching(cards, tagFilter("")).map(card => card.path)).toEqual([
      "0.md",
      "1.md",
      "2.md",
    ]);
  });
  it("returns four FSRS outcomes with short-term instants", () => {
    const candidates = calculateAnswerCandidates(NEW_STATE, preset, now);
    expect(Object.keys(candidates)).toEqual(["again", "hard", "good", "easy"]);
    expect(candidates.again.due?.kind).toBe("instant");
    expect(candidates.easy.reps).toBe(1);
  });
  it("uses local dates for day due and absolute time for instant due", () => {
    expect(dueNow({ kind: "day", date: "2000-01-01" }, now)).toBe(true);
    expect(dueNow({ kind: "instant", at: "2099-01-01T00:00:00Z" }, now)).toBe(false);
  });
  it("orders learning, relearning, review, then new and excludes siblings reviewed today", () => {
    const make = (
      id: string,
      phase: IndexedCard["state"]["phase"],
      group: string | null = null,
    ): IndexedCard => ({
      path: `${id}.md`,
      cardId: id,
      presetId: "default",
      siblingGroupId: group,
      tags: ["x"],
      state: {
        ...NEW_STATE,
        phase,
        due: phase === "new" ? null : { kind: "day", date: "2000-01-01" },
      },
      lastEventId: "E1",
      createdAt: "2020-01-01T00:00:00Z",
      events: [
        {
          v: 1,
          eid: "E1",
          type: "created",
          parent: null,
          at: "2020-01-01T00:00:00Z",
          zone: "UTC",
          state: { ...NEW_STATE },
        },
      ],
    });
    const reviewed = make("reviewed", "review", "G");
    reviewed.events.push({
      v: 1,
      eid: "E2",
      type: "review",
      parent: "E1",
      at: now.toISOString(),
      zone: "UTC",
      scheduler: "fsrs@1",
      rating: "good",
      durationMs: 1,
      state: reviewed.state,
    });
    const cards = [
      make("N", "new"),
      make("R", "review"),
      make("L", "learning"),
      make("RL", "relearning"),
      reviewed,
      make("sibling", "new", "G"),
    ];
    const queue = buildQueue(cards, new Map([["default", preset]]), now);
    expect(queue.ready.slice(0, 4).map(card => card.cardId)).toEqual(["L", "RL", "R", "reviewed"]);
    expect(queue.siblingExcluded.map(card => card.cardId)).toEqual(["sibling"]);
  });
});

describe("preset validation", () => {
  it("rejects unsupported retention and scheduler", () => {
    expect(parsePresetMarkdown("x", presetSource.replace("0.9", "0.5")).preset).toBeUndefined();
    expect(
      parsePresetMarkdown("x", presetSource.replace("scheduler: fsrs", "scheduler: sm2")).preset,
    ).toBeUndefined();
  });
});

describe("MVP-sized vault", () => {
  it("parses and queues several thousand cards from Markdown alone", () => {
    const cards: IndexedCard[] = [];
    for (let index = 0; index < 3000; index++) {
      const parsed = parseCardMarkdown(
        `Cards/${index}.md`,
        renderCardTemplate({
          front: "Q",
          back: "A",
          presetId: "default",
          cardId: `C${index}`,
          eventId: `E${index}`,
          now,
          zone: "UTC",
        }),
      );
      expect(parsed.errors).toEqual([]);
      cards.push({
        path: parsed.path,
        cardId: parsed.cardId!,
        presetId: parsed.presetId!,
        siblingGroupId: null,
        tags: parsed.tags,
        state: parsed.events[0]!.state,
        lastEventId: parsed.events[0]!.eid,
        createdAt: parsed.events[0]!.at,
        events: parsed.events,
      });
    }
    expect(
      buildQueue(cards, new Map<string, Preset>([["default", preset]]), now).ready,
    ).toHaveLength(3000);
  });
});
