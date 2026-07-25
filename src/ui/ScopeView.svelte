<script lang="ts">
  import { Notice } from "obsidian";
  import { buildQueue, buildTagTree, tagFilter } from "../core";
  import { t } from "../i18n";
  import type RetrievaPlugin from "../main";
  import { RECOVERY_VIEW_TYPE, SUSPENDED_VIEW_TYPE } from "./view-types";
  import TagTree from "./TagTree.svelte";

  interface Deck {
    name: string;
    tag: string;
    deletable: boolean;
  }

  interface Props {
    plugin: RetrievaPlugin;
  }
  const { plugin }: Props = $props();

  let refreshToken = $state(0);
  let creatingNew = $state(false);
  let tag = $state("");
  let name = $state("");
  let nameEdited = $state(false);

  $effect(() => plugin.cards.onChange(() => (refreshToken += 1)));
  $effect(() => {
    if (!nameEdited) name = tag;
  });

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
    return [
      { name: t("review.allCards"), tag: "", deletable: false },
      ...saved.map(scope => ({ ...scope, deletable: true })),
    ];
  }

  function allTags(): string[] {
    void refreshToken;
    return plugin.cards.scopeTags();
  }

  function tagTree() {
    return buildTagTree(allTags());
  }

  function invalidCount(): number {
    void refreshToken;
    return plugin.cards.invalidPaths().length;
  }

  function openSuspended(): void {
    void plugin.activateView(SUSPENDED_VIEW_TYPE);
  }

  function openRecovery(): void {
    void plugin.activateView(RECOVERY_VIEW_TYPE);
  }

  function openCardList(deckName: string, deckTag: string): void {
    void plugin.openCardList(deckName, tagFilter(deckTag));
  }

  async function deleteDeck(deck: Deck): Promise<void> {
    const scopes = plugin.settingsStore.value.savedScopes;
    const index = scopes.findIndex(scope => scope.tag === deck.tag && scope.name === deck.name);
    if (index === -1) return;
    scopes.splice(index, 1);
    await plugin.settingsStore.save();
    refreshToken += 1;
  }

  function openRecoveryOnKey(event: KeyboardEvent): void {
    if (event.key === "Enter" || event.key === " ") openRecovery();
  }

  function toggleNewDeck(): void {
    creatingNew = !creatingNew;
    if (!creatingNew) {
      tag = "";
      name = "";
      nameEdited = false;
    }
  }

  function onTagInput(event: Event & { currentTarget: HTMLInputElement }): void {
    tag = event.currentTarget.value.replace(/^#/, "").trim();
  }

  function onNameInput(event: Event & { currentTarget: HTMLInputElement }): void {
    name = event.currentTarget.value;
    nameEdited = true;
  }

  function selectTag(value: string): void {
    tag = value;
  }

  async function saveNewDeck(): Promise<void> {
    if (!tag) {
      new Notice(t("scope.chooseFirst"));
      return;
    }
    if (!name) {
      new Notice(t("scope.nameRequired"));
      return;
    }
    plugin.settingsStore.value.savedScopes.unshift({ name, tag });
    await plugin.settingsStore.save();
    refreshToken += 1;
    creatingNew = false;
    tag = "";
    name = "";
    nameEdited = false;
  }
</script>

<h2>{t("scope.choose")}</h2>
<div class="retrieva-toolbar-actions">
  <button onclick={openSuspended}>{t("review.openSuspended")}</button>
</div>
{#if invalidCount()}
  <div
    class="retrieva-banner"
    onclick={openRecovery}
    onkeydown={openRecoveryOnKey}
    role="button"
    tabindex="0"
  >
    {t("review.invalidBanner", { count: invalidCount() })}
  </div>
{/if}
<div class="retrieva-list">
  {#each decks() as deck (deck.tag + "::" + deck.name)}
    <div class="retrieva-list-row">
      <button class="retrieva-list-row-main" onclick={() => plugin.openReview(deck.name, deck.tag)}>
        <span>{deck.name}</span>
        <small>{count(deck.tag)}</small>
      </button>
      <span class="retrieva-toolbar-actions">
        <button onclick={() => openCardList(deck.name, deck.tag)}>{t("scope.cardList")}</button>
        {#if deck.deletable}
          <button onclick={() => deleteDeck(deck)}>{t("settings.delete")}</button>
        {/if}
      </span>
    </div>
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
      <TagTree
        nodes={tagTree()}
        count={value => plugin.cards.cardsForTag(value).length}
        onSelect={selectTag}
      />
    {/if}
  </div>
  <div class="retrieva-form-row">
    <label for="retrieva-name-input">{t("scope.name")}</label>
    <input id="retrieva-name-input" type="text" value={name} oninput={onNameInput} />
  </div>
  <div class="retrieva-form-row retrieva-form-row-end">
    <button class="mod-cta" onclick={saveNewDeck}>{t("common.save")}</button>
  </div>
{/if}
