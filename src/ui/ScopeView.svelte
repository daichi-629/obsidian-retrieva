<script lang="ts">
  import { Notice } from "obsidian";
  import { buildQueue } from "../core";
  import { t } from "../i18n";
  import type RetrievaPlugin from "../main";
  import { SUSPENDED_VIEW_TYPE } from "./view-types";

  interface Deck {
    name: string;
    tag: string;
  }

  interface Props {
    plugin: RetrievaPlugin;
  }
  const { plugin }: Props = $props();

  let refreshToken = $state(0);
  let creatingNew = $state(false);
  let tag = $state("");
  let save = $state(false);
  let name = $state("");

  $effect(() => plugin.cards.onChange(() => (refreshToken += 1)));

  function count(tagValue: string): string {
    void refreshToken;
    const queue = buildQueue(
      plugin.cards.cardsForTag(tagValue),
      plugin.effectivePresets(),
      new Date(),
    );
    return `${queue.ready.length} / ${queue.totalValid}`;
  }

  function decks(): Deck[] {
    void refreshToken;
    const saved = plugin.settingsStore.value.savedScopes;
    const savedTags = new Set(saved.map(scope => scope.tag));
    const tags = plugin.cards.scopeTags().filter(tagValue => !savedTags.has(tagValue));
    return [
      { name: t("review.allCards"), tag: "" },
      ...saved,
      ...tags.map(tagValue => ({ name: `#${tagValue}`, tag: tagValue })),
    ];
  }

  function allTags(): string[] {
    void refreshToken;
    return plugin.cards.scopeTags();
  }

  function openSuspended(): void {
    void plugin.activateView(SUSPENDED_VIEW_TYPE);
  }

  function toggleNewDeck(): void {
    creatingNew = !creatingNew;
    if (!creatingNew) {
      tag = "";
      save = false;
      name = "";
    }
  }

  function onTagInput(event: Event & { currentTarget: HTMLInputElement }): void {
    tag = event.currentTarget.value.replace(/^#/, "").trim();
  }

  async function submitNewDeck(): Promise<void> {
    if (!tag) {
      new Notice(t("scope.chooseFirst"));
      return;
    }
    if (save && name) {
      plugin.settingsStore.value.savedScopes.push({ name, tag });
      await plugin.settingsStore.save();
    }
    const finalName = name || `#${tag}`;
    const finalTag = tag;
    creatingNew = false;
    await plugin.openReview(finalName, finalTag);
  }
</script>

<h2>{t("scope.choose")}</h2>
<div class="retrieva-toolbar-actions">
  <button onclick={openSuspended}>{t("review.openSuspended")}</button>
</div>
<div class="retrieva-list">
  {#each decks() as deck (deck.tag + "::" + deck.name)}
    <button class="retrieva-list-row" onclick={() => plugin.openReview(deck.name, deck.tag)}>
      <span>{deck.name}</span>
      <small>{count(deck.tag)}</small>
    </button>
  {/each}
  <button class="retrieva-list-row retrieva-list-row-new" onclick={toggleNewDeck}>
    {creatingNew ? t("scope.closeNewDeck") : t("scope.newDeck")}
  </button>
</div>

{#if creatingNew}
  <p>{tag ? count(tag) : t("scope.selectTag")}</p>
  <div class="retrieva-form-row">
    <label for="retrieva-tag-input">{t("scope.tag")}</label>
    <input
      id="retrieva-tag-input"
      type="search"
      placeholder="Flashcards/example"
      list="retrieva-tags"
      value={tag}
      oninput={onTagInput}
    />
    <datalist id="retrieva-tags">
      {#each allTags() as value (value)}
        <option {value}></option>
      {/each}
    </datalist>
  </div>
  <div class="retrieva-tag-candidates" aria-label={t("scope.cardTags")}>
    <small class="retrieva-tag-candidates-label">{t("scope.cardTags")}</small>
    {#if allTags().length === 0}
      <small>{t("scope.noCardTags")}</small>
    {:else}
      {#each allTags() as value (value)}
        <button class="retrieva-tag-candidate" onclick={() => (tag = value)}>
          {t("scope.cardTagCount", { tag: value, count: plugin.cards.cardsForTag(value).length })}
        </button>
      {/each}
    {/if}
  </div>
  <div class="retrieva-form-row">
    <label for="retrieva-save-toggle">{t("scope.saveWithName")}</label>
    <input id="retrieva-save-toggle" type="checkbox" bind:checked={save} />
  </div>
  {#if save}
    <div class="retrieva-form-row">
      <label for="retrieva-name-input">{t("scope.name")}</label>
      <input id="retrieva-name-input" type="text" bind:value={name} />
    </div>
  {/if}
  <div class="retrieva-form-row retrieva-form-row-end">
    <button class="mod-cta" onclick={submitNewDeck}>{t("common.start")}</button>
  </div>
{/if}
