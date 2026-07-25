import { ItemView, type WorkspaceLeaf } from "obsidian";
import { mount, unmount } from "svelte";
import { t } from "../i18n";
import type RetrievaPlugin from "../main";
import RecoveryViewComponent from "./RecoveryView.svelte";
import { RECOVERY_VIEW_TYPE } from "./view-types";

export class RecoveryView extends ItemView {
  private component: object | undefined;
  constructor(
    leaf: WorkspaceLeaf,
    private readonly plugin: RetrievaPlugin,
  ) {
    super(leaf);
  }
  getViewType(): string {
    return RECOVERY_VIEW_TYPE;
  }
  getDisplayText(): string {
    return t("recovery.title");
  }
  override getIcon(): string {
    return "wrench";
  }
  override async onOpen(): Promise<void> {
    await this.plugin.ensureIndexReady();
    this.contentEl.addClass("retrieva-view");
    this.component = mount(RecoveryViewComponent, {
      target: this.contentEl,
      props: { plugin: this.plugin },
    });
  }
  override async onClose(): Promise<void> {
    if (this.component) await unmount(this.component);
  }
}
