import { ItemView, type WorkspaceLeaf } from "obsidian";
import { mount, unmount } from "svelte";
import type RetrievaPlugin from "../main";
import ScopeViewComponent from "./ScopeView.svelte";
import { scopeContext } from "./view-context";
import { SCOPE_VIEW_TYPE } from "./view-types";

export class ScopeView extends ItemView {
  private component: object | undefined;
  constructor(
    leaf: WorkspaceLeaf,
    private readonly plugin: RetrievaPlugin,
  ) {
    super(leaf);
  }
  getViewType(): string {
    return SCOPE_VIEW_TYPE;
  }
  getDisplayText(): string {
    return "Retrieva";
  }
  override getIcon(): string {
    return "brain-circuit";
  }
  override async onOpen(): Promise<void> {
    await this.plugin.ensureIndexReady();
    this.contentEl.addClass("retrieva-view");
    this.component = mount(ScopeViewComponent, {
      target: this.contentEl,
      props: { context: scopeContext(this.plugin) },
    });
  }
  override async onClose(): Promise<void> {
    if (this.component) await unmount(this.component);
  }
}
