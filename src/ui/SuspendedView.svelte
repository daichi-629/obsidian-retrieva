<script lang="ts">
  import { Notice } from "obsidian";
  import { SvelteSet } from "svelte/reactivity";
  import { IDENTIFIERS, type IndexedCard } from "../core";
  import { t } from "../i18n";
  import type { SuspendedContext } from "./view-context";

  interface Props {
    context: SuspendedContext;
  }
  const { context }: Props = $props();

  let refreshToken = $state(0);
  const resuming = new SvelteSet<string>();

  $effect(() => context.index.onChange(() => (refreshToken += 1)));

  const cards = $derived.by(() => {
    void refreshToken;
    return context.index
      .listCards()
      .filter(card => card.state.suspended)
      .sort((left, right) => left.path.localeCompare(right.path));
  });

  function tagsFor(card: IndexedCard): string {
    return card.tags
      .filter(tag => tag !== IDENTIFIERS.cardTag)
      .map(tag => `#${tag}`)
      .join(" ");
  }

  function openCard(path: string): void {
    void context.openFile(path);
  }

  async function resume(path: string, lastEventId: string): Promise<void> {
    resuming.add(path);
    try {
      const result = await context.cards.stateChange(
        path,
        lastEventId,
        "resume",
        new Date(),
        Intl.DateTimeFormat().resolvedOptions().timeZone,
      );
      if (result.status === "stale") new Notice(result.reason);
      else new Notice(t("notice.cardResumed"));
    } finally {
      resuming.delete(path);
    }
  }
</script>

<h2>{t("suspended.title")}</h2>
{#if cards.length === 0}
  <p>{t("suspended.empty")}</p>
{:else}
  <div class="retrieva-list">
    {#each cards as card (card.path)}
      <div class="retrieva-list-row">
        <span>
          <strong>{card.path}</strong>
          <small>{tagsFor(card)}</small>
        </span>
        <span class="retrieva-toolbar-actions">
          <button onclick={() => openCard(card.path)}>{t("review.openCard")}</button>
          <button
            disabled={resuming.has(card.path)}
            onclick={() => resume(card.path, card.lastEventId)}
          >
            {t("review.resume")}
          </button>
        </span>
      </div>
    {/each}
  </div>
{/if}
