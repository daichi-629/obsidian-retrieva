import { ItemView, MarkdownRenderer, Notice, setIcon, type WorkspaceLeaf } from "obsidian";
import {
  buildQueue,
  calculateAnswerCandidates,
  formatDue,
  RATINGS,
  type CardState,
  type IndexedCard,
  type Rating,
} from "../core";
import type RetrievaPlugin from "../main";
import { t } from "../i18n";
import { RECOVERY_VIEW_TYPE, REVIEW_VIEW_TYPE } from "./view-types";

interface UndoRecord {
  path: string;
  eventId: string;
  sourceAfter: string;
}
export class ReviewView extends ItemView {
  scopeName = t("review.allCards");
  tag = "";
  private current: IndexedCard | null = null;
  private shownAnswer = false;
  private shownAt = Date.now();
  private undoRecord: UndoRecord | null = null;
  constructor(
    leaf: WorkspaceLeaf,
    private readonly plugin: RetrievaPlugin,
  ) {
    super(leaf);
  }
  getViewType(): string {
    return REVIEW_VIEW_TYPE;
  }
  getDisplayText(): string {
    return `Retrieva: ${this.scopeName}`;
  }
  override getIcon(): string {
    return "brain-circuit";
  }
  setScope(name: string, tag: string): void {
    this.scopeName = name;
    this.tag = tag;
    this.current = null;
    void this.display();
  }
  override async onOpen(): Promise<void> {
    this.register(
      this.plugin.index.onChange(() => {
        void this.display();
      }),
    );
    await this.display();
  }
  private queue() {
    return buildQueue(
      this.plugin.index.cardsForTag(this.tag),
      this.plugin.effectivePresets(),
      new Date(),
    );
  }
  private iconButton(parent: HTMLElement, icon: string, label: string, action: () => void): void {
    const button = parent.createEl("button", {
      cls: "clickable-icon",
      attr: { "aria-label": label },
    });
    setIcon(button, icon);
    button.onclick = action;
  }
  private async display(): Promise<void> {
    const root = this.contentEl;
    root.empty();
    root.addClass("retrieva-view");
    const queue = this.queue();
    const toolbar = root.createDiv("retrieva-toolbar");
    toolbar.createEl("strong", {
      text: `${queue.ready.length} / ${queue.totalValid} · ${this.scopeName}`,
    });
    const actions = toolbar.createDiv();
    this.iconButton(actions, "undo-2", t("review.undo"), () => {
      void this.undo();
    });
    if (this.current) {
      this.iconButton(
        actions,
        this.current.state.suspended ? "play" : "pause",
        this.current.state.suspended ? t("review.resume") : t("review.suspend"),
        () => {
          void this.toggleSuspend();
        },
      );
      this.iconButton(actions, "file", t("review.openCard"), () => {
        void this.plugin.openFile(this.current!.path);
      });
    }
    if (this.plugin.index.invalid.size) {
      const banner = root.createDiv("retrieva-banner");
      banner.setText(t("review.invalidBanner", { count: this.plugin.index.invalid.size }));
      banner.onclick = () => {
        void this.plugin.activateView(RECOVERY_VIEW_TYPE);
      };
    }
    const next = queue.ready[0] ?? null;
    const refreshed = this.current ? this.plugin.index.cards.get(this.current.path) : undefined;
    if (!this.current || !refreshed) {
      this.current = next;
      this.shownAnswer = false;
      this.shownAt = Date.now();
    } else if (refreshed.lastEventId !== this.current.lastEventId) {
      this.current = refreshed;
      this.shownAnswer = false;
      this.shownAt = Date.now();
    } else this.current = refreshed;
    if (!this.current) {
      root.createEl("h2", { text: t("review.complete") });
      if (queue.nextDue)
        root.createEl("p", {
          text: t("review.nextDue", {
            due:
              queue.nextDue.kind === "day"
                ? queue.nextDue.date
                : new Date(queue.nextDue.at).toLocaleString(),
          }),
        });
      return;
    }
    const parsed = this.plugin.index.parsed.get(this.current.path);
    const preset = this.plugin.index.presets.get(this.current.presetId);
    if (!parsed || !preset) {
      this.current = null;
      return this.display();
    }
    const card = root.createDiv("retrieva-card");
    await MarkdownRenderer.render(this.app, parsed.front, card, this.current.path, this);
    if (this.current.state.suspended) {
      card.createEl("p", { text: t("review.suspended") });
      return;
    }
    if (!this.shownAnswer) {
      card.createEl("p", { text: t("review.showAnswer"), cls: "mod-muted" });
      card.onclick = () => {
        this.shownAnswer = true;
        void this.display();
      };
      return;
    }
    const answer = card.createDiv("retrieva-answer");
    await MarkdownRenderer.render(this.app, parsed.back, answer, this.current.path, this);
    const now = new Date();
    const candidates = calculateAnswerCandidates(
      this.current.state,
      preset,
      now,
      this.current.events.at(-1)?.at,
    );
    const ratings = root.createDiv("retrieva-ratings");
    for (const rating of RATINGS) {
      const button = ratings.createEl("button", { cls: `retrieva-rating retrieva-${rating}` });
      button.createSpan({ text: t(`review.${rating}`) });
      button.createEl("small", { text: formatDue(candidates[rating], now) });
      button.onclick = () => {
        void this.answer(rating, preset.fingerprint);
      };
    }
  }
  private async answer(rating: Rating, fingerprint: string): Promise<void> {
    if (!this.current) return;
    const card = this.current;
    const result = await this.plugin.repository.review(
      card.path,
      card.lastEventId,
      fingerprint,
      rating,
      Date.now() - this.shownAt,
      new Date(),
      Intl.DateTimeFormat().resolvedOptions().timeZone,
    );
    if (result.status === "stale") {
      new Notice(result.reason);
      this.current = null;
      if (result.reason.startsWith("Preset")) await this.plugin.index.rebuild();
      else await this.plugin.index.refresh(card.path);
    } else {
      this.undoRecord = {
        path: card.path,
        eventId: result.eventId,
        sourceAfter: result.sourceAfter,
      };
      this.current = null;
      this.shownAnswer = false;
      this.shownAt = Date.now();
    }
    await this.display();
  }
  private async undo(): Promise<void> {
    if (!this.undoRecord) {
      new Notice(t("review.noUndo"));
      return;
    }
    if (
      !(await this.plugin.repository.undo(
        this.undoRecord.path,
        this.undoRecord.eventId,
        this.undoRecord.sourceAfter,
      ))
    ) {
      new Notice(t("review.undoUnavailable"));
      this.undoRecord = null;
      return;
    }
    this.undoRecord = null;
    this.current = null;
    await this.display();
  }
  private async toggleSuspend(): Promise<void> {
    if (!this.current) return;
    const card = this.current;
    const type = card.state.suspended ? "resume" : "suspend";
    const result = await this.plugin.repository.stateChange(
      card.path,
      card.lastEventId,
      type,
      new Date(),
      Intl.DateTimeFormat().resolvedOptions().timeZone,
    );
    if (result.status === "stale") {
      new Notice(result.reason);
      this.current = null;
    } else this.current = this.plugin.index.cards.get(card.path) ?? null;
    await this.display();
  }
}
