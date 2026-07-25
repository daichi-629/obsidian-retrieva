import { ItemView, type WorkspaceLeaf } from "obsidian";
import { mount, unmount } from "svelte";
import { t } from "../i18n";
import type RetrievaPlugin from "../main";
import SuspendedViewComponent from "./SuspendedView.svelte";
import { suspendedContext } from "./view-context";
import { SUSPENDED_VIEW_TYPE } from "./view-types";

export class SuspendedView extends ItemView {
  private component: object | undefined;
  constructor(
    leaf: WorkspaceLeaf,
    private readonly plugin: RetrievaPlugin,
  ) {
    super(leaf);
  }
  getViewType(): string {
    return SUSPENDED_VIEW_TYPE;
  }
  getDisplayText(): string {
    return t("suspended.title");
  }
  override getIcon(): string {
    return "circle-pause";
  }
  override async onOpen(): Promise<void> {
    await this.plugin.ensureIndexReady();
    this.contentEl.addClass("retrieva-view");
    this.component = mount(SuspendedViewComponent, {
      target: this.contentEl,
      props: { context: suspendedContext(this.plugin) },
    });
  }
  override async onClose(): Promise<void> {
    if (this.component) await unmount(this.component);
  }
}
