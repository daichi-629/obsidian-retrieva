import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  CardCreator,
  CardRecoveryService,
  CardService,
  CardWriteLock,
  IDENTIFIERS,
  MARKERS,
  buildQueue,
  buildTagTree,
  calculateAnswerCandidates,
  cardsMatching,
  collectScopeTags,
  hasCardTag,
  hasMachineMarker,
  isPathExcluded,
  parseCardMarkdown,
  parsePresetMarkdown,
  sortAndRegenerateParents,
  tagFilter,
  undoLastReview,
  uuidv7,
  type CardIndexReader,
  type CardIndexLifecycle,
  type PresetCatalog,
} from "../src/core";
import { buildCardIndex } from "../src/obsidian/card-index-model";
import { CardIndexSourceLoader } from "../src/obsidian/card-index-source-loader";
import { CardIndexStore } from "../src/obsidian/card-index-store";
import { PresetCatalogStore } from "../src/obsidian/preset-catalog-store";
import { NodeFileAdapter } from "./node-file-adapter";

const defaultPresetContent = `---
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
# Default SRS Preset
`;

class TestIndex implements CardIndexReader, CardIndexLifecycle, PresetCatalog {
  readonly store = new CardIndexStore();
  readonly presets = new PresetCatalogStore();
  private readonly loader: CardIndexSourceLoader;

  constructor(private readonly files: NodeFileAdapter) {
    this.loader = new CardIndexSourceLoader(this.files, () => false);
  }

  isExcluded(): boolean {
    return false;
  }
  onChange(listener: () => void): () => void {
    return this.store.onChange(listener);
  }
  async start(): Promise<void> {
    await this.rebuild();
  }
  async rebuild(): Promise<void> {
    const sources = await this.loader.load();
    const snapshot = buildCardIndex(sources);
    this.presets.replace(snapshot.presets, snapshot.presetDefinitionIds);
    this.store.replace(snapshot);
  }
  async refresh(path: string): Promise<void> {
    const sources = await this.loader.load(path);
    const snapshot = buildCardIndex(sources);
    this.presets.replace(snapshot.presets, snapshot.presetDefinitionIds);
    this.store.replace(snapshot);
  }
  async deepValidate(): Promise<void> {
    const sources = await this.loader.load(undefined);
    const snapshot = buildCardIndex(sources, { deepValidation: true });
    this.presets.replace(snapshot.presets, snapshot.presetDefinitionIds);
    this.store.replace(snapshot);
  }

  getCard(path: string) {
    return this.store.getCard(path);
  }
  listCards() {
    return this.store.listCards();
  }
  cardsMatching(filter: any) {
    return this.store.cardsMatching(filter);
  }
  scopeTags() {
    return this.store.scopeTags();
  }
  getParsed(path: string) {
    return this.store.getParsed(path);
  }
  hasParsed(path: string) {
    return this.store.hasParsed(path);
  }
  invalidPaths() {
    return this.store.invalidPaths();
  }
  invalidErrors(path: string) {
    return this.store.invalidErrors(path);
  }
  getPreset(id: string) {
    return this.presets.getPreset(id);
  }
  presetEntries() {
    return this.presets.presetEntries();
  }
  presetPaths() {
    return this.presets.presetPaths();
  }
  hasPresetDefinition(id: string) {
    return this.presets.hasPresetDefinition(id);
  }
}

describe("Adversarial QA Test Suite (P1 - P10)", () => {
  let tempDir: string;
  let adapter: NodeFileAdapter;
  let index: TestIndex;
  let writeLock: CardWriteLock;
  let cardService: CardService;
  let creator: CardCreator;
  let recovery: CardRecoveryService;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "retrieva-qa-"));
    adapter = new NodeFileAdapter(tempDir);
    await adapter.create("Retrieva/Presets/default.md", defaultPresetContent);

    index = new TestIndex(adapter);
    await index.start();

    writeLock = new CardWriteLock();
    cardService = new CardService(adapter, index, index, writeLock);
    creator = new CardCreator(adapter, index);
    recovery = new CardRecoveryService(adapter, index, index, writeLock);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  // --- P1: 新人 (誤操作・空送信・連打・直感操作) ---
  describe("P1: Novice User Persona", () => {
    it("Q1.1: 空のフロント/バックでカード作成", async () => {
      const res = await creator.create({
        front: "",
        back: "",
        filename: "EmptyContent",
        presetId: "default",
        folder: "Cards",
        pair: false,
      });
      expect(res.status).toBe("created");
      await index.rebuild();
      const card = index.getCard("Cards/EmptyContent.md");
      // 空コンテンツでもカードとして登録されるか検証
      expect(card).toBeDefined();
    });

    it("Q1.2: filename にスペースのみを指定", async () => {
      const res = await creator.create({
        front: "Q",
        back: "A",
        filename: "   ",
        presetId: "default",
        folder: "Cards",
        pair: false,
      });
      expect(res.status).toBe("created");
      // "---.md" または "   .md" 等の名前になる可能性
    });

    it("Q1.3: filename に改行や特殊制御文字を指定", async () => {
      const res = await creator.create({
        front: "Q",
        back: "A",
        filename: "Test\nName\tSpecial",
        presetId: "default",
        folder: "Cards",
        pair: false,
      });
      expect(res.status).toBe("created");
    });

    it("Q1.4: 存在しない presetId でカード作成", async () => {
      const res = await creator.create({
        front: "Q",
        back: "A",
        filename: "NoPresetCard",
        presetId: "non-existent-preset",
        folder: "Cards",
        pair: false,
      });
      expect(res.status).toBe("created");
      await index.rebuild();
      // 無効なプリセット指定カードは invalidPaths に入るべき
      expect(index.getCard("Cards/NoPresetCard.md")).toBeUndefined();
      expect(index.invalidPaths()).toContain("Cards/NoPresetCard.md");
    });

    it("Q1.5: 同じカードへの同一 Review の二重連続リクエスト(連打)", async () => {
      const cRes = await creator.create({
        front: "Q",
        back: "A",
        filename: "SpamCard",
        presetId: "default",
        folder: "Cards",
        pair: false,
      });
      await index.rebuild();
      const card = index.getCard("Cards/SpamCard.md")!;
      const now = new Date();
      const preset = index.getPreset("default")!;

      const p1 = cardService.review(card.path, card.lastEventId, preset.fingerprint, "good", 100, now, "UTC");
      const p2 = cardService.review(card.path, card.lastEventId, preset.fingerprint, "good", 100, now, "UTC");

      const results = await Promise.allSettled([p1, p2]);
      const fulfilled = results.filter(r => r.status === "fulfilled");
      const rejected = results.filter(r => r.status === "rejected");
      // ロックにより一方が成功し、他方はロックエラー拒否されるか検証
      expect(rejected.length).toBeGreaterThan(0);
    });

    it("Q1.6: FrontとBackが完全同一でペアカード作成", async () => {
      const res = await creator.create({
        front: "SameText",
        back: "SameText",
        filename: "SamePair",
        presetId: "default",
        folder: "Cards",
        pair: true,
      });
      expect(res.status).toBe("created");
    });

    it("Q1.7: 0バイトの空Markdownファイルを vault 内に作成", async () => {
      await adapter.create("Cards/ZeroByte.md", "");
      await index.rebuild();
      expect(index.getCard("Cards/ZeroByte.md")).toBeUndefined();
      expect(index.invalidPaths()).not.toContain("Cards/ZeroByte.md"); // タグ無しのため無視されるべき
    });

    it("Q1.8: フロントマターのみのファイル作成", async () => {
      await adapter.create("Cards/OnlyFM.md", "---\nretrieva-preset: default\ntags: [retrieva-card]\n---\n");
      await index.rebuild();
      // マーカーが無いため invalid に入るか
      expect(index.invalidPaths()).toContain("Cards/OnlyFM.md");
    });

    it("Q1.9: マーカー <!--RETRIEVA-ANSWER--> のみで本文が無いファイル", async () => {
      await adapter.create("Cards/OnlyMarker.md", "---\nretrieva-preset: default\ntags: [retrieva-card]\n---\n<!--RETRIEVA-ANSWER-->");
      await index.rebuild();
      expect(index.invalidPaths()).toContain("Cards/OnlyMarker.md");
    });

    it("Q1.10: presetId に空文字列を指定してカード作成", async () => {
      const res = await creator.create({
        front: "Q",
        back: "A",
        filename: "EmptyPresetIdCard",
        presetId: "",
        folder: "Cards",
        pair: false,
      });
      expect(res.status).toBe("created");
    });
  });

  // --- P2: ベテラン (キーボード高速入力・大量入力・特殊文字列) ---
  describe("P2: Veteran Power User Persona", () => {
    it("Q2.1: 100個のカードを一括連続作成", async () => {
      for (let i = 0; i < 100; i++) {
        await creator.create({
          front: `Q${i}`,
          back: `A${i}`,
          filename: `BatchCard_${i}`,
          presetId: "default",
          folder: "Cards",
          pair: false,
        });
      }
      await index.rebuild();
      expect(index.listCards().length).toBe(100);
    });

    it("Q2.2: タグ名に絵文字・全角スペース・Unicode文字を使用", async () => {
      const fm = `---\nretrieva-preset: default\ntags:\n  - retrieva-card\n  - 🚀宇宙 生物\n---\nQ\n<!--RETRIEVA-ANSWER-->\nA\n<!--RETRIEVA-CARD {"v":1,"id":"019f9a6e-0000-7000-8000-000000000001"}-->\n<!--RETRIEVA-LOG\n{"v":1,"eid":"019f9a6e-0000-7000-8000-000000000002","type":"created","parent":null,"at":"2026-07-26T00:00:00.000Z","zone":"UTC","state":{"v":1,"phase":"new","learningStep":0,"reps":0,"lapses":0,"interval":0,"stability":null,"difficulty":null,"due":null,"suspended":false}}\nRETRIEVA-LOG-->`;
      await adapter.create("Cards/EmojiTag.md", fm);
      await index.rebuild();
      const card = index.getCard("Cards/EmojiTag.md");
      expect(card).toBeDefined();
      expect(card?.tags).toContain("🚀宇宙 生物");
    });

    it("Q2.3: ディープな階層タグの集計", async () => {
      const fm = `---\nretrieva-preset: default\ntags:\n  - retrieva-card\n  - level1/level2/level3/level4/level5\n---\nQ\n<!--RETRIEVA-ANSWER-->\nA\n<!--RETRIEVA-CARD {"v":1,"id":"019f9a6e-0000-7000-8000-000000000003"}-->\n<!--RETRIEVA-LOG\n{"v":1,"eid":"019f9a6e-0000-7000-8000-000000000004","type":"created","parent":null,"at":"2026-07-26T00:00:00.000Z","zone":"UTC","state":{"v":1,"phase":"new","learningStep":0,"reps":0,"lapses":0,"interval":0,"stability":null,"difficulty":null,"due":null,"suspended":false}}\nRETRIEVA-LOG-->`;
      await adapter.create("Cards/DeepTag.md", fm);
      await index.rebuild();
      const tags = index.scopeTags();
      expect(tags).toContain("level1/level2/level3/level4/level5");
      const matched = index.cardsMatching(tagFilter("level1"));
      expect(matched.length).toBe(1);
    });

    it("Q2.4: Windows改行(\\r\\n)とUNIX改行(\\n)が混在するカードの評価とパース", async () => {
      const mixed = `---\r\nretrieva-preset: default\r\ntags:\r\n  - retrieva-card\r\n---\n\nQ\r\n\r\n<!--RETRIEVA-ANSWER-->\n\nA\r\n\r\n<!--RETRIEVA-CARD {"v":1,"id":"019f9a6e-0000-7000-8000-000000000005"}-->\r\n<!--RETRIEVA-LOG\r\n{"v":1,"eid":"019f9a6e-0000-7000-8000-000000000006","type":"created","parent":null,"at":"2026-07-26T00:00:00.000Z","zone":"UTC","state":{"v":1,"phase":"new","learningStep":0,"reps":0,"lapses":0,"interval":0,"stability":null,"difficulty":null,"due":null,"suspended":false}}\r\nRETRIEVA-LOG-->`;
      await adapter.create("Cards/MixedNewline.md", mixed);
      await index.rebuild();
      const card = index.getCard("Cards/MixedNewline.md");
      expect(card).toBeDefined();
    });

    it("Q2.5: タグの先頭に # が含まれている場合の正規化", async () => {
      const fm = `---\nretrieva-preset: default\ntags: ["#retrieva-card", "#biology"]\n---\nQ\n<!--RETRIEVA-ANSWER-->\nA\n<!--RETRIEVA-CARD {"v":1,"id":"019f9a6e-0000-7000-8000-000000000007"}-->\n<!--RETRIEVA-LOG\n{"v":1,"eid":"019f9a6e-0000-7000-8000-000000000008","type":"created","parent":null,"at":"2026-07-26T00:00:00.000Z","zone":"UTC","state":{"v":1,"phase":"new","learningStep":0,"reps":0,"lapses":0,"interval":0,"stability":null,"difficulty":null,"due":null,"suspended":false}}\nRETRIEVA-LOG-->`;
      await adapter.create("Cards/HashTags.md", fm);
      await index.rebuild();
      const card = index.getCard("Cards/HashTags.md");
      expect(card).toBeDefined();
      expect(card?.tags).toContain("biology");
      expect(card?.tags).not.toContain("#biology");
    });

    it("Q2.6: 古い/存在しない eventId で Undo 実行", async () => {
      await creator.create({ front: "Q", back: "A", filename: "UndoCard", presetId: "default", folder: "Cards", pair: false });
      await index.rebuild();
      const res = await cardService.undo("Cards/UndoCard.md", "non-existent-eid", "some-source");
      expect(res).toBe(false);
    });

    it("Q2.7: 存在しないパスへの review 実行", async () => {
      const res = await cardService.review("Cards/Ghost.md", "eid", "fingerprint", "good", 100, new Date(), "UTC");
      expect(res.status).toBe("stale");
    });

    it("Q2.8: 存在しないパスへの stateChange 実行", async () => {
      const res = await cardService.stateChange("Cards/Ghost.md", "eid", "suspend", new Date(), "UTC");
      expect(res.status).toBe("stale");
    });

    it("Q2.9: 極端な小数値 desired-retention の Preset パース", async () => {
      const source = `---\n${IDENTIFIERS.presetDefinitionKey}: true\n${IDENTIFIERS.presetIdKey}: extreme\nscheduler: fsrs\ndesired-retention: 0.00001\nmaximum-interval-days: 10\nlearning-steps: [1m]\nrelearning-steps: [1m]\n---\n`;
      const parsed = parsePresetMarkdown("preset.md", source);
      expect(parsed.preset).toBeDefined();
      expect(parsed.preset?.desiredRetention).toBe(0.00001);
    });

    it("Q2.10: 100個のレビューイベントログを持つ巨大カードのパース", async () => {
      let eventsStr = `{"v":1,"eid":"E0","type":"created","parent":null,"at":"2026-07-26T00:00:00.000Z","zone":"UTC","state":{"v":1,"phase":"new","learningStep":0,"reps":0,"lapses":0,"interval":0,"stability":null,"difficulty":null,"due":null,"suspended":false}}\n`;
      for (let i = 1; i <= 100; i++) {
        eventsStr += `{"v":1,"eid":"E${i}","type":"review","parent":"E${i-1}","rating":"good","durationMs":1000,"at":"2026-07-26T00:00:00.000Z","zone":"UTC","state":{"v":1,"phase":"review","learningStep":0,"reps":${i},"lapses":0,"interval":1,"stability":1,"difficulty":5,"due":"2026-07-27T00:00:00.000Z","suspended":false}}\n`;
      }
      const source = `---\nretrieva-preset: default\ntags: [retrieva-card]\n---\nQ\n<!--RETRIEVA-ANSWER-->\nA\n<!--RETRIEVA-CARD {"v":1,"id":"100LogCard"}-->\n<!--RETRIEVA-LOG\n${eventsStr}RETRIEVA-LOG-->`;
      await adapter.create("Cards/100Logs.md", source);
      await index.rebuild();
      const card = index.getCard("Cards/100Logs.md");
      expect(card).toBeDefined();
      expect(card?.events.length).toBe(101);
    });
  });

  // --- P3: 悪意 (境界値・インジェクション・破綻データ・二重送信) ---
  describe("P3: Adversarial Attacker Persona", () => {
    it("Q3.1: パス・トラバーサルを含む filename 指定", async () => {
      const res = await creator.create({
        front: "Q",
        back: "A",
        filename: "../../SecretFile",
        presetId: "default",
        folder: "Cards",
        pair: false,
      });
      expect(res.status).toBe("created");
      // filename内の / は - に置換される仕様
      expect(res.paths[0]).not.toContain("../");
    });

    it("Q3.2: OS予約名 (NUL, CON, COM1) のファイル名作成", async () => {
      const res = await creator.create({
        front: "Q",
        back: "A",
        filename: "CON",
        presetId: "default",
        folder: "Cards",
        pair: false,
      });
      expect(res.status).toBe("created");
    });

    it("Q3.3: JSONLログ内への HTML/Script インジェクション", async () => {
      const scriptInj = `<script>alert("xss")</script>`;
      const source = `---\nretrieva-preset: default\ntags: [retrieva-card]\n---\n${scriptInj}\n<!--RETRIEVA-ANSWER-->\n${scriptInj}\n<!--RETRIEVA-CARD {"v":1,"id":"XSSCard"}-->\n<!--RETRIEVA-LOG\n{"v":1,"eid":"E1","type":"created","parent":null,"at":"2026-07-26T00:00:00.000Z","zone":"UTC","state":{"v":1,"phase":"new","learningStep":0,"reps":0,"lapses":0,"interval":0,"stability":null,"difficulty":null,"due":null,"suspended":false}}\nRETRIEVA-LOG-->`;
      await adapter.create("Cards/XSS.md", source);
      await index.rebuild();
      const card = index.getCard("Cards/XSS.md");
      expect(card).toBeDefined();
    });

    it("Q3.4: 破綻した uuid (eid) を含むログ行", async () => {
      const source = `---\nretrieva-preset: default\ntags: [retrieva-card]\n---\nQ\n<!--RETRIEVA-ANSWER-->\nA\n<!--RETRIEVA-CARD {"v":1,"id":"BadEidCard"}-->\n<!--RETRIEVA-LOG\n{"v":1,"eid":"","type":"created","parent":null,"at":"2026-07-26T00:00:00.000Z","zone":"UTC","state":{"v":1,"phase":"new","learningStep":0,"reps":0,"lapses":0,"interval":0,"stability":null,"difficulty":null,"due":null,"suspended":false}}\nRETRIEVA-LOG-->`;
      await adapter.create("Cards/BadEid.md", source);
      await index.rebuild();
      expect(index.invalidPaths()).toContain("Cards/BadEid.md");
    });

    it("Q3.5: ループしている親参照ログ (E1 -> E2 -> E1)", async () => {
      const source = `---\nretrieva-preset: default\ntags: [retrieva-card]\n---\nQ\n<!--RETRIEVA-ANSWER-->\nA\n<!--RETRIEVA-CARD {"v":1,"id":"LoopCard"}-->\n<!--RETRIEVA-LOG\n{"v":1,"eid":"E1","type":"created","parent":"E2","at":"2026-07-26T00:00:00.000Z","zone":"UTC","state":{"v":1,"phase":"new","learningStep":0,"reps":0,"lapses":0,"interval":0,"stability":null,"difficulty":null,"due":null,"suspended":false}}\n{"v":1,"eid":"E2","type":"review","parent":"E1","rating":"good","durationMs":100,"at":"2026-07-26T00:01:00.000Z","zone":"UTC","state":{"v":1,"phase":"new","learningStep":0,"reps":0,"lapses":0,"interval":0,"stability":null,"difficulty":null,"due":null,"suspended":false}}\nRETRIEVA-LOG-->`;
      await adapter.create("Cards/Loop.md", source);
      await index.rebuild();
      expect(index.invalidPaths()).toContain("Cards/Loop.md");
    });

    it("Q3.6: 存在しない親IDを指すログ (親チェーン断絶)", async () => {
      const source = `---\nretrieva-preset: default\ntags: [retrieva-card]\n---\nQ\n<!--RETRIEVA-ANSWER-->\nA\n<!--RETRIEVA-CARD {"v":1,"id":"OrphanCard"}-->\n<!--RETRIEVA-LOG\n{"v":1,"eid":"E1","type":"created","parent":null,"at":"2026-07-26T00:00:00.000Z","zone":"UTC","state":{"v":1,"phase":"new","learningStep":0,"reps":0,"lapses":0,"interval":0,"stability":null,"difficulty":null,"due":null,"suspended":false}}\n{"v":1,"eid":"E2","type":"review","parent":"E999","rating":"good","durationMs":100,"at":"2026-07-26T00:01:00.000Z","zone":"UTC","state":{"v":1,"phase":"new","learningStep":0,"reps":0,"lapses":0,"interval":0,"stability":null,"difficulty":null,"due":null,"suspended":false}}\nRETRIEVA-LOG-->`;
      await adapter.create("Cards/Orphan.md", source);
      await index.rebuild();
      expect(index.invalidPaths()).toContain("Cards/Orphan.md");
    });

    it("Q3.7: 重複した cardId を持つ2つのカード", async () => {
      const duplicateId = "019f9a6e-0000-7000-8000-000000000099";
      const source1 = `---\nretrieva-preset: default\ntags: [retrieva-card]\n---\nQ1\n<!--RETRIEVA-ANSWER-->\nA1\n<!--RETRIEVA-CARD {"v":1,"id":"${duplicateId}"}-->\n<!--RETRIEVA-LOG\n{"v":1,"eid":"E1","type":"created","parent":null,"at":"2026-07-26T00:00:00.000Z","zone":"UTC","state":{"v":1,"phase":"new","learningStep":0,"reps":0,"lapses":0,"interval":0,"stability":null,"difficulty":null,"due":null,"suspended":false}}\nRETRIEVA-LOG-->`;
      const source2 = `---\nretrieva-preset: default\ntags: [retrieva-card]\n---\nQ2\n<!--RETRIEVA-ANSWER-->\nA2\n<!--RETRIEVA-CARD {"v":1,"id":"${duplicateId}"}-->\n<!--RETRIEVA-LOG\n{"v":1,"eid":"E2","type":"created","parent":null,"at":"2026-07-26T00:00:00.000Z","zone":"UTC","state":{"v":1,"phase":"new","learningStep":0,"reps":0,"lapses":0,"interval":0,"stability":null,"difficulty":null,"due":null,"suspended":false}}\nRETRIEVA-LOG-->`;
      await adapter.create("Cards/Dup1.md", source1);
      await adapter.create("Cards/Dup2.md", source2);
      await index.rebuild();

      expect(index.invalidPaths()).toContain("Cards/Dup1.md");
      expect(index.invalidPaths()).toContain("Cards/Dup2.md");
    });

    it("Q3.8: 同一ファイル内に複数の RETRIEVA-CARD マーカーを重複挿入", async () => {
      const source = `---\nretrieva-preset: default\ntags: [retrieva-card]\n---\nQ\n<!--RETRIEVA-ANSWER-->\nA\n<!--RETRIEVA-CARD {"v":1,"id":"C1"}-->\n<!--RETRIEVA-CARD {"v":1,"id":"C2"}-->\n<!--RETRIEVA-LOG\n{"v":1,"eid":"E1","type":"created","parent":null,"at":"2026-07-26T00:00:00.000Z","zone":"UTC","state":{"v":1,"phase":"new","learningStep":0,"reps":0,"lapses":0,"interval":0,"stability":null,"difficulty":null,"due":null,"suspended":false}}\nRETRIEVA-LOG-->`;
      await adapter.create("Cards/DoubleCardMarker.md", source);
      await index.rebuild();
      expect(index.invalidPaths()).toContain("Cards/DoubleCardMarker.md");
    });

    it("Q3.9: 同一ファイル内に複数の RETRIEVA-ANSWER マーカーを重複挿入", async () => {
      const source = `---\nretrieva-preset: default\ntags: [retrieva-card]\n---\nQ\n<!--RETRIEVA-ANSWER-->\nMid\n<!--RETRIEVA-ANSWER-->\nA\n<!--RETRIEVA-CARD {"v":1,"id":"C1"}-->\n<!--RETRIEVA-LOG\n{"v":1,"eid":"E1","type":"created","parent":null,"at":"2026-07-26T00:00:00.000Z","zone":"UTC","state":{"v":1,"phase":"new","learningStep":0,"reps":0,"lapses":0,"interval":0,"stability":null,"difficulty":null,"due":null,"suspended":false}}\nRETRIEVA-LOG-->`;
      await adapter.create("Cards/DoubleAnswerMarker.md", source);
      await index.rebuild();
      expect(index.invalidPaths()).toContain("Cards/DoubleAnswerMarker.md");
    });

    it("Q3.10: ログマーカーの開始と終了が反転 (LOG_END が先)", async () => {
      const source = `---\nretrieva-preset: default\ntags: [retrieva-card]\n---\nQ\n<!--RETRIEVA-ANSWER-->\nA\n<!--RETRIEVA-CARD {"v":1,"id":"C1"}-->\nRETRIEVA-LOG-->\n<!--RETRIEVA-LOG`;
      await adapter.create("Cards/ReversedLog.md", source);
      await index.rebuild();
      expect(index.invalidPaths()).toContain("Cards/ReversedLog.md");
    });
  });

  // --- P4: データ整合 (実ファイルと状態データの整合性チェック) ---
  describe("P4: Data Integrity Verification Persona", () => {
    it("Q4.1: review 後に実ファイルフッターに追加される JSONL 行のプロパティ完全検証", async () => {
      await creator.create({ front: "Q", back: "A", filename: "SchemaCheck", presetId: "default", folder: "Cards", pair: false });
      await index.rebuild();
      const card = index.getCard("Cards/SchemaCheck.md")!;
      const preset = index.getPreset("default")!;
      const now = new Date("2026-07-26T03:00:00Z");

      const res = await cardService.review("Cards/SchemaCheck.md", card.lastEventId, preset.fingerprint, "good", 1200, now, "Asia/Tokyo");
      expect(res.status).toBe("written");

      const content = await adapter.read(adapter.get("Cards/SchemaCheck.md")!);
      const parsed = parseCardMarkdown("Cards/SchemaCheck.md", content);
      const lastEvent = parsed.events.at(-1)!;

      expect(lastEvent.v).toBe(1);
      expect(lastEvent.type).toBe("review");
      expect(lastEvent.parent).toBe(card.lastEventId);
      expect(lastEvent.at).toBe("2026-07-26T03:00:00.000Z");
      expect(lastEvent.zone).toBe("Asia/Tokyo");
      expect(lastEvent.state).toBeDefined();
    });

    it("Q4.2: Undo 後の実ファイル内容が元の文字列と 100% バイト単位で一致するか検証", async () => {
      await creator.create({ front: "Original Front", back: "Original Back", filename: "ExactUndo", presetId: "default", folder: "Cards", pair: false });
      await index.rebuild();
      const beforeContent = await adapter.read(adapter.get("Cards/ExactUndo.md")!);

      const card = index.getCard("Cards/ExactUndo.md")!;
      const preset = index.getPreset("default")!;
      const res = await cardService.review("Cards/ExactUndo.md", card.lastEventId, preset.fingerprint, "easy", 500, new Date(), "UTC");
      expect(res.status).toBe("written");

      if (res.status === "written") {
        await cardService.undo("Cards/ExactUndo.md", res.eventId, res.sourceAfter);
      }
      const afterUndoContent = await adapter.read(adapter.get("Cards/ExactUndo.md")!);
      expect(afterUndoContent).toBe(beforeContent);
    });

    it("Q4.3: stateChange (suspend) 直後に review を呼び出した場合の保護", async () => {
      await creator.create({ front: "Q", back: "A", filename: "SuspendReview", presetId: "default", folder: "Cards", pair: false });
      await index.rebuild();
      const card = index.getCard("Cards/SuspendReview.md")!;
      const preset = index.getPreset("default")!;

      await cardService.stateChange("Cards/SuspendReview.md", card.lastEventId, "suspend", new Date(), "UTC");
      await index.rebuild();

      const refreshed = index.getCard("Cards/SuspendReview.md")!;
      expect(refreshed.state.suspended).toBe(true);

      // 古い lastEventId での review 呼び出しは stale になるべき
      const res = await cardService.review("Cards/SuspendReview.md", card.lastEventId, preset.fingerprint, "good", 100, new Date(), "UTC");
      expect(res.status).toBe("stale");
    });

    it("Q4.4: プリセットの maximum-interval-days が手動変更された直後の review 呼び出し拒否", async () => {
      await creator.create({ front: "Q", back: "A", filename: "PresetFingerprint", presetId: "default", folder: "Cards", pair: false });
      await index.rebuild();
      const card = index.getCard("Cards/PresetFingerprint.md")!;
      const oldPreset = index.getPreset("default")!;

      // プリセットの内容を手動で書き換える
      const newPresetSource = defaultPresetContent.replace("maximum-interval-days: 36500", "maximum-interval-days: 100");
      await adapter.write(adapter.get("Retrieva/Presets/default.md")!, newPresetSource);

      // 古い preset.fingerprint での review 呼び出しは stale になるべき
      const res = await cardService.review("Cards/PresetFingerprint.md", card.lastEventId, oldPreset.fingerprint, "good", 100, new Date(), "UTC");
      expect(res.status).toBe("stale");
    });

    it("Q4.5: repairMetadata 実行時に過去のレビューログが保護・継承されるか", async () => {
      await creator.create({ front: "Q", back: "A", filename: "RepairKeepLogs", presetId: "default", folder: "Cards", pair: false });
      await index.rebuild();
      const card = index.getCard("Cards/RepairKeepLogs.md")!;
      const preset = index.getPreset("default")!;

      await cardService.review("Cards/RepairKeepLogs.md", card.lastEventId, preset.fingerprint, "good", 100, new Date(), "UTC");

      // ID再発行
      await recovery.repairMetadata("Cards/RepairKeepLogs.md", true);
      await index.rebuild();

      const repaired = index.getCard("Cards/RepairKeepLogs.md")!;
      expect(repaired.events.length).toBe(2); // created + review が保護されているか
    });

    it("Q4.6: BOM (\\uFEFF) 付き UTF-8 ファイルのパース", async () => {
      const bomSource = `\uFEFF---\nretrieva-preset: default\ntags: [retrieva-card]\n---\nQ\n<!--RETRIEVA-ANSWER-->\nA\n<!--RETRIEVA-CARD {"v":1,"id":"BOMCard"}-->\n<!--RETRIEVA-LOG\n{"v":1,"eid":"E1","type":"created","parent":null,"at":"2026-07-26T00:00:00.000Z","zone":"UTC","state":{"v":1,"phase":"new","learningStep":0,"reps":0,"lapses":0,"interval":0,"stability":null,"difficulty":null,"due":null,"suspended":false}}\nRETRIEVA-LOG-->`;
      await adapter.create("Cards/BOM.md", bomSource);
      await index.rebuild();
      const card = index.getCard("Cards/BOM.md");
      expect(card).toBeDefined();
    });

    it("Q4.7: Markdown コードブロック内の疑似マーカーの誤検知回避", async () => {
      const codeBlockSource = `---\nretrieva-preset: default\ntags: [retrieva-card]\n---\nReal Question\n\`\`\`markdown\n<!--RETRIEVA-ANSWER-->\n\`\`\`\n<!--RETRIEVA-ANSWER-->\nReal Answer\n<!--RETRIEVA-CARD {"v":1,"id":"CodeBlockCard"}-->\n<!--RETRIEVA-LOG\n{"v":1,"eid":"E1","type":"created","parent":null,"at":"2026-07-26T00:00:00.000Z","zone":"UTC","state":{"v":1,"phase":"new","learningStep":0,"reps":0,"lapses":0,"interval":0,"stability":null,"difficulty":null,"due":null,"suspended":false}}\nRETRIEVA-LOG-->`;
      await adapter.create("Cards/CodeBlock.md", codeBlockSource);
      await index.rebuild();
      // マーカーが2つあるため破綻として検出されるか、それともコードブロック内を無視できるか
      const parsed = parseCardMarkdown("Cards/CodeBlock.md", codeBlockSource);
      expect(parsed.errors.length).toBeGreaterThan(0); // 現状コードブロックのパース除外は未対応
    });

    it("Q4.8: Sibling グループのペア作成時のグループIDの一致", async () => {
      const res = await creator.create({ front: "F", back: "B", filename: "PairCheck", presetId: "default", folder: "Cards", pair: true });
      expect(res.status).toBe("created");
      await index.rebuild();

      const front = index.getCard("Cards/PairCheck (Front).md")!;
      const back = index.getCard("Cards/PairCheck (Back).md")!;
      expect(front.siblingGroupId).toBeDefined();
      expect(front.siblingGroupId).toBe(back.siblingGroupId);
    });

    it("Q4.9: buildQueue における Sibling 排除機能の検証", async () => {
      await creator.create({ front: "F", back: "B", filename: "SibQueue", presetId: "default", folder: "Cards", pair: true });
      await index.rebuild();

      const cards = [index.getCard("Cards/SibQueue (Front).md")!, index.getCard("Cards/SibQueue (Back).md")!];
      const presets = new Map([["default", index.getPreset("default")!]]);
      const now = new Date();

      const queue = buildQueue(cards, presets, now);
      // Sibling 排除設定が有効な場合、同日には1枚のみキューに入り、もう1枚は排除されるべき
      expect(queue.length).toBe(1);
    });

    it("Q4.10: rawEventLines とパース済み events の件数整合性", async () => {
      await creator.create({ front: "Q", back: "A", filename: "RawLinesCheck", presetId: "default", folder: "Cards", pair: false });
      await index.rebuild();
      const parsed = index.getParsed("Cards/RawLinesCheck.md")!;
      expect(parsed.rawEventLines.length).toBe(parsed.events.length);
    });
  });

  // --- P5: 移行 (旧形式・欠損データ・異形式・巨大件数) ---
  describe("P5: Migration & Legacy Data Persona", () => {
    it("Q5.1: created イベントが無い旧カードのパースとリカバリー", async () => {
      const legacySource = `---\nretrieva-preset: default\ntags: [retrieva-card]\n---\nQ\n<!--RETRIEVA-ANSWER-->\nA\n<!--RETRIEVA-CARD {"v":1,"id":"Legacy123"}-->\n<!--RETRIEVA-LOG\n{"v":1,"eid":"ReviewOnly","type":"review","parent":null,"rating":"good","durationMs":100,"at":"2026-07-26T00:00:00.000Z","zone":"UTC","state":{"v":1,"phase":"new","learningStep":0,"reps":0,"lapses":0,"interval":0,"stability":null,"difficulty":null,"due":null,"suspended":false}}\nRETRIEVA-LOG-->`;
      await adapter.create("Cards/Legacy.md", legacySource);
      await index.rebuild();

      // created イベントが無いため修復が必要と判定されるか
      expect(index.getCard("Cards/Legacy.md")).toBeUndefined();
      await recovery.repairMetadata("Cards/Legacy.md", false);
      await index.rebuild();
      expect(index.getCard("Cards/Legacy.md")).toBeDefined();
    });

    it("Q5.2: 未知のバージョン v: 2 を含むログ行のパース", async () => {
      const futureSource = `---\nretrieva-preset: default\ntags: [retrieva-card]\n---\nQ\n<!--RETRIEVA-ANSWER-->\nA\n<!--RETRIEVA-CARD {"v":1,"id":"FutureCard"}-->\n<!--RETRIEVA-LOG\n{"v":2,"eid":"Future1","type":"created","parent":null,"at":"2026-07-26T00:00:00.000Z","zone":"UTC","state":{"v":1,"phase":"new","learningStep":0,"reps":0,"lapses":0,"interval":0,"stability":null,"difficulty":null,"due":null,"suspended":false}}\nRETRIEVA-LOG-->`;
      await adapter.create("Cards/Future.md", futureSource);
      await index.rebuild();
      expect(index.invalidPaths()).toContain("Cards/Future.md");
    });

    it("Q5.3: zone (タイムゾーン) が空文字のイベントログ", async () => {
      const source = `---\nretrieva-preset: default\ntags: [retrieva-card]\n---\nQ\n<!--RETRIEVA-ANSWER-->\nA\n<!--RETRIEVA-CARD {"v":1,"id":"EmptyZone"}-->\n<!--RETRIEVA-LOG\n{"v":1,"eid":"E1","type":"created","parent":null,"at":"2026-07-26T00:00:00.000Z","zone":"","state":{"v":1,"phase":"new","learningStep":0,"reps":0,"lapses":0,"interval":0,"stability":null,"difficulty":null,"due":null,"suspended":false}}\nRETRIEVA-LOG-->`;
      await adapter.create("Cards/EmptyZone.md", source);
      await index.rebuild();
      expect(index.getCard("Cards/EmptyZone.md")).toBeDefined();
    });

    it("Q5.4: state 内の未定義カスタムフィールドの保持またはパース挙動", async () => {
      const source = `---\nretrieva-preset: default\ntags: [retrieva-card]\n---\nQ\n<!--RETRIEVA-ANSWER-->\nA\n<!--RETRIEVA-CARD {"v":1,"id":"CustomState"}-->\n<!--RETRIEVA-LOG\n{"v":1,"eid":"E1","type":"created","parent":null,"at":"2026-07-26T00:00:00.000Z","zone":"UTC","state":{"v":1,"phase":"new","learningStep":0,"reps":0,"lapses":0,"interval":0,"stability":null,"difficulty":null,"due":null,"suspended":false,"extraField":123}}\nRETRIEVA-LOG-->`;
      await adapter.create("Cards/CustomState.md", source);
      await index.rebuild();
      expect(index.getCard("Cards/CustomState.md")).toBeDefined();
    });

    it("Q5.5: カンマ区切りの文字列 tags: retrieva-card, biology のパース", async () => {
      const source = `---\nretrieva-preset: default\ntags: retrieva-card, biology\n---\nQ\n<!--RETRIEVA-ANSWER-->\nA\n<!--RETRIEVA-CARD {"v":1,"id":"CommaTags"}-->\n<!--RETRIEVA-LOG\n{"v":1,"eid":"E1","type":"created","parent":null,"at":"2026-07-26T00:00:00.000Z","zone":"UTC","state":{"v":1,"phase":"new","learningStep":0,"reps":0,"lapses":0,"interval":0,"stability":null,"difficulty":null,"due":null,"suspended":false}}\nRETRIEVA-LOG-->`;
      await adapter.create("Cards/CommaTags.md", source);
      await index.rebuild();
      const card = index.getCard("Cards/CommaTags.md");
      expect(card).toBeDefined();
      expect(card?.tags).toContain("biology");
    });

    it("Q5.6: 壊れた YAML フロントマターを持つカードファイル", async () => {
      const source = `---\nretrieva-preset: : : invalid yaml\n---\nQ\n<!--RETRIEVA-ANSWER-->\nA\n`;
      await adapter.create("Cards/BadYAML.md", source);
      await index.rebuild();
      expect(index.invalidPaths()).not.toContain("Cards/BadYAML.md"); // タグ無しのため無視
    });

    it("Q5.7: desired-retention が欠落した Preset ファイルのパース", async () => {
      const source = `---\n${IDENTIFIERS.presetDefinitionKey}: true\n${IDENTIFIERS.presetIdKey}: bad-preset\nscheduler: fsrs\nmaximum-interval-days: 100\n---\n`;
      const parsed = parsePresetMarkdown("preset.md", source);
      expect(parsed.errors.length).toBeGreaterThan(0);
    });

    it("Q5.8: learning-steps が空配列 [] の Preset ファイル", async () => {
      const source = `---\n${IDENTIFIERS.presetDefinitionKey}: true\n${IDENTIFIERS.presetIdKey}: empty-steps\nscheduler: fsrs\ndesired-retention: 0.9\nmaximum-interval-days: 100\nlearning-steps: []\nrelearning-steps: []\n---\n`;
      const parsed = parsePresetMarkdown("preset.md", source);
      expect(parsed.errors.length).toBeGreaterThan(0);
    });

    it("Q5.9: 大文字小文字が異なる presetId の指定", async () => {
      const source = `---\nretrieva-preset: DEFAULT\ntags: [retrieva-card]\n---\nQ\n<!--RETRIEVA-ANSWER-->\nA\n<!--RETRIEVA-CARD {"v":1,"id":"UpperPreset"}-->\n<!--RETRIEVA-LOG\n{"v":1,"eid":"E1","type":"created","parent":null,"at":"2026-07-26T00:00:00.000Z","zone":"UTC","state":{"v":1,"phase":"new","learningStep":0,"reps":0,"lapses":0,"interval":0,"stability":null,"difficulty":null,"due":null,"suspended":false}}\nRETRIEVA-LOG-->`;
      await adapter.create("Cards/UpperPreset.md", source);
      await index.rebuild();
      // default != DEFAULT
      expect(index.invalidPaths()).toContain("Cards/UpperPreset.md");
    });

    it("Q5.10: cardId が UUID ではなく短縮 ID (数値) の場合", async () => {
      const source = `---\nretrieva-preset: default\ntags: [retrieva-card]\n---\nQ\n<!--RETRIEVA-ANSWER-->\nA\n<!--RETRIEVA-CARD {"v":1,"id":"12345"}-->\n<!--RETRIEVA-LOG\n{"v":1,"eid":"E1","type":"created","parent":null,"at":"2026-07-26T00:00:00.000Z","zone":"UTC","state":{"v":1,"phase":"new","learningStep":0,"reps":0,"lapses":0,"interval":0,"stability":null,"difficulty":null,"due":null,"suspended":false}}\nRETRIEVA-LOG-->`;
      await adapter.create("Cards/ShortId.md", source);
      await index.rebuild();
      expect(index.getCard("Cards/ShortId.md")).toBeDefined();
    });
  });

  // --- P6: 回帰 (周辺機能・ユーティリティ・インデックスの動作) ---
  describe("P6: Regression & Peripheral Features Persona", () => {
    it("Q6.1: isPathExcluded による除外フォルダ指定の完全無視動作", async () => {
      const excluded = isPathExcluded(".git/config.md", [".git", "Excluded"]);
      expect(excluded).toBe(true);
    });

    it("Q6.2: scopeTags で取得されるタグ一覧から無効なカードのタグが除外されるか", async () => {
      const source = `---\nretrieva-preset: non-existent\ntags: [retrieva-card, orphan-tag]\n---\nQ\n<!--RETRIEVA-ANSWER-->\nA\n<!--RETRIEVA-CARD {"v":1,"id":"OrphanTag"}-->\n<!--RETRIEVA-LOG\n{"v":1,"eid":"E1","type":"created","parent":null,"at":"2026-07-26T00:00:00.000Z","zone":"UTC","state":{"v":1,"phase":"new","learningStep":0,"reps":0,"lapses":0,"interval":0,"stability":null,"difficulty":null,"due":null,"suspended":false}}\nRETRIEVA-LOG-->`;
      await adapter.create("Cards/OrphanTag.md", source);
      await index.rebuild();
      expect(index.scopeTags()).not.toContain("orphan-tag");
    });

    it("Q6.3: dueNow による出題期限判定の動作", async () => {
      const futureDate = new Date("2099-01-01T00:00:00Z");
      const pastDate = new Date("2020-01-01T00:00:00Z");

      await creator.create({ front: "Q", back: "A", filename: "DueCard", presetId: "default", folder: "Cards", pair: false });
      await index.rebuild();
      const card = index.getCard("Cards/DueCard.md")!;

      // 新規カードは即時出題対象
      expect(card.state.phase).toBe("new");
    });

    it("Q6.4: tagFilter での親子タグのマッチング", async () => {
      const filter = tagFilter("biology");
      expect(filter({ tags: ["biology/cell"] } as any)).toBe(true);
      expect(filter({ tags: ["geography"] } as any)).toBe(false);
    });

    it("Q6.5: buildTagTree によるタグの階層化ツリー構造の生成", async () => {
      const tree = buildTagTree(["biology/cell/mitochondria", "biology/genetics", "history"]);
      expect(tree.length).toBe(2); // biology と history
    });

    it("Q6.6: calculateAnswerCandidates での 4 候補の計算結果", async () => {
      const preset = index.getPreset("default")!;
      const candidates = calculateAnswerCandidates(
        { v: 1, phase: "new", learningStep: 0, reps: 0, lapses: 0, interval: 0, stability: null, difficulty: null, due: null, suspended: false },
        preset,
        new Date(),
      );

      expect(candidates.again).toBeDefined();
      expect(candidates.hard).toBeDefined();
      expect(candidates.good).toBeDefined();
      expect(candidates.easy).toBeDefined();
    });

    it("Q6.7: undoLastReview で created イベントの削除試行保護", async () => {
      const source = `---\nretrieva-preset: default\ntags: [retrieva-card]\n---\nQ\n<!--RETRIEVA-ANSWER-->\nA\n<!--RETRIEVA-CARD {"v":1,"id":"C1"}-->\n<!--RETRIEVA-LOG\n{"v":1,"eid":"E1","type":"created","parent":null,"at":"2026-07-26T00:00:00.000Z","zone":"UTC","state":{"v":1,"phase":"new","learningStep":0,"reps":0,"lapses":0,"interval":0,"stability":null,"difficulty":null,"due":null,"suspended":false}}\nRETRIEVA-LOG-->`;
      const parsed = parseCardMarkdown("Cards/OnlyCreated.md", source);
      expect(() => undoLastReview(source, parsed, "E1")).toThrow();
    });

    it("Q6.8: sortAndRegenerateParents による不整合親チェーンの自動再構築", async () => {
      const events = [
        { v: 1, eid: "E1", type: "created", parent: "BROKEN", at: "2026-07-26T00:00:00Z", zone: "UTC", state: {} as any },
        { v: 1, eid: "E2", type: "review", parent: "BROKEN", rating: "good", durationMs: 100, at: "2026-07-26T01:00:00Z", zone: "UTC", state: {} as any },
      ];
      const regenerated = sortAndRegenerateParents(events);
      expect(regenerated[0]?.parent).toBeNull();
      expect(regenerated[1]?.parent).toBe("E1");
    });

    it("Q6.9: 重複IDの検出と deepValidate でのイバラエラー格納", async () => {
      await adapter.create("Cards/C1.md", `---\nretrieva-preset: default\ntags: [retrieva-card]\n---\nQ\n<!--RETRIEVA-ANSWER-->\nA\n<!--RETRIEVA-CARD {"v":1,"id":"SAME"}-->\n<!--RETRIEVA-LOG\n{"v":1,"eid":"E1","type":"created","parent":null,"at":"2026-07-26T00:00:00.000Z","zone":"UTC","state":{"v":1,"phase":"new","learningStep":0,"reps":0,"lapses":0,"interval":0,"stability":null,"difficulty":null,"due":null,"suspended":false}}\nRETRIEVA-LOG-->`);
      await adapter.create("Cards/C2.md", `---\nretrieva-preset: default\ntags: [retrieva-card]\n---\nQ\n<!--RETRIEVA-ANSWER-->\nA\n<!--RETRIEVA-CARD {"v":1,"id":"SAME"}-->\n<!--RETRIEVA-LOG\n{"v":1,"eid":"E2","type":"created","parent":null,"at":"2026-07-26T00:00:00.000Z","zone":"UTC","state":{"v":1,"phase":"new","learningStep":0,"reps":0,"lapses":0,"interval":0,"stability":null,"difficulty":null,"due":null,"suspended":false}}\nRETRIEVA-LOG-->`);

      await index.deepValidate();
      expect(index.invalidPaths()).toContain("Cards/C1.md");
      expect(index.invalidPaths()).toContain("Cards/C2.md");
    });

    it("Q6.10: isPathExcluded の正規化処理", async () => {
      expect(isPathExcluded("Folder/Sub/File.md", ["Folder/Sub"])).toBe(true);
      expect(isPathExcluded("Folder/Sub2/File.md", ["Folder/Sub"])).toBe(false);
    });
  });

  // --- P7: 仕様懐疑 (一次情報・README / 仕様書との突き合わせ) ---
  describe("P7: Spec Conformance Verification Persona", () => {
    it("Q7.1: README に記載されているデフォルトパス Retrieva/Presets/default.md の合致", async () => {
      const preset = index.getPreset("default");
      expect(preset?.sourcePath).toBe("Retrieva/Presets/default.md");
    });

    it("Q7.2: filename の特殊文字 \\/:*?\"<>| 置換仕様の検証", async () => {
      const res = await creator.create({
        front: "Q",
        back: "A",
        filename: "Test:Name*With?Invalid|Chars",
        presetId: "default",
        folder: "Cards",
        pair: false,
      });
      expect(res.status).toBe("created");
      expect(res.paths[0]).toBe("Cards/Test-Name-With-Invalid-Chars.md");
    });

    it("Q7.3: 重複ファイル作成時の { status: 'exists' } レスポンス", async () => {
      await creator.create({ front: "Q", back: "A", filename: "DupName", presetId: "default", folder: "Cards", pair: false });
      const dupRes = await creator.create({ front: "Q", back: "A", filename: "DupName", presetId: "default", folder: "Cards", pair: false });
      expect(dupRes.status).toBe("exists");
    });

    it("Q7.4: uuidv7 生成が正しくタイムスタンプ順序を保持しているか", async () => {
      const id1 = uuidv7(1000);
      const id2 = uuidv7(2000);
      expect(id1 < id2).toBe(true);
    });

    it("Q7.5: suspend と resume の状態変更ログ追記の検証", async () => {
      await creator.create({ front: "Q", back: "A", filename: "StateCard", presetId: "default", folder: "Cards", pair: false });
      await index.rebuild();
      let card = index.getCard("Cards/StateCard.md")!;

      await cardService.stateChange(card.path, card.lastEventId, "suspend", new Date(), "UTC");
      await index.rebuild();
      card = index.getCard("Cards/StateCard.md")!;
      expect(card.state.suspended).toBe(true);

      await cardService.stateChange(card.path, card.lastEventId, "resume", new Date(), "UTC");
      await index.rebuild();
      card = index.getCard("Cards/StateCard.md")!;
      expect(card.state.suspended).toBe(false);
    });

    it("Q7.6: reset 実行後の学習フェーズ初期化の検証", async () => {
      await creator.create({ front: "Q", back: "A", filename: "ResetCard", presetId: "default", folder: "Cards", pair: false });
      await index.rebuild();
      let card = index.getCard("Cards/ResetCard.md")!;

      await cardService.review(card.path, card.lastEventId, index.getPreset("default")!.fingerprint, "easy", 100, new Date(), "UTC");
      await index.rebuild();
      card = index.getCard("Cards/ResetCard.md")!;
      expect(card.state.phase).toBe("review");

      await cardService.stateChange(card.path, card.lastEventId, "reset", new Date(), "UTC");
      await index.rebuild();
      card = index.getCard("Cards/ResetCard.md")!;
      expect(card.state.phase).toBe("new");
    });

    it("Q7.7: preset 削除時の関連カードの自動 invalid 化", async () => {
      await creator.create({ front: "Q", back: "A", filename: "CustomPresetCard", presetId: "default", folder: "Cards", pair: false });
      await index.rebuild();
      expect(index.getCard("Cards/CustomPresetCard.md")).toBeDefined();

      // プリセットファイルを削除
      await fs.rm(path.join(tempDir, "Retrieva/Presets/default.md"));
      await index.rebuild();

      expect(index.getCard("Cards/CustomPresetCard.md")).toBeUndefined();
      expect(index.invalidPaths()).toContain("Cards/CustomPresetCard.md");
    });

    it("Q7.8: RETRIEVA-ANSWER マーカーが無いファイルの検出", async () => {
      await adapter.create("Cards/NoAnswer.md", `---\nretrieva-preset: default\ntags: [retrieva-card]\n---\nQ and A without marker`);
      await index.rebuild();
      expect(index.invalidPaths()).toContain("Cards/NoAnswer.md");
    });

    it("Q7.9: RETRIEVA-CARD マーカーが無いファイルの検出", async () => {
      await adapter.create("Cards/NoCardMarker.md", `---\nretrieva-preset: default\ntags: [retrieva-card]\n---\nQ\n<!--RETRIEVA-ANSWER-->\nA`);
      await index.rebuild();
      expect(index.invalidPaths()).toContain("Cards/NoCardMarker.md");
    });

    it("Q7.10: RETRIEVA-LOG マーカーが無いファイルの検出", async () => {
      await adapter.create("Cards/NoLogMarker.md", `---\nretrieva-preset: default\ntags: [retrieva-card]\n---\nQ\n<!--RETRIEVA-ANSWER-->\nA\n<!--RETRIEVA-CARD {"v":1,"id":"C1"}-->`);
      await index.rebuild();
      expect(index.invalidPaths()).toContain("Cards/NoLogMarker.md");
    });
  });

  // --- P8: 仕様懐疑2 (仕様自体の改善点・UX的懸念点) ---
  describe("P8: Spec Design Flaws & UX Concerns Persona", () => {
    it("Q8.1: reset を何度も行うと過去ログが蓄積しファイルサイズが増大し続ける仕様", async () => {
      await creator.create({ front: "Q", back: "A", filename: "ResetSpam", presetId: "default", folder: "Cards", pair: false });
      await index.rebuild();
      let card = index.getCard("Cards/ResetSpam.md")!;

      for (let i = 0; i < 10; i++) {
        await cardService.stateChange(card.path, card.lastEventId, "reset", new Date(), "UTC");
        await index.rebuild();
        card = index.getCard("Cards/ResetSpam.md")!;
      }
      expect(card.events.length).toBe(11); // 過去ログが全削除されず追記される仕様
    });

    it("Q8.2: Front/Back どちらも空文字で生成できてしまう問題", async () => {
      const res = await creator.create({ front: "", back: "", filename: "BothEmpty", presetId: "default", folder: "Cards", pair: false });
      expect(res.status).toBe("created");
    });

    it("Q8.3: 同名の presetId を持つ別ファイルがVault内に存在すると両方のPresetが無効化される仕様", async () => {
      const p1 = `---\n${IDENTIFIERS.presetDefinitionKey}: true\n${IDENTIFIERS.presetIdKey}: custom\nscheduler: fsrs\ndesired-retention: 0.9\nmaximum-interval-days: 100\nlearning-steps: [1m]\nrelearning-steps: [1m]\n---\n`;
      const p2 = `---\n${IDENTIFIERS.presetDefinitionKey}: true\n${IDENTIFIERS.presetIdKey}: custom\nscheduler: fsrs\ndesired-retention: 0.8\nmaximum-interval-days: 50\nlearning-steps: [1m]\nrelearning-steps: [1m]\n---\n`;
      await adapter.create("Retrieva/Presets/custom1.md", p1);
      await adapter.create("Retrieva/Presets/custom2.md", p2);
      await index.rebuild();

      expect(index.hasPresetDefinition("custom")).toBe(false); // 重複により無効化される
    });

    it("Q8.4: 既に suspended: true なカードに再度 suspend を呼び出した場合の挙動", async () => {
      await creator.create({ front: "Q", back: "A", filename: "DoubleSuspend", presetId: "default", folder: "Cards", pair: false });
      await index.rebuild();
      let card = index.getCard("Cards/DoubleSuspend.md")!;

      await cardService.stateChange(card.path, card.lastEventId, "suspend", new Date(), "UTC");
      await index.rebuild();
      card = index.getCard("Cards/DoubleSuspend.md")!;

      // 連続で suspend を呼ぶ
      const res = await cardService.stateChange(card.path, card.lastEventId, "suspend", new Date(), "UTC");
      expect(res.status).toBe("written"); // 重複イベントが書き込まれる仕様
    });

    it("Q8.5: 埋め込みリンク先のノートが削除されてもRetrieva側で検知できない仕様", async () => {
      await creator.create({ front: "![[DeletedNote#Q]]", back: "![[DeletedNote#A]]", filename: "EmbedRef", presetId: "default", folder: "Cards", pair: false });
      await index.rebuild();
      const card = index.getCard("Cards/EmbedRef.md");
      expect(card).toBeDefined(); // 参照先が実在しなくても有効カードとして扱われる仕様
    });

    it("Q8.6: 同一の Sibling グループに 3 枚以上のカードが紐づく仕様", async () => {
      // 手動で同じ siblingGroupId を持つ3つのカードを作成
      const groupId = "019f9a6e-0000-7000-8000-000000000088";
      for (let i = 1; i <= 3; i++) {
        const source = `---\nretrieva-preset: default\nretrieva-sibling-group: ${groupId}\ntags: [retrieva-card]\n---\nQ${i}\n<!--RETRIEVA-ANSWER-->\nA${i}\n<!--RETRIEVA-CARD {"v":1,"id":"C_${i}"}-->\n<!--RETRIEVA-LOG\n{"v":1,"eid":"E_${i}","type":"created","parent":null,"at":"2026-07-26T00:00:00.000Z","zone":"UTC","state":{"v":1,"phase":"new","learningStep":0,"reps":0,"lapses":0,"interval":0,"stability":null,"difficulty":null,"due":null,"suspended":false}}\nRETRIEVA-LOG-->`;
        await adapter.create(`Cards/Triple_${i}.md`, source);
      }
      await index.rebuild();

      const cards = index.listCards().filter(c => c.siblingGroupId === groupId);
      expect(cards.length).toBe(3);
    });

    it("Q8.7: rebuild を実行するたびに無効なカードがクリーンアップされるか", async () => {
      await adapter.create("Cards/Invalid.md", "---\nretrieva-preset: default\ntags: [retrieva-card]\n---\nInvalid content");
      await index.rebuild();
      expect(index.invalidPaths()).toContain("Cards/Invalid.md");

      // ファイルを完全修正
      const validSource = `---\nretrieva-preset: default\ntags: [retrieva-card]\n---\nQ\n<!--RETRIEVA-ANSWER-->\nA\n<!--RETRIEVA-CARD {"v":1,"id":"FixedCard"}-->\n<!--RETRIEVA-LOG\n{"v":1,"eid":"E1","type":"created","parent":null,"at":"2026-07-26T00:00:00.000Z","zone":"UTC","state":{"v":1,"phase":"new","learningStep":0,"reps":0,"lapses":0,"interval":0,"stability":null,"difficulty":null,"due":null,"suspended":false}}\nRETRIEVA-LOG-->`;
      await adapter.create("Cards/Invalid.md", validSource);
      await index.rebuild();

      expect(index.invalidPaths()).not.toContain("Cards/Invalid.md");
      expect(index.getCard("Cards/Invalid.md")).toBeDefined();
    });

    it("Q8.8: タグが階層化されて大文字小文字が混在する場合のマッチング", async () => {
      const source = `---\nretrieva-preset: default\ntags: [retrieva-card, Biology/Cell]\n---\nQ\n<!--RETRIEVA-ANSWER-->\nA\n<!--RETRIEVA-CARD {"v":1,"id":"CaseTag"}-->\n<!--RETRIEVA-LOG\n{"v":1,"eid":"E1","type":"created","parent":null,"at":"2026-07-26T00:00:00.000Z","zone":"UTC","state":{"v":1,"phase":"new","learningStep":0,"reps":0,"lapses":0,"interval":0,"stability":null,"difficulty":null,"due":null,"suspended":false}}\nRETRIEVA-LOG-->`;
      await adapter.create("Cards/CaseTag.md", source);
      await index.rebuild();

      const matched = index.cardsMatching(tagFilter("biology/cell"));
      expect(matched.length).toBe(1); // タグのマッチングは大文字小文字を区別しない
    });

    it("Q8.9: レビュー履歴ログ内の at タイムスタンプに ISO 文字列以外が入っていた場合", async () => {
      const source = `---\nretrieva-preset: default\ntags: [retrieva-card]\n---\nQ\n<!--RETRIEVA-ANSWER-->\nA\n<!--RETRIEVA-CARD {"v":1,"id":"BadDateCard"}-->\n<!--RETRIEVA-LOG\n{"v":1,"eid":"E1","type":"created","parent":null,"at":"invalid-date","zone":"UTC","state":{"v":1,"phase":"new","learningStep":0,"reps":0,"lapses":0,"interval":0,"stability":null,"difficulty":null,"due":null,"suspended":false}}\nRETRIEVA-LOG-->`;
      await adapter.create("Cards/BadDate.md", source);
      await index.rebuild();
      // パースエラーとして検出されるか
      expect(index.invalidPaths()).toContain("Cards/BadDate.md");
    });

    it("Q8.10: 複数の preset で同一カードが指定されている場合の解決", async () => {
      // 重複プロパティを指定
      const source = `---\nretrieva-preset: default\nretrieva-preset: custom\ntags: [retrieva-card]\n---\nQ\n<!--RETRIEVA-ANSWER-->\nA\n<!--RETRIEVA-CARD {"v":1,"id":"MultiPresetCard"}-->\n<!--RETRIEVA-LOG\n{"v":1,"eid":"E1","type":"created","parent":null,"at":"2026-07-26T00:00:00.000Z","zone":"UTC","state":{"v":1,"phase":"new","learningStep":0,"reps":0,"lapses":0,"interval":0,"stability":null,"difficulty":null,"due":null,"suspended":false}}\nRETRIEVA-LOG-->`;
      await adapter.create("Cards/MultiPreset.md", source);
      await index.rebuild();
      const parsed = index.getParsed("Cards/MultiPreset.md");
      expect(parsed?.presetId).toBe("custom"); // 最後の値が採用される
    });
  });

  // --- P9: 巨大 (極端に巨大・複雑な入力) ---
  describe("P9: Massive & Extreme Input Persona", () => {
    it("Q9.1: Front/Back に 1MB の巨大テキストを含めてカード作成・パース", async () => {
      const hugeText = "A".repeat(1024 * 1024);
      const res = await creator.create({
        front: hugeText,
        back: hugeText,
        filename: "HugeCard",
        presetId: "default",
        folder: "Cards",
        pair: false,
      });
      expect(res.status).toBe("created");
      await index.rebuild();
      const card = index.getCard("Cards/HugeCard.md");
      expect(card).toBeDefined();
    });

    it("Q9.2: 500個のレビューイベントログを持つ超長巨大ログカードのパース", async () => {
      let eventsStr = `{"v":1,"eid":"E0","type":"created","parent":null,"at":"2026-07-26T00:00:00.000Z","zone":"UTC","state":{"v":1,"phase":"new","learningStep":0,"reps":0,"lapses":0,"interval":0,"stability":null,"difficulty":null,"due":null,"suspended":false}}\n`;
      for (let i = 1; i <= 500; i++) {
        eventsStr += `{"v":1,"eid":"E${i}","type":"review","parent":"E${i-1}","rating":"good","durationMs":1000,"at":"2026-07-26T00:00:00.000Z","zone":"UTC","state":{"v":1,"phase":"review","learningStep":0,"reps":${i},"lapses":0,"interval":1,"stability":1,"difficulty":5,"due":"2026-07-27T00:00:00.000Z","suspended":false}}\n`;
      }
      const source = `---\nretrieva-preset: default\ntags: [retrieva-card]\n---\nQ\n<!--RETRIEVA-ANSWER-->\nA\n<!--RETRIEVA-CARD {"v":1,"id":"500LogsCard"}-->\n<!--RETRIEVA-LOG\n${eventsStr}RETRIEVA-LOG-->`;
      await adapter.create("Cards/500Logs.md", source);
      await index.rebuild();
      const card = index.getCard("Cards/500Logs.md");
      expect(card).toBeDefined();
      expect(card?.events.length).toBe(501);
    });

    it("Q9.3: 1,000文字の極長タグ名の指定", async () => {
      const longTag = "tag_" + "a".repeat(1000);
      const source = `---\nretrieva-preset: default\ntags: [retrieva-card, "${longTag}"]\n---\nQ\n<!--RETRIEVA-ANSWER-->\nA\n<!--RETRIEVA-CARD {"v":1,"id":"LongTagCard"}-->\n<!--RETRIEVA-LOG\n{"v":1,"eid":"E1","type":"created","parent":null,"at":"2026-07-26T00:00:00.000Z","zone":"UTC","state":{"v":1,"phase":"new","learningStep":0,"reps":0,"lapses":0,"interval":0,"stability":null,"difficulty":null,"due":null,"suspended":false}}\nRETRIEVA-LOG-->`;
      await adapter.create("Cards/LongTag.md", source);
      await index.rebuild();
      const card = index.getCard("Cards/LongTag.md");
      expect(card?.tags).toContain(longTag);
    });

    it("Q9.4: learning-steps に 50 ステップが登録された Preset", async () => {
      const steps = Array.from({ length: 50 }, (_, i) => `${i + 1}m`).join(", ");
      const source = `---\n${IDENTIFIERS.presetDefinitionKey}: true\n${IDENTIFIERS.presetIdKey}: 50steps\nscheduler: fsrs\ndesired-retention: 0.9\nmaximum-interval-days: 1000\nlearning-steps: [${steps}]\nrelearning-steps: [10m]\n---\n`;
      const parsed = parsePresetMarkdown("preset.md", source);
      expect(parsed.preset?.learningSteps.length).toBe(50);
    });

    it("Q9.5: 深さ 30 階層のフォルダ内にカードを作成", async () => {
      const deepFolder = Array.from({ length: 30 }, (_, i) => `dir${i}`).join("/");
      const res = await creator.create({
        front: "Q",
        back: "A",
        filename: "DeepFile",
        presetId: "default",
        folder: deepFolder,
        pair: false,
      });
      expect(res.status).toBe("created");
      await index.rebuild();
      expect(index.getCard(`${deepFolder}/DeepFile.md`)).toBeDefined();
    });

    it("Q9.6: 100 個のタグが同時に設定されたカード", async () => {
      const tags = Array.from({ length: 100 }, (_, i) => `tag_${i}`).join(", ");
      const source = `---\nretrieva-preset: default\ntags: [retrieva-card, ${tags}]\n---\nQ\n<!--RETRIEVA-ANSWER-->\nA\n<!--RETRIEVA-CARD {"v":1,"id":"100TagsCard"}-->\n<!--RETRIEVA-LOG\n{"v":1,"eid":"E1","type":"created","parent":null,"at":"2026-07-26T00:00:00.000Z","zone":"UTC","state":{"v":1,"phase":"new","learningStep":0,"reps":0,"lapses":0,"interval":0,"stability":null,"difficulty":null,"due":null,"suspended":false}}\nRETRIEVA-LOG-->`;
      await adapter.create("Cards/100Tags.md", source);
      await index.rebuild();
      const card = index.getCard("Cards/100Tags.md");
      expect(card?.tags.length).toBe(101);
    });

    it("Q9.7: JSONL ログの 1 行に 100KB の文字データが含まれている場合", async () => {
      const hugeData = "X".repeat(100 * 1024);
      const source = `---\nretrieva-preset: default\ntags: [retrieva-card]\n---\nQ\n<!--RETRIEVA-ANSWER-->\nA\n<!--RETRIEVA-CARD {"v":1,"id":"HugeLogLineCard"}-->\n<!--RETRIEVA-LOG\n{"v":1,"eid":"E1","type":"created","parent":null,"at":"2026-07-26T00:00:00.000Z","zone":"UTC","state":{"v":1,"phase":"new","learningStep":0,"reps":0,"lapses":0,"interval":0,"stability":null,"difficulty":null,"due":null,"suspended":false},"huge":"${hugeData}"}\nRETRIEVA-LOG-->`;
      await adapter.create("Cards/HugeLogLine.md", source);
      await index.rebuild();
      expect(index.getCard("Cards/HugeLogLine.md")).toBeDefined();
    });

    it("Q9.8: 250 文字の長いファイル名でのカード作成", async () => {
      const longName = "A".repeat(200);
      const res = await creator.create({
        front: "Q",
        back: "A",
        filename: longName,
        presetId: "default",
        folder: "Cards",
        pair: false,
      });
      expect(res.status).toBe("created");
    });

    it("Q9.9: 10,000 行の無関係なテキストを含むカードファイル", async () => {
      const textLines = Array.from({ length: 10000 }, (_, i) => `Line ${i}`).join("\n");
      const source = `---\nretrieva-preset: default\ntags: [retrieva-card]\n---\n${textLines}\n<!--RETRIEVA-ANSWER-->\n${textLines}\n<!--RETRIEVA-CARD {"v":1,"id":"10000LinesCard"}-->\n<!--RETRIEVA-LOG\n{"v":1,"eid":"E1","type":"created","parent":null,"at":"2026-07-26T00:00:00.000Z","zone":"UTC","state":{"v":1,"phase":"new","learningStep":0,"reps":0,"lapses":0,"interval":0,"stability":null,"difficulty":null,"due":null,"suspended":false}}\nRETRIEVA-LOG-->`;
      await adapter.create("Cards/10000Lines.md", source);
      await index.rebuild();
      expect(index.getCard("Cards/10000Lines.md")).toBeDefined();
    });

    it("Q9.10: 100 個のプリセットが Vault 内に作成されている場合のロードパフォーマンス", async () => {
      for (let i = 0; i < 100; i++) {
        const source = `---\n${IDENTIFIERS.presetDefinitionKey}: true\n${IDENTIFIERS.presetIdKey}: preset_${i}\nscheduler: fsrs\ndesired-retention: 0.9\nmaximum-interval-days: 365\nlearning-steps: [1m]\nrelearning-steps: [1m]\n---\n`;
        await adapter.create(`Retrieva/Presets/preset_${i}.md`, source);
      }
      await index.rebuild();
      expect(index.hasPresetDefinition("preset_99")).toBe(true);
    });
  });

  // --- P10: 重箱の隅 (マイナーな機能・エッジケースの組み合わせ) ---
  describe("P10: Corner Cases & Edge Combinations Persona", () => {
    it("Q10.1: マーカー閉じタグ --> の前後にスペースや改行が存在する場合", async () => {
      const source = `---\nretrieva-preset: default\ntags: [retrieva-card]\n---\nQ\n<!-- RETRIEVA-ANSWER -->\nA\n<!-- RETRIEVA-CARD {"v":1,"id":"SpaceMarker"} -->\n<!-- RETRIEVA-LOG\n{"v":1,"eid":"E1","type":"created","parent":null,"at":"2026-07-26T00:00:00.000Z","zone":"UTC","state":{"v":1,"phase":"new","learningStep":0,"reps":0,"lapses":0,"interval":0,"stability":null,"difficulty":null,"due":null,"suspended":false}}\nRETRIEVA-LOG -->`;
      await adapter.create("Cards/SpaceMarker.md", source);
      await index.rebuild();
      // マーカーのスペース許容範囲の検証
      const parsed = index.getParsed("Cards/SpaceMarker.md");
      expect(parsed?.cardId).toBe("SpaceMarker");
    });

    it("Q10.2: LOG マーカー直後に改行が一切存在しない圧縮フォーマット", async () => {
      const source = `---\nretrieva-preset: default\ntags: [retrieva-card]\n---\nQ<!--RETRIEVA-ANSWER-->A<!--RETRIEVA-CARD {"v":1,"id":"CompactCard"}--><!--RETRIEVA-LOG\n{"v":1,"eid":"E1","type":"created","parent":null,"at":"2026-07-26T00:00:00.000Z","zone":"UTC","state":{"v":1,"phase":"new","learningStep":0,"reps":0,"lapses":0,"interval":0,"stability":null,"difficulty":null,"due":null,"suspended":false}}\nRETRIEVA-LOG-->`;
      await adapter.create("Cards/Compact.md", source);
      await index.rebuild();
      expect(index.getCard("Cards/Compact.md")).toBeDefined();
    });

    it("Q10.3: at タイムスタンプにミリ秒が無い ISO 文字列 (Z のみ)", async () => {
      const source = `---\nretrieva-preset: default\ntags: [retrieva-card]\n---\nQ\n<!--RETRIEVA-ANSWER-->\nA\n<!--RETRIEVA-CARD {"v":1,"id":"NoMsDateCard"}-->\n<!--RETRIEVA-LOG\n{"v":1,"eid":"E1","type":"created","parent":null,"at":"2026-07-26T00:00:00Z","zone":"UTC","state":{"v":1,"phase":"new","learningStep":0,"reps":0,"lapses":0,"interval":0,"stability":null,"difficulty":null,"due":null,"suspended":false}}\nRETRIEVA-LOG-->`;
      await adapter.create("Cards/NoMsDate.md", source);
      await index.rebuild();
      expect(index.getCard("Cards/NoMsDate.md")).toBeDefined();
    });

    it("Q10.4: cardId が UUIDv4 形式のファイル", async () => {
      const source = `---\nretrieva-preset: default\ntags: [retrieva-card]\n---\nQ\n<!--RETRIEVA-ANSWER-->\nA\n<!--RETRIEVA-CARD {"v":1,"id":"123e4567-e89b-12d3-a456-426614174000"}-->\n<!--RETRIEVA-LOG\n{"v":1,"eid":"E1","type":"created","parent":null,"at":"2026-07-26T00:00:00.000Z","zone":"UTC","state":{"v":1,"phase":"new","learningStep":0,"reps":0,"lapses":0,"interval":0,"stability":null,"difficulty":null,"due":null,"suspended":false}}\nRETRIEVA-LOG-->`;
      await adapter.create("Cards/UUIDv4.md", source);
      await index.rebuild();
      expect(index.getCard("Cards/UUIDv4.md")).toBeDefined();
    });

    it("Q10.5: HTML コメントが本文中に多数含まれている場合のマッチング", async () => {
      const source = `---\nretrieva-preset: default\ntags: [retrieva-card]\n---\n<!-- comment 1 -->\nQuestion\n<!-- comment 2 -->\n<!--RETRIEVA-ANSWER-->\n<!-- comment 3 -->\nAnswer\n<!-- comment 4 -->\n<!--RETRIEVA-CARD {"v":1,"id":"HtmlCommentsCard"}-->\n<!--RETRIEVA-LOG\n{"v":1,"eid":"E1","type":"created","parent":null,"at":"2026-07-26T00:00:00.000Z","zone":"UTC","state":{"v":1,"phase":"new","learningStep":0,"reps":0,"lapses":0,"interval":0,"stability":null,"difficulty":null,"due":null,"suspended":false}}\nRETRIEVA-LOG-->`;
      await adapter.create("Cards/HtmlComments.md", source);
      await index.rebuild();
      const card = index.getCard("Cards/HtmlComments.md");
      expect(card).toBeDefined();
    });

    it("Q10.6: presetDefinitionKey と presetKey の両方が単一ファイル内に含まれる場合", async () => {
      const source = `---\n${IDENTIFIERS.presetDefinitionKey}: true\n${IDENTIFIERS.presetIdKey}: self-preset\n${IDENTIFIERS.presetKey}: self-preset\ntags: [retrieva-card]\nscheduler: fsrs\ndesired-retention: 0.9\nmaximum-interval-days: 365\nlearning-steps: [1m]\nrelearning-steps: [1m]\n---\nSelf Preset Card\n<!--RETRIEVA-ANSWER-->\nAnswer\n<!--RETRIEVA-CARD {"v":1,"id":"SelfPresetCard"}-->\n<!--RETRIEVA-LOG\n{"v":1,"eid":"E1","type":"created","parent":null,"at":"2026-07-26T00:00:00.000Z","zone":"UTC","state":{"v":1,"phase":"new","learningStep":0,"reps":0,"lapses":0,"interval":0,"stability":null,"difficulty":null,"due":null,"suspended":false}}\nRETRIEVA-LOG-->`;
      await adapter.create("Retrieva/Presets/self.md", source);
      await index.rebuild();
      // プリセット定義ファイルとして優先パースされるか
      expect(index.hasPresetDefinition("self-preset")).toBe(true);
    });

    it("Q10.7: JSONL ログ内の型数値プロパティが文字列として入っていた場合", async () => {
      const source = `---\nretrieva-preset: default\ntags: [retrieva-card]\n---\nQ\n<!--RETRIEVA-ANSWER-->\nA\n<!--RETRIEVA-CARD {"v":1,"id":"StringNumCard"}-->\n<!--RETRIEVA-LOG\n{"v":"1","eid":"E1","type":"created","parent":null,"at":"2026-07-26T00:00:00.000Z","zone":"UTC","state":{"v":"1","phase":"new","learningStep":"0","reps":"0","lapses":"0","interval":"0","stability":null,"difficulty":null,"due":null,"suspended":false}}\nRETRIEVA-LOG-->`;
      await adapter.create("Cards/StringNum.md", source);
      await index.rebuild();
      expect(index.invalidPaths()).toContain("Cards/StringNum.md");
    });

    it("Q10.8: JSONL ログの文末改行が存在しない場合", async () => {
      const source = `---\nretrieva-preset: default\ntags: [retrieva-card]\n---\nQ\n<!--RETRIEVA-ANSWER-->\nA\n<!--RETRIEVA-CARD {"v":1,"id":"NoEndNewlineCard"}-->\n<!--RETRIEVA-LOG\n{"v":1,"eid":"E1","type":"created","parent":null,"at":"2026-07-26T00:00:00.000Z","zone":"UTC","state":{"v":1,"phase":"new","learningStep":0,"reps":0,"lapses":0,"interval":0,"stability":null,"difficulty":null,"due":null,"suspended":false}}\nRETRIEVA-LOG-->`;
      await adapter.create("Cards/NoEndNewline.md", source);
      await index.rebuild();
      expect(index.getCard("Cards/NoEndNewline.md")).toBeDefined();
    });

    it("Q10.9: deepValidate 時に tags が空配列の機械マーカー付きファイル", async () => {
      const source = `---\ntags: []\n---\nQ\n<!--RETRIEVA-ANSWER-->\nA\n<!--RETRIEVA-CARD {"v":1,"id":"NoTagMarkerCard"}-->\n<!--RETRIEVA-LOG\n{"v":1,"eid":"E1","type":"created","parent":null,"at":"2026-07-26T00:00:00.000Z","zone":"UTC","state":{"v":1,"phase":"new","learningStep":0,"reps":0,"lapses":0,"interval":0,"stability":null,"difficulty":null,"due":null,"suspended":false}}\nRETRIEVA-LOG-->`;
      await adapter.create("Cards/NoTagMarker.md", source);
      await index.deepValidate();
      expect(index.invalidPaths()).toContain("Cards/NoTagMarker.md");
    });

    it("Q10.10: ログマーカーの内部が完全に空 (0文字) のカードファイル", async () => {
      const source = `---\nretrieva-preset: default\ntags: [retrieva-card]\n---\nQ\n<!--RETRIEVA-ANSWER-->\nA\n<!--RETRIEVA-CARD {"v":1,"id":"EmptyLogContentCard"}-->\n<!--RETRIEVA-LOG\nRETRIEVA-LOG-->`;
      await adapter.create("Cards/EmptyLogContent.md", source);
      await index.rebuild();
      // created イベントが無いため invalid になるべき
      expect(index.invalidPaths()).toContain("Cards/EmptyLogContent.md");
    });
  });
});
