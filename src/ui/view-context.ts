import { MarkdownRenderer, type ItemView } from "obsidian";
import type { CardFilter, CardIndexReader, Preset, PresetCatalog } from "../core";
import type { CardRecoveryService } from "../core/card-recovery-service";
import type { CardService } from "../core/card-service";
import type RetrievaPlugin from "../main";
import { ConfirmModal } from "./confirm-modal";
import { t } from "../i18n";
import { RECOVERY_VIEW_TYPE, SUSPENDED_VIEW_TYPE } from "./view-types";

export interface CardListContext {
  index: CardIndexReader;
  openFile(path: string): Promise<void>;
}
export interface RecoveryContext {
  index: CardIndexReader;
  recovery: CardRecoveryService;
  openFile(path: string): Promise<void>;
}
export interface SuspendedContext {
  index: CardIndexReader;
  cards: CardService;
  openFile(path: string): Promise<void>;
}
export interface ReviewContext {
  index: CardIndexReader;
  presets: PresetCatalog;
  cards: CardService;
  effectivePresets(): Map<string, Preset>;
  openFile(path: string): Promise<void>;
  renderMarkdown(source: string, target: HTMLElement, path: string, view: ItemView): Promise<void>;
}
export interface ScopeContext {
  index: CardIndexReader;
  effectivePresets(): Map<string, Preset>;
  savedScopes(): { name: string; tag: string }[];
  saveScopes(scopes: { name: string; tag: string }[]): Promise<void>;
  confirmDelete(name: string): Promise<boolean>;
  openReview(name: string, tag: string): Promise<void>;
  openCardList(name: string, filter: CardFilter): Promise<void>;
  openSuspended(): Promise<void>;
  openRecovery(): Promise<void>;
}

export const cardListContext = (plugin: RetrievaPlugin): CardListContext => ({
  index: plugin.index,
  openFile: path => plugin.openFile(path),
});
export const recoveryContext = (plugin: RetrievaPlugin): RecoveryContext => ({
  index: plugin.index,
  recovery: plugin.recovery,
  openFile: path => plugin.openFile(path),
});
export const suspendedContext = (plugin: RetrievaPlugin): SuspendedContext => ({
  index: plugin.index,
  cards: plugin.cards,
  openFile: path => plugin.openFile(path),
});
export const reviewContext = (plugin: RetrievaPlugin): ReviewContext => ({
  index: plugin.index,
  presets: plugin.presets,
  cards: plugin.cards,
  effectivePresets: () => plugin.presetResolver.resolveAll(),
  openFile: path => plugin.openFile(path),
  renderMarkdown: (source, target, path, view) =>
    MarkdownRenderer.render(plugin.app, source, target, path, view),
});
export const scopeContext = (plugin: RetrievaPlugin): ScopeContext => ({
  index: plugin.index,
  effectivePresets: () => plugin.presetResolver.resolveAll(),
  savedScopes: () => plugin.settingsStore.value.savedScopes.map(scope => ({ ...scope })),
  saveScopes: async scopes => {
    plugin.settingsStore.value.savedScopes = scopes.map(scope => ({ ...scope }));
    await plugin.settingsStore.save();
  },
  confirmDelete: name => new ConfirmModal(plugin.app, t("scope.confirmDelete", { name })).confirm(),
  openReview: (name, tag) => plugin.openReview(name, tag),
  openCardList: (name, filter) => plugin.openCardList(name, filter),
  openSuspended: () => plugin.activateView(SUSPENDED_VIEW_TYPE),
  openRecovery: () => plugin.activateView(RECOVERY_VIEW_TYPE),
});
