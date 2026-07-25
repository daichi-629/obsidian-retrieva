import { ItemView, type WorkspaceLeaf } from "obsidian";
import { mount, unmount } from "svelte";
import { t } from "../i18n";
import type RetrievaPlugin from "../main";
import ReviewViewComponent from "./ReviewView.svelte";
import { reviewContext } from "./view-context";
import { REVIEW_VIEW_TYPE } from "./view-types";

export class ReviewView extends ItemView {
  scopeName = t("review.allCards");
  tag = "";
  private component: object | undefined;
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
    this.mountComponent();
  }
  override async onOpen(): Promise<void> {
    await this.plugin.ensureIndexReady();
    this.mountComponent();
  }
  override async onClose(): Promise<void> {
    if (this.component) await unmount(this.component);
  }
  private mountComponent(): void {
    if (this.component) {
      void unmount(this.component);
      this.component = undefined;
    }
    this.contentEl.empty();
    this.contentEl.addClass("retrieva-view");
    this.contentEl.addClass("retrieva-review-view");
    this.component = mount(ReviewViewComponent, {
      target: this.contentEl,
      props: {
        context: reviewContext(this.plugin),
        view: this,
        scopeName: this.scopeName,
        tag: this.tag,
      },
    });
  }
}
