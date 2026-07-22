import { moment, Notice, Plugin, TFile, normalizePath } from "obsidian";
import { IDENTIFIERS, MARKERS, renderCardTemplate, uuidv7, type Preset } from "./core";
import { CardIndex } from "./obsidian/card-index";
import { CardRepository } from "./obsidian/card-repository";
import { ObsidianFileAdapter } from "./obsidian/file-adapter";
import { DEFAULT_SETTINGS, RetrievaSettingTab, SettingsStore } from "./settings";
import { initializeI18n, t } from "./i18n";
import { installProjectSkills } from "./llm/skill-installer";
import { CreateCardModal } from "./ui/create-card-modal";
import { RecoveryView } from "./ui/recovery-view";
import { ReviewView } from "./ui/review-view";
import { ScopeView } from "./ui/scope-view";
import { RECOVERY_VIEW_TYPE, REVIEW_VIEW_TYPE, SCOPE_VIEW_TYPE } from "./ui/view-types";

export default class RetrievaPlugin extends Plugin {
  settingsStore!: SettingsStore;
  index!: CardIndex;
  repository!: CardRepository;
  override async onload(): Promise<void> {
    await initializeI18n(moment.locale());
    this.settingsStore = new SettingsStore(this);
    await this.settingsStore.load();
    const files = new ObsidianFileAdapter(this);
    this.index = new CardIndex(this, files);
    this.repository = new CardRepository(this.index);
    this.registerView(SCOPE_VIEW_TYPE, leaf => new ScopeView(leaf, this));
    this.registerView(REVIEW_VIEW_TYPE, leaf => new ReviewView(leaf, this));
    this.registerView(RECOVERY_VIEW_TYPE, leaf => new RecoveryView(leaf, this));
    await this.index.start();
    if (!this.index.presetDefinitionIds.has("default")) {
      await this.ensureDefaultPreset();
      await this.index.rebuild();
    }
    this.addCommand({
      id: "open",
      name: t("command.open"),
      callback: () => {
        void this.activateView(SCOPE_VIEW_TYPE);
      },
    });
    this.addCommand({
      id: "create-card",
      name: t("command.createCard"),
      callback: () => new CreateCardModal(this, false).open(),
    });
    this.addCommand({
      id: "create-card-pair",
      name: t("command.createPair"),
      callback: () => new CreateCardModal(this, true).open(),
    });
    this.addCommand({
      id: "rebuild-index",
      name: t("command.rebuild"),
      callback: async () => {
        await this.index.rebuild();
        new Notice(t("notice.indexRebuilt"));
      },
    });
    this.addCommand({
      id: "validate-vault",
      name: t("command.validate"),
      callback: async () => {
        await this.validateVault();
        await this.activateView(RECOVERY_VIEW_TYPE);
      },
    });
    this.addCommand({
      id: "reset-active-card",
      name: t("command.reset"),
      checkCallback: checking => this.activeCardAction("reset", checking),
    });
    this.addCommand({
      id: "toggle-suspend-active-card",
      name: t("command.toggleSuspend"),
      checkCallback: checking => this.activeCardAction("toggle", checking),
    });
    this.addCommand({
      id: "install-project-skills",
      name: t("command.installProjectSkills"),
      callback: () => {
        void this.installProjectSkills();
      },
    });
    this.addSettingTab(
      new RetrievaSettingTab(
        this.app,
        this,
        this.settingsStore,
        path => this.openFile(path),
        () => this.index.presetPaths(),
        () => this.installProjectSkills(),
      ),
    );
    if (this.settingsStore.value.showRibbonIcon)
      this.addRibbonIcon("brain-circuit", t("ribbon.open"), () => {
        void this.activateView(SCOPE_VIEW_TYPE);
      });
  }
  override onunload(): void {
    void this.app.workspace.detachLeavesOfType(SCOPE_VIEW_TYPE);
    void this.app.workspace.detachLeavesOfType(REVIEW_VIEW_TYPE);
    void this.app.workspace.detachLeavesOfType(RECOVERY_VIEW_TYPE);
  }
  async activateView(type: string): Promise<void> {
    let leaf = this.app.workspace.getLeavesOfType(type)[0];
    if (!leaf) {
      leaf = this.app.workspace.getLeaf("tab");
      await leaf.setViewState({ type, active: true });
    }
    await this.app.workspace.revealLeaf(leaf);
  }
  async openReview(name: string, tag: string): Promise<void> {
    await this.activateView(REVIEW_VIEW_TYPE);
    const view = this.app.workspace.getLeavesOfType(REVIEW_VIEW_TYPE)[0]?.view;
    if (view instanceof ReviewView) view.setScope(name, tag);
  }
  async openFile(path: string): Promise<void> {
    const file = this.index.files.get(path);
    if (file) await this.app.workspace.getLeaf("tab").openFile(file);
  }
  effectivePresets(): Map<string, Preset> {
    return new Map(
      [...this.index.presets].map(([id, preset]) => [
        id,
        {
          ...preset,
          excludeNewSiblingsToday: this.settingsStore.value.excludeNewSiblingsToday,
          excludeReviewSiblingsToday: this.settingsStore.value.excludeReviewSiblingsToday,
        },
      ]),
    );
  }
  private async ensureDefaultPreset(): Promise<void> {
    const path = normalizePath("Retrieva/Presets/default.md");
    if (this.app.vault.getAbstractFileByPath(path)) return;
    const folder = path.split("/").slice(0, -1).join("/");
    if (!this.app.vault.getAbstractFileByPath(folder)) await this.app.vault.createFolder(folder);
    const source = `---\n${IDENTIFIERS.presetDefinitionKey}: true\n${IDENTIFIERS.presetIdKey}: default\nscheduler: fsrs\ndesired-retention: 0.9\nmaximum-interval-days: 36500\nlearning-steps:\n  - 1m\n  - 10m\nrelearning-steps:\n  - 10m\nexclude-new-siblings-today: ${DEFAULT_SETTINGS.excludeNewSiblingsToday}\nexclude-review-siblings-today: ${DEFAULT_SETTINGS.excludeReviewSiblingsToday}\n---\n\n# Default SRS preset\n`;
    await this.app.vault.create(path, source);
  }
  async createCards(input: {
    front: string;
    back: string;
    filename: string;
    presetId: string;
    pair: boolean;
  }): Promise<void> {
    const folder = this.settingsStore.value.cardsFolder.replace(/^\/+|\/+$/g, "");
    const now = new Date();
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const group = input.pair ? uuidv7(now.getTime()) : undefined;
    const safe = input.filename.replace(/[\\/:*?"<>|]/g, "-");
    const paths = input.pair ? [`${safe} (Front).md`, `${safe} (Back).md`] : [`${safe}.md`];
    const full = paths.map(name => normalizePath(folder ? `${folder}/${name}` : name));
    if (full.some(path => this.app.vault.getAbstractFileByPath(path)))
      throw new Error(t("notice.fileExists"));
    const first = renderCardTemplate({
      front: input.front,
      back: input.back,
      presetId: input.presetId,
      cardId: uuidv7(now.getTime()),
      eventId: uuidv7(now.getTime() + 1),
      now,
      zone,
      siblingGroupId: group,
    });
    const created: TFile[] = [await this.index.files.create(full[0]!, first)];
    if (input.pair) {
      try {
        created.push(
          await this.index.files.create(
            full[1]!,
            renderCardTemplate({
              front: input.back,
              back: input.front,
              presetId: input.presetId,
              cardId: uuidv7(now.getTime() + 2),
              eventId: uuidv7(now.getTime() + 3),
              now: new Date(now.getTime() + 1),
              zone,
              siblingGroupId: group,
            }),
          ),
        );
      } catch (error) {
        new Notice(t("notice.reverseFailed", { error: String(error) }));
      }
    }
    for (const file of created) await this.index.refresh(file.path);
    await this.openFile(created[0]!.path);
  }
  private activeCardAction(action: "reset" | "toggle", checking: boolean): boolean {
    const path = this.app.workspace.getActiveFile()?.path;
    const card = path ? this.index.cards.get(path) : undefined;
    if (!card) return false;
    if (checking) return true;
    const type = action === "reset" ? "reset" : card.state.suspended ? "resume" : "suspend";
    void this.repository
      .stateChange(
        card.path,
        card.lastEventId,
        type,
        new Date(),
        Intl.DateTimeFormat().resolvedOptions().timeZone,
      )
      .then(
        result =>
          new Notice(
            result.status === "written"
              ? type === "suspend"
                ? t("notice.cardSuspended")
                : type === "resume"
                  ? t("notice.cardResumed")
                  : t("notice.cardReset")
              : result.reason,
          ),
      );
    return true;
  }
  private async validateVault(): Promise<void> {
    await this.index.rebuild();
    for (const file of this.app.vault.getMarkdownFiles()) {
      const source = await this.index.files.read(file);
      if (
        !source.includes(MARKERS.answer) &&
        !source.includes(IDENTIFIERS.cardMarker) &&
        !source.includes(IDENTIFIERS.logMarker)
      )
        continue;
      if (!this.index.parsed.has(file.path)) {
        const { parseCardMarkdown } = await import("./core");
        const parsed = parseCardMarkdown(file.path, source);
        this.index.parsed.set(file.path, parsed);
        const errors = [
          ...parsed.errors,
          { code: "missing-card-tag", message: `Card tag ${IDENTIFIERS.cardTag} is missing` },
        ];
        this.index.invalid.set(file.path, errors);
      }
    }
    const pathsById = new Map<string, string[]>();
    for (const parsed of this.index.parsed.values())
      if (parsed.cardId)
        pathsById.set(parsed.cardId, [...(pathsById.get(parsed.cardId) ?? []), parsed.path]);
    for (const [id, paths] of pathsById)
      if (paths.length > 1)
        for (const path of paths) {
          const current = this.index.invalid.get(path) ?? [];
          if (!current.some(error => error.code === "duplicate-card-id"))
            this.index.invalid.set(path, [
              ...current,
              { code: "duplicate-card-id", message: `Duplicate card ID: ${id}` },
            ]);
        }
  }
  getCardState(cardId: string) {
    return [...this.index.cards.values()].find(card => card.cardId === cardId)?.state ?? null;
  }
  private async installProjectSkills(): Promise<void> {
    try {
      const statuses = await installProjectSkills(this.app.vault);
      const changed = Object.values(statuses).filter(status => status !== "unchanged").length;
      new Notice(
        changed === 0
          ? t("notice.skillsUnchanged")
          : t("notice.skillsInstalled", { count: changed }),
      );
    } catch (error) {
      new Notice(t("notice.skillsFailed", { error: String(error) }));
    }
  }
}
