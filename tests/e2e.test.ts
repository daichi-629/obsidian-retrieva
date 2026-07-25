import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Plugin } from "obsidian";
import {
  CardCreator,
  CardRecoveryService,
  CardService,
  CardWriteLock,
  IDENTIFIERS,
  parseCardMarkdown,
  tagFilter,
} from "../src/core";
import { VaultIndexService } from "../src/application/vault-index-service";
import { CardIndex } from "../src/obsidian/card-index";
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

describe("High-Level User Scenario E2E Tests (No logic re-implementation)", () => {
  let tempDir: string;
  let adapter: NodeFileAdapter;
  let plugin: Plugin;
  let index: CardIndex;
  let vaultIndex: VaultIndexService;
  let cardService: CardService;
  let creator: CardCreator;
  let recovery: CardRecoveryService;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "retrieva-e2e-"));
    adapter = new NodeFileAdapter(tempDir);
    plugin = new (Plugin as any)();

    // Create default preset file on disk
    await adapter.create("Retrieva/Presets/default.md", defaultPresetContent);

    // Instantiate plugin's ACTUAL application & index services
    index = new CardIndex(plugin, adapter as any, () => []);
    vaultIndex = new VaultIndexService(index, index, async () => {});
    await vaultIndex.initialize();

    const writeLock = new CardWriteLock();
    cardService = new CardService(adapter, index, index, writeLock);
    creator = new CardCreator(adapter, index);
    recovery = new CardRecoveryService(adapter, index, index, writeLock);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("シナリオ1: カード作成 -> スコープ選択 -> 復習ボタンを押す(Good) -> Undo を押す", async () => {
    // 1. 【操作: カードを作る】 (UI/コマンドと同じ CardCreator.create)
    const createResult = await creator.create({
      front: "What is the capital of Japan?",
      back: "Tokyo",
      filename: "CapitalJapan",
      presetId: "default",
      folder: "Cards",
      pair: false,
    });
    expect(createResult.status).toBe("created");
    if (createResult.status !== "created") return;

    // 2. 【操作: デッキ/スコープを選択してカードを取得する】 (ScopeViewと同じクエリ)
    await vaultIndex.rebuild();
    const cardsInScope = index.cardsMatching(tagFilter("retrieva-card"));
    expect(cardsInScope.length).toBe(1);

    const cardToReview = cardsInScope[0]!;
    expect(cardToReview.path).toBe("Cards/CapitalJapan.md");

    // ディスク上の作成直後ファイルを検証
    const diskPath = path.join(tempDir, "Cards/CapitalJapan.md");
    const initialContent = await fs.readFile(diskPath, "utf-8");

    // 3. 【操作: 復習画面で 'Good' ボタンを押す】 (ReviewViewの解答選択と同じ cardService.review)
    const now = new Date("2026-07-26T03:00:00.000Z");
    const preset = index.getPreset("default")!;
    const reviewResult = await cardService.review(
      cardToReview.path,
      cardToReview.lastEventId,
      preset.fingerprint,
      "good", // 'Good' ボタンを押す
      1500, // 回答にかかった時間 (ms)
      now,
      "Asia/Tokyo",
    );

    expect(reviewResult.status).toBe("written");
    if (reviewResult.status !== "written") return;

    // 実ファイル上の復習ログ追加を検証
    const contentAfterGood = await fs.readFile(diskPath, "utf-8");
    const parsedAfterGood = parseCardMarkdown(cardToReview.path, contentAfterGood);
    expect(parsedAfterGood.events.length).toBe(2);
    expect(parsedAfterGood.events[1]?.type).toBe("review");

    // 4. 【操作: 'Undo' ボタンを押す】 (ReviewViewのUndoと同じ cardService.undo)
    const undoSuccess = await cardService.undo(
      cardToReview.path,
      reviewResult.eventId,
      reviewResult.sourceAfter,
    );
    expect(undoSuccess).toBe(true);

    // 実ファイルが復習前の状態に完全ロールバックされたことを検証
    const contentAfterUndo = await fs.readFile(diskPath, "utf-8");
    expect(contentAfterUndo).toBe(initialContent);
  });

  it("シナリオ2: 表裏カードペアを作成する", async () => {
    // 【操作: 表裏ペアカードを作成する】
    const createResult = await creator.create({
      front: "Mitochondria",
      back: "Powerhouse of the cell",
      filename: "Mitochondria",
      presetId: "default",
      folder: "Biology",
      pair: true,
    });
    expect(createResult.status).toBe("created");

    await vaultIndex.rebuild();
    const frontCard = index.getCard("Biology/Mitochondria (Front).md");
    const backCard = index.getCard("Biology/Mitochondria (Back).md");

    expect(frontCard).toBeDefined();
    expect(backCard).toBeDefined();
    expect(frontCard?.siblingGroupId).toBe(backCard?.siblingGroupId);
  });

  it("シナリオ3: 壊れたカードを修復する", async () => {
    // 壊れたメタデータを持つカードファイルをディスクに直接作成
    const oldCardId = "broken-id";
    const corruptedSource = `---\n${IDENTIFIERS.presetKey}: default\ntags:\n  - retrieva-card\n---\n\nQuestion\n\n<!--RETRIEVA-ANSWER-->\n\nAnswer\n\n<!--RETRIEVA-CARD {"v":1,"id":"${oldCardId}"}-->\n\n<!--RETRIEVA-LOG\n{"v":1,"eid":"019f9a6e-0000-7000-8000-000000000000","type":"created","parent":null,"at":"2026-07-26T00:00:00.000Z","zone":"UTC","state":{"v":1,"phase":"new","learningStep":0,"reps":0,"lapses":0,"interval":0,"stability":null,"difficulty":null,"due":null,"suspended":false}}\nRETRIEVA-LOG-->\n`;
    await adapter.create("Cards/Corrupted.md", corruptedSource);

    // 【操作: 修復ボタンを押す】 (RecoveryViewと同じ recovery.repairMetadata)
    await recovery.repairMetadata("Cards/Corrupted.md", true);

    await vaultIndex.rebuild();
    const repairedCard = index.getCard("Cards/Corrupted.md");
    expect(repairedCard).toBeDefined();
    expect(repairedCard?.cardId).not.toBe(oldCardId);
  });
});
