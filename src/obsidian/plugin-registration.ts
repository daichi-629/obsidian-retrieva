import type { Plugin } from "obsidian";
import { Notice } from "obsidian";
import { t } from "../i18n";
import type RetrievaPlugin from "../main";
import { CardListView } from "../ui/card-list-view";
import { CreateCardModal } from "../ui/create-card-modal";
import { RecoveryView } from "../ui/recovery-view";
import { ReviewView } from "../ui/review-view";
import { ScopeView } from "../ui/scope-view";
import { SuspendedView } from "../ui/suspended-view";
import {
  CARD_LIST_VIEW_TYPE,
  RECOVERY_VIEW_TYPE,
  REVIEW_VIEW_TYPE,
  SCOPE_VIEW_TYPE,
  SUSPENDED_VIEW_TYPE,
} from "../ui/view-types";

export function registerRetrievaViews(plugin: Plugin, retrieva: RetrievaPlugin): void {
  plugin.registerView(SCOPE_VIEW_TYPE, leaf => new ScopeView(leaf, retrieva));
  plugin.registerView(REVIEW_VIEW_TYPE, leaf => new ReviewView(leaf, retrieva));
  plugin.registerView(RECOVERY_VIEW_TYPE, leaf => new RecoveryView(leaf, retrieva));
  plugin.registerView(SUSPENDED_VIEW_TYPE, leaf => new SuspendedView(leaf, retrieva));
  plugin.registerView(CARD_LIST_VIEW_TYPE, leaf => new CardListView(leaf, retrieva));
}

export interface CommandActions {
  ensureIndexReady(): Promise<void>;
  activateView(type: string): Promise<void>;
  rebuildIndex(): Promise<void>;
  validateVault(): Promise<void>;
  activeCardAction(action: "reset" | "toggle", checking: boolean): boolean;
  installProjectSkills(): Promise<void>;
}

export function registerRetrievaCommands(
  plugin: Plugin,
  retrieva: RetrievaPlugin,
  actions: CommandActions,
): void {
  plugin.addCommand({
    id: "open",
    name: t("command.open"),
    callback: () => void actions.activateView(SCOPE_VIEW_TYPE),
  });
  for (const [id, name, pair] of [
    ["create-card", "command.createCard", false],
    ["create-card-pair", "command.createPair", true],
  ] as const)
    plugin.addCommand({
      id,
      name: t(name),
      callback: async () => {
        await actions.ensureIndexReady();
        new CreateCardModal(retrieva, pair).open();
      },
    });
  plugin.addCommand({
    id: "rebuild-index",
    name: t("command.rebuild"),
    callback: async () => {
      await actions.ensureIndexReady();
      await actions.rebuildIndex();
      new Notice(t("notice.indexRebuilt"));
    },
  });
  plugin.addCommand({
    id: "validate-vault",
    name: t("command.validate"),
    callback: async () => {
      await actions.ensureIndexReady();
      await actions.validateVault();
      await actions.activateView(RECOVERY_VIEW_TYPE);
    },
  });
  plugin.addCommand({
    id: "reset-active-card",
    name: t("command.reset"),
    checkCallback: checking => actions.activeCardAction("reset", checking),
  });
  plugin.addCommand({
    id: "toggle-suspend-active-card",
    name: t("command.toggleSuspend"),
    checkCallback: checking => actions.activeCardAction("toggle", checking),
  });
  plugin.addCommand({
    id: "open-suspended-cards",
    name: t("command.openSuspended"),
    callback: () => void actions.activateView(SUSPENDED_VIEW_TYPE),
  });
  plugin.addCommand({
    id: "install-project-skills",
    name: t("command.installProjectSkills"),
    callback: () => void actions.installProjectSkills(),
  });
}
