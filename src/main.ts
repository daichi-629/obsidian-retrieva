import { moment, Notice, Plugin, normalizePath } from "obsidian";
import {
  CardService,
  CardCreator,
  CardRecoveryService,
  CardWriteLock,
  IDENTIFIERS,
  type CardFilter,
  type CardIndexReader,
  type PresetCatalog,
} from "./core";
import { PresetResolver } from "./application/preset-resolver";
import { VaultIndexService } from "./application/vault-index-service";
import { CardIndex } from "./obsidian/card-index";
import { ObsidianFileAdapter } from "./obsidian/file-adapter";
import { registerRetrievaCommands, registerRetrievaViews } from "./obsidian/plugin-registration";
import { DEFAULT_SETTINGS, RetrievaSettingTab, SettingsStore } from "./settings";
import { initializeI18n, t } from "./i18n";
import { installProjectSkills, projectSkillConflicts } from "./llm/skill-installer";
import { ConfirmSkillOverwriteModal } from "./ui/confirm-skill-overwrite-modal";
import { CardListView } from "./ui/card-list-view";
import { ReviewView } from "./ui/review-view";
import {
  CARD_LIST_VIEW_TYPE,
  RECOVERY_VIEW_TYPE,
  REVIEW_VIEW_TYPE,
  SCOPE_VIEW_TYPE,
  SUSPENDED_VIEW_TYPE,
} from "./ui/view-types";

export default class RetrievaPlugin extends Plugin {
  settingsStore!: SettingsStore;
  cards!: CardService;
  creator!: CardCreator;
  recovery!: CardRecoveryService;
  index!: CardIndexReader;
  presets!: PresetCatalog;
  presetResolver!: PresetResolver;
  private indexOperations!: VaultIndexService;
  private files!: ObsidianFileAdapter;
  private indexInitialization: Promise<void> | null = null;
  override async onload(): Promise<void> {
    await initializeI18n(moment.locale());
    this.settingsStore = new SettingsStore(this);
    await this.settingsStore.load();
    this.files = new ObsidianFileAdapter(this);
    const cache = new CardIndex(
      this,
      this.files,
      () => this.settingsStore.value.excludedDirectories,
    );
    const cardWriteLock = new CardWriteLock();
    this.cards = new CardService(this.files, cache, cache, cardWriteLock);
    this.creator = new CardCreator(this.files, cache);
    this.recovery = new CardRecoveryService(this.files, cache, cache, cardWriteLock);
    this.index = cache;
    this.presets = cache;
    this.presetResolver = new PresetResolver(this.presets, () => ({
      excludeNewSiblingsToday: this.settingsStore.value.excludeNewSiblingsToday,
      excludeReviewSiblingsToday: this.settingsStore.value.excludeReviewSiblingsToday,
    }));
    this.indexOperations = new VaultIndexService(cache, cache, () => this.ensureDefaultPreset());
    registerRetrievaViews(this, this);
    registerRetrievaCommands(this, this, {
      ensureIndexReady: () => this.ensureIndexReady(),
      activateView: type => this.activateView(type),
      rebuildIndex: () => this.indexOperations.rebuild(),
      validateVault: () => this.indexOperations.validateVault(),
      activeCardAction: (action, checking) => this.activeCardAction(action, checking),
      installProjectSkills: () => this.installProjectSkills(),
    });
    this.addSettingTab(
      new RetrievaSettingTab(this.app, this, this.settingsStore, {
        openPreset: path => this.openFile(path),
        presetPaths: () => this.presets.presetPaths(),
        installProjectSkills: () => this.installProjectSkills(),
        rebuildIndex: async () => {
          await this.ensureIndexReady();
          await this.indexOperations.rebuild();
        },
      }),
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
    void this.app.workspace.detachLeavesOfType(SUSPENDED_VIEW_TYPE);
    void this.app.workspace.detachLeavesOfType(CARD_LIST_VIEW_TYPE);
  }
  async activateView(type: string): Promise<void> {
    await this.ensureIndexReady();
    let leaf = this.app.workspace.getLeavesOfType(type)[0];
    if (!leaf) {
      leaf = this.app.workspace.getLeaf("tab");
      await leaf.setViewState({ type, active: true });
    }
    this.app.workspace.setActiveLeaf(leaf, { focus: true });
  }
  async openReview(name: string, tag: string): Promise<void> {
    await this.activateView(REVIEW_VIEW_TYPE);
    const view = this.app.workspace.getLeavesOfType(REVIEW_VIEW_TYPE)[0]?.view;
    if (view instanceof ReviewView) view.setScope(name, tag);
  }
  async openCardList(name: string, filter: CardFilter): Promise<void> {
    await this.activateView(CARD_LIST_VIEW_TYPE);
    const view = this.app.workspace.getLeavesOfType(CARD_LIST_VIEW_TYPE)[0]?.view;
    if (view instanceof CardListView) view.setScope(name, filter);
  }
  async openFile(path: string): Promise<void> {
    const file = this.files.get(path);
    if (file) await this.app.workspace.getLeaf("tab").openFile(file);
  }
  async ensureIndexReady(): Promise<void> {
    this.indexInitialization ??= this.initializeIndex();
    await this.indexInitialization;
  }
  private async initializeIndex(): Promise<void> {
    await this.indexOperations.initialize();
  }
  private async ensureDefaultPreset(): Promise<void> {
    const path = normalizePath("Retrieva/Presets/default.md");
    if (this.files.get(path)) return;
    const source = `---\n${IDENTIFIERS.presetDefinitionKey}: true\n${IDENTIFIERS.presetIdKey}: default\nscheduler: fsrs\ndesired-retention: 0.9\nmaximum-interval-days: 36500\nlearning-steps:\n  - 1m\n  - 10m\nrelearning-steps:\n  - 10m\nexclude-new-siblings-today: ${DEFAULT_SETTINGS.excludeNewSiblingsToday}\nexclude-review-siblings-today: ${DEFAULT_SETTINGS.excludeReviewSiblingsToday}\n---\n\n# Default SRS preset\n`;
    await this.files.create(path, source);
  }
  async createCards(input: {
    front: string;
    back: string;
    filename: string;
    presetId: string;
    pair: boolean;
  }): Promise<void> {
    await this.ensureIndexReady();
    const folder = this.settingsStore.value.cardsFolder.replace(/^\/+|\/+$/g, "");
    const result = await this.creator.create({ ...input, folder });
    if (result.status === "exists") {
      new Notice(t("notice.fileExists"));
      return;
    }
    if (result.reverseError) new Notice(t("notice.reverseFailed", { error: result.reverseError }));
    await this.openFile(result.paths[0]!);
  }
  private activeCardAction(action: "reset" | "toggle", checking: boolean): boolean {
    const path = this.app.workspace.getActiveFile()?.path;
    const card = path ? this.index.getCard(path) : undefined;
    if (!card) return false;
    if (checking) return true;
    const type = action === "reset" ? "reset" : card.state.suspended ? "resume" : "suspend";
    void this.cards
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
  private async installProjectSkills(): Promise<void> {
    try {
      const conflicts = await projectSkillConflicts(this.app.vault);
      if (
        conflicts.length > 0 &&
        !(await new ConfirmSkillOverwriteModal(this.app, conflicts).confirm())
      )
        return;
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
