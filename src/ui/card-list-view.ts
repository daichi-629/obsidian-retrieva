import { ItemView, type WorkspaceLeaf } from "obsidian";
import { mount, unmount } from "svelte";
import { tagFilter, type CardFilter } from "../core";
import { t } from "../i18n";
import type RetrievaPlugin from "../main";
import CardListViewComponent from "./CardListView.svelte";
import { cardListContext } from "./view-context";
import { CARD_LIST_VIEW_TYPE } from "./view-types";

export class CardListView extends ItemView {
  scopeName = t("review.allCards");
  filter: CardFilter = tagFilter("");
  private component: object | undefined;
  constructor(
    leaf: WorkspaceLeaf,
    private readonly plugin: RetrievaPlugin,
  ) {
    super(leaf);
  }
  getViewType(): string {
    return CARD_LIST_VIEW_TYPE;
  }
  getDisplayText(): string {
    return `${t("scope.cardList")}: ${this.scopeName}`;
  }
  override getIcon(): string {
    return "list";
  }
  setScope(name: string, filter: CardFilter): void {
    this.scopeName = name;
    this.filter = filter;
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
    this.component = mount(CardListViewComponent, {
      target: this.contentEl,
      props: {
        context: cardListContext(this.plugin),
        scopeName: this.scopeName,
        filter: this.filter,
      },
    });
  }
}
