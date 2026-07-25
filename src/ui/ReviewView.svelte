<script lang="ts">
  import { MarkdownRenderer, Notice, type ItemView } from "obsidian";
  import { untrack } from "svelte";
  import { SvelteSet } from "svelte/reactivity";
  import {
    buildQueue,
    calculateAnswerCandidates,
    formatDue,
    RATINGS,
    type IndexedCard,
    type Rating,
  } from "../core";
  import { t } from "../i18n";
  import type RetrievaPlugin from "../main";
  import { RECOVERY_VIEW_TYPE } from "./view-types";

  interface UndoRecord {
    path: string;
    eventId: string;
    sourceAfter: string;
  }

  interface Props {
    plugin: RetrievaPlugin;
    view: ItemView;
    scopeName: string;
    tag: string;
  }
  const { plugin, view, scopeName, tag }: Props = $props();

  let refreshToken = $state(0);
  let current = $state<IndexedCard | null>(null);
  let shownAnswer = $state(false);
  let shownAt = $state(Date.now());
  let undoRecord = $state<UndoRecord | null>(null);
  let stateChanging = $state(false);
  let skippedFinished = $state(false);
  const skipped = new SvelteSet<string>();

  $effect(() => plugin.index.onChange(() => (refreshToken += 1)));

  const queue = $derived.by(() => {
    void refreshToken;
    return buildQueue(plugin.index.cardsForTag(tag), plugin.effectivePresets(), new Date());
  });
  const ready = $derived(queue.ready.filter(card => !skipped.has(card.path)));
  const skippedCount = $derived(queue.ready.length - ready.length);
  const next = $derived(skippedFinished ? null : (ready[0] ?? null));

  function reconcile(): void {
    const currentBefore = untrack(() => current);
    const refreshed = currentBefore ? plugin.index.cards.get(currentBefore.path) : undefined;
    let candidate: IndexedCard | null;
    let resetAnswer = false;
    if (!currentBefore || !refreshed || refreshed.state.suspended) {
      candidate = next;
      resetAnswer = true;
    } else if (refreshed.lastEventId !== currentBefore.lastEventId) {
      candidate = refreshed;
      resetAnswer = true;
    } else {
      candidate = refreshed;
    }
    if (
      candidate &&
      (!plugin.index.parsed.get(candidate.path) || !plugin.index.presets.get(candidate.presetId))
    ) {
      candidate = null;
      resetAnswer = true;
    }
    current = candidate;
    if (resetAnswer) {
      shownAnswer = false;
      shownAt = Date.now();
    }
  }

  $effect(() => {
    void next;
    reconcile();
  });

  const parsed = $derived(current ? plugin.index.parsed.get(current.path) : undefined);
  const preset = $derived(current ? plugin.index.presets.get(current.presetId) : undefined);
  const invalidCount = $derived.by(() => {
    void refreshToken;
    return plugin.index.invalid.size;
  });
  const answerContext = $derived.by(() => {
    if (!current || !preset || !shownAnswer) return null;
    const now = new Date();
    return {
      now,
      candidates: calculateAnswerCandidates(current.state, preset, now, current.events.at(-1)?.at),
    };
  });

  interface MdParams {
    source: string;
    path: string;
  }
  function markdownAction(node: HTMLElement, params: MdParams) {
    function run(p: MdParams): void {
      node.empty();
      void MarkdownRenderer.render(plugin.app, p.source, node, p.path, view);
    }
    run(params);
    return {
      update: run,
      destroy(): void {
        node.empty();
      },
    };
  }

  function skip(): void {
    if (!current) return;
    skipped.add(current.path);
    current = null;
    reconcile();
  }

  function toggleSuspend(): void {
    if (!current || stateChanging) return;
    stateChanging = true;
    const card = current;
    const type = card.state.suspended ? "resume" : "suspend";
    void plugin.repository
      .stateChange(
        card.path,
        card.lastEventId,
        type,
        new Date(),
        Intl.DateTimeFormat().resolvedOptions().timeZone,
      )
      .then(result => {
        if (result.status === "stale") {
          new Notice(result.reason);
          current = null;
        } else {
          current = type === "suspend" ? null : (plugin.index.cards.get(card.path) ?? null);
        }
        reconcile();
      })
      .finally(() => {
        stateChanging = false;
      });
  }

  function openCard(): void {
    if (!current) return;
    void plugin.openFile(current.path);
  }

  function openRecovery(): void {
    void plugin.activateView(RECOVERY_VIEW_TYPE);
  }

  function openRecoveryOnKey(event: KeyboardEvent): void {
    if (event.key === "Enter" || event.key === " ") openRecovery();
  }

  function reveal(): void {
    shownAnswer = true;
  }

  function retrySkipped(): void {
    skipped.clear();
    current = null;
    reconcile();
  }

  function finishSkipped(): void {
    skippedFinished = true;
    current = null;
    reconcile();
  }

  async function submitAnswer(rating: Rating): Promise<void> {
    if (!current || !preset) return;
    const card = current;
    const result = await plugin.repository.review(
      card.path,
      card.lastEventId,
      preset.fingerprint,
      rating,
      Date.now() - shownAt,
      new Date(),
      Intl.DateTimeFormat().resolvedOptions().timeZone,
    );
    if (result.status === "stale") {
      new Notice(result.reason);
      current = null;
      reconcile();
      if (result.reason.startsWith("Preset")) await plugin.index.rebuild();
      else await plugin.index.refresh(card.path);
    } else {
      undoRecord = { path: card.path, eventId: result.eventId, sourceAfter: result.sourceAfter };
      current = null;
      reconcile();
    }
  }

  async function undo(): Promise<void> {
    if (!undoRecord) {
      new Notice(t("review.noUndo"));
      return;
    }
    if (
      !(await plugin.repository.undo(undoRecord.path, undoRecord.eventId, undoRecord.sourceAfter))
    ) {
      new Notice(t("review.undoUnavailable"));
      undoRecord = null;
      return;
    }
    undoRecord = null;
    current = null;
    reconcile();
  }
</script>

<div class="retrieva-toolbar">
  <strong>{ready.length} / {queue.totalValid} · {scopeName}</strong>
  <div class="retrieva-toolbar-actions">
    <button onclick={undo}>{t("review.undo")}</button>
    {#if current}
      <button onclick={toggleSuspend}>{t("review.suspend")}</button>
      <button onclick={skip}>{t("review.skip")}</button>
      <button onclick={openCard}>{t("review.openCard")}</button>
    {/if}
  </div>
</div>
{#if invalidCount}
  <div
    class="retrieva-banner"
    onclick={openRecovery}
    onkeydown={openRecoveryOnKey}
    role="button"
    tabindex="0"
  >
    {t("review.invalidBanner", { count: invalidCount })}
  </div>
{/if}
{#if current && parsed && preset}
  <div class="retrieva-review-content">
    <div class="retrieva-card">
      <div use:markdownAction={{ source: parsed.front, path: current.path }}></div>
      {#if current.state.suspended}
        <p>{t("review.suspended")}</p>
      {:else if shownAnswer}
        <div
          class="retrieva-answer"
          use:markdownAction={{ source: parsed.back, path: current.path }}
        ></div>
      {/if}
    </div>
  </div>
  {#if !current.state.suspended}
    <div class="retrieva-footer">
      {#if !shownAnswer}
        <div class="retrieva-reveal-actions">
          <button class="retrieva-action" onclick={reveal}>{t("review.showAnswer")}</button>
        </div>
      {:else if answerContext}
        <div class="retrieva-ratings">
          {#each RATINGS as rating (rating)}
            <button
              class="retrieva-rating retrieva-action retrieva-{rating}"
              onclick={() => submitAnswer(rating)}
            >
              <span>{t(`review.${rating}`)}</span>
              <small>{formatDue(answerContext.candidates[rating], answerContext.now)}</small>
            </button>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
{:else if !current}
  <div class="retrieva-review-content">
    {#if skippedCount > 0 && !skippedFinished}
      <h2>{t("review.skipped", { count: skippedCount })}</h2>
      <div class="retrieva-skipped-actions">
        <button onclick={retrySkipped}>{t("review.retrySkipped")}</button>
        <button onclick={finishSkipped}>{t("review.finishSkipped")}</button>
      </div>
    {:else}
      <h2>{t("review.complete")}</h2>
      {#if queue.nextDue}
        <p>
          {t("review.nextDue", {
            due:
              queue.nextDue.kind === "day"
                ? queue.nextDue.date
                : new Date(queue.nextDue.at).toLocaleString(),
          })}
        </p>
      {/if}
    {/if}
  </div>
{/if}
