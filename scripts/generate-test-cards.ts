import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { renderCardTemplate, uuidv7 } from "../src/core";

const VAULT_DIR = path.resolve(import.meta.dirname, "../test-vault");
const CARDS_DIR = path.join(VAULT_DIR, "Cards");

// ---------------------------------------------------------------------------
// Normal cards – all English, each with extra tags beyond `retrieva-card`
// ---------------------------------------------------------------------------

interface SampleCard {
  front: string;
  back: string;
  extraTags: string[];
}

const SAMPLE_CARDS: SampleCard[] = [
  {
    front: "What is the capital of Japan?",
    back: "Tokyo",
    extraTags: ["geography", "asia"],
  },
  {
    front: "What does FSRS stand for?",
    back: "Free Spaced Repetition Scheduler",
    extraTags: ["study/spaced-repetition", "algorithms"],
  },
  {
    front: "What is the plugin definition file in Obsidian?",
    back: "manifest.json",
    extraTags: ["programming/tools", "obsidian"],
  },
  {
    front: "What is 1 + 1?",
    back: "2",
    extraTags: ["math/arithmetic"],
  },
  {
    front: "What is the chemical formula for water?",
    back: "H2O",
    extraTags: ["science/chemistry", "science/basics"],
  },
  {
    front: "Who wrote Romeo and Juliet?",
    back: "William Shakespeare",
    extraTags: ["literature/english", "history/renaissance"],
  },
  {
    front: "What is the speed of light in a vacuum (approx.)?",
    back: "3 × 10⁸ m/s",
    extraTags: ["science/physics", "constants"],
  },
];

/**
 * Inject additional tags into the YAML frontmatter produced by
 * `renderCardTemplate`. The template always emits exactly:
 *
 *   tags:
 *     - retrieva-card
 *
 * We append extra tag entries right after that line.
 */
function injectExtraTags(content: string, extraTags: string[]): string {
  if (extraTags.length === 0) return content;
  const tagLines = extraTags.map(tag => `  - ${tag}`).join("\n");
  // Match the single-item tags list that renderCardTemplate produces
  return content.replace("tags:\n  - retrieva-card\n", `tags:\n  - retrieva-card\n${tagLines}\n`);
}

// ---------------------------------------------------------------------------
// Broken cards – intentionally malformed for parser edge-case testing
// ---------------------------------------------------------------------------

interface BrokenCard {
  filename: string;
  content: string;
}

function generateBrokenCards(baseNow: number, zone: string): BrokenCard[] {
  // Generate a valid base card to derive broken variants from
  const ts = baseNow + 1000;
  const baseContent = renderCardTemplate({
    front: "Base question (should not appear)",
    back: "Base answer",
    presetId: "default",
    cardId: uuidv7(ts),
    eventId: uuidv7(ts + 1),
    now: new Date(ts),
    zone,
  });

  const cards: BrokenCard[] = [];

  // 1. Invalid frontmatter YAML -------------------------------------------
  cards.push({
    filename: "broken-invalid-yaml.md",
    content: baseContent.replace(
      /^---\n[\s\S]*?\n---\n/,
      "---\nretrieva-preset: default\ntags: [retrieva-card, broken/invalid-yaml\n  - this: is: broken\n---\n",
    ),
  });

  // 2. Missing answer marker ----------------------------------------------
  cards.push({
    filename: "broken-no-answer-marker.md",
    content: injectExtraTags(baseContent, ["broken/no-answer"]).replace(
      /\n<!--RETRIEVA-ANSWER-->\n/,
      "\n",
    ),
  });

  // 3. Duplicate answer markers --------------------------------------------
  cards.push({
    filename: "broken-duplicate-answer.md",
    content: injectExtraTags(baseContent, ["broken/duplicate-answer"]).replace(
      "<!--RETRIEVA-ANSWER-->",
      "<!--RETRIEVA-ANSWER-->\n\nExtra answer section\n\n<!--RETRIEVA-ANSWER-->",
    ),
  });

  // 4. Missing card ID marker ----------------------------------------------
  cards.push({
    filename: "broken-no-card-marker.md",
    content: injectExtraTags(baseContent, ["broken/no-card-marker"]).replace(
      /\n<!--RETRIEVA-CARD\s+\{[^\n]*\}-->\n/,
      "\n",
    ),
  });

  // 5. Corrupt JSON in log section -----------------------------------------
  cards.push({
    filename: "broken-corrupt-log.md",
    content: injectExtraTags(baseContent, ["broken/corrupt-log"]).replace(
      /<!--RETRIEVA-LOG\n[\s\S]*?\nRETRIEVA-LOG-->/,
      '<!--RETRIEVA-LOG\n{"v":1,"eid":"not-valid","type":"created","parent":null CORRUPT\nRETRIEVA-LOG-->',
    ),
  });

  return cards;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  await mkdir(CARDS_DIR, { recursive: true });
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const baseNow = Date.now();
  let count = 0;

  // --- Normal cards -------------------------------------------------------
  for (const [i, sample] of SAMPLE_CARDS.entries()) {
    const now = new Date(baseNow + i * 2);
    const content = renderCardTemplate({
      front: sample.front,
      back: sample.back,
      presetId: "default",
      cardId: uuidv7(now.getTime()),
      eventId: uuidv7(now.getTime() + 1),
      now,
      zone,
    });
    const withTags = injectExtraTags(content, sample.extraTags);
    await writeFile(path.join(CARDS_DIR, `test-card-${i + 1}.md`), withTags, "utf8");
    count++;
  }

  // --- Broken cards -------------------------------------------------------
  const brokenCards = generateBrokenCards(baseNow, zone);
  for (const card of brokenCards) {
    await writeFile(path.join(CARDS_DIR, card.filename), card.content, "utf8");
    count++;
  }

  console.log(
    `Generated ${count} test cards (${SAMPLE_CARDS.length} normal, ${brokenCards.length} broken) in ${CARDS_DIR}`,
  );
}

void main();
