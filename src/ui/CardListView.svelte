<script lang="ts">
  import { formatDue, IDENTIFIERS, type CardFilter, type IndexedCard } from "../core";
  import { t } from "../i18n";
  import type RetrievaPlugin from "../main";

  interface Props {
    plugin: RetrievaPlugin;
    scopeName: string;
    filter: CardFilter;
  }
  const { plugin, scopeName, filter }: Props = $props();

  let refreshToken = $state(0);

  $effect(() => plugin.cards.onChange(() => (refreshToken += 1)));

  function dueTimestamp(card: IndexedCard, now: Date): number {
    const due = card.state.due;
    if (!due) return now.getTime();
    return due.kind === "day" ? new Date(`${due.date}T00:00:00`).getTime() : Date.parse(due.at);
  }

  const cards = $derived.by(() => {
    void refreshToken;
    const now = new Date();
    return plugin.cards
      .cardsMatching(filter)
      .slice()
      .sort((left, right) => {
        if (left.state.suspended !== right.state.suspended) return left.state.suspended ? 1 : -1;
        return dueTimestamp(left, now) - dueTimestamp(right, now);
      });
  });

  function title(card: IndexedCard): string {
    return card.path.split("/").pop()?.replace(/\.md$/, "") ?? card.path;
  }

  function tagsFor(card: IndexedCard): string {
    return card.tags
      .filter(value => value !== IDENTIFIERS.cardTag)
      .map(value => `#${value}`)
      .join(" ");
  }

  function due(card: IndexedCard): string {
    return card.state.suspended ? t("cardList.suspended") : formatDue(card.state, new Date());
  }

  function openCard(path: string): void {
    void plugin.openFile(path);
  }
</script>

<h2>{scopeName}</h2>
{#if cards.length === 0}
  <p>{t("cardList.empty")}</p>
{:else}
  <div class="retrieva-list">
    {#each cards as card (card.path)}
      <button class="retrieva-list-row" onclick={() => openCard(card.path)}>
        <span>
          <strong>{title(card)}</strong>
          <small>{tagsFor(card)}</small>
        </span>
        <small>{due(card)}</small>
      </button>
    {/each}
  </div>
{/if}
