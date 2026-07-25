<script lang="ts">
  import { Notice } from "obsidian";
  import {
    MARKERS,
    parseCardMarkdown,
    parseEvent,
    sortAndRegenerateParents,
    validateLinearHistory,
    type CardEvent,
  } from "../core";
  import { t } from "../i18n";
  import type RetrievaPlugin from "../main";

  interface Props {
    plugin: RetrievaPlugin;
  }
  const { plugin }: Props = $props();

  let refreshToken = $state(0);
  let selectedPath = $state<string | null>(null);
  let draft = $state("");

  $effect(() => plugin.index.onChange(() => (refreshToken += 1)));

  const paths = $derived.by(() => {
    void refreshToken;
    return [...plugin.index.invalid.keys()].sort();
  });
  const errors = $derived.by(() => {
    void refreshToken;
    return selectedPath ? (plugin.index.invalid.get(selectedPath) ?? []) : [];
  });
  const hasParsed = $derived.by(() => {
    void refreshToken;
    return selectedPath ? plugin.index.parsed.has(selectedPath) : false;
  });

  async function loadDraft(): Promise<void> {
    if (!selectedPath) return;
    const file = plugin.index.files.get(selectedPath);
    if (!file) return;
    const parsed = parseCardMarkdown(file.path, await plugin.index.files.readFresh(file));
    draft = parsed.rawEventLines.join("\n");
  }

  function onSelectChange(event: Event & { currentTarget: HTMLSelectElement }): void {
    selectedPath = event.currentTarget.value || null;
    void loadDraft();
  }

  function openSelectedFile(): void {
    if (!selectedPath) return;
    void plugin.openFile(selectedPath);
  }

  async function repair(reissue: boolean): Promise<void> {
    if (!selectedPath) return;
    try {
      await plugin.repository.repairMetadata(selectedPath, reissue);
      await loadDraft();
    } catch (error) {
      new Notice(String(error));
    }
  }

  function onDraftInput(event: Event & { currentTarget: HTMLTextAreaElement }): void {
    draft = event.currentTarget.value;
  }

  function parseDraft(): CardEvent[] | null {
    const events: CardEvent[] = [];
    for (const [index, line] of draft.split(/\r?\n/).entries()) {
      if (!line.trim()) continue;
      try {
        const result = parseEvent(JSON.parse(line));
        if (!result.event) throw new Error(result.error);
        events.push(result.event);
      } catch (error) {
        new Notice(t("recovery.line", { line: index + 1, message: String(error) }));
        return null;
      }
    }
    return events;
  }

  function sort(): void {
    const events = parseDraft();
    if (!events) return;
    draft = sortAndRegenerateParents(events)
      .map(event => JSON.stringify(event))
      .join("\n");
  }

  function validate(): void {
    const events = parseDraft();
    if (!events) return;
    const validationErrors = validateLinearHistory(events);
    new Notice(
      validationErrors.length
        ? validationErrors.map(error => error.message).join("\n")
        : t("recovery.valid"),
    );
  }

  async function save(): Promise<void> {
    if (!selectedPath) return;
    const events = parseDraft();
    if (!events) return;
    const validationErrors = validateLinearHistory(events);
    if (validationErrors.length) {
      new Notice(validationErrors.map(error => error.message).join("\n"));
      return;
    }
    const file = plugin.index.files.get(selectedPath);
    if (!file) return;
    const source = await plugin.index.files.readFresh(file);
    const parsed = parseCardMarkdown(file.path, source);
    const start = source.indexOf(MARKERS.logStart);
    const end = source.indexOf(MARKERS.logEnd, start + MARKERS.logStart.length);
    if (start < 0 || end < 0) {
      new Notice(t("recovery.fixMarkers"));
      return;
    }
    const replacement = `${MARKERS.logStart}${parsed.newline}${events.map(event => JSON.stringify(event)).join(parsed.newline)}${parsed.newline}`;
    const repaired = source.slice(0, start) + replacement + source.slice(end);
    await plugin.index.files.write(file, repaired);
    await plugin.index.refresh(file.path);
    if (plugin.index.invalid.has(file.path)) new Notice(t("recovery.stillInvalid"));
    else {
      new Notice(t("recovery.repaired"));
      selectedPath = null;
      draft = "";
    }
  }
</script>

<h2>{t("recovery.title")}</h2>
{#if paths.length === 0}
  <p>{t("recovery.empty")}</p>
{:else}
  <select value={selectedPath ?? ""} onchange={onSelectChange}>
    <option value="">{t("recovery.choose")}</option>
    {#each paths as path (path)}
      <option value={path}>{path}</option>
    {/each}
  </select>
  {#if selectedPath}
    <ul>
      {#each errors as error, i (i)}
        <li>
          {error.line
            ? t("recovery.line", { line: error.line, message: error.message })
            : error.message}
        </li>
      {/each}
    </ul>
    {#if !hasParsed}
      <div class="retrieva-form-row retrieva-form-row-end">
        <button class="mod-cta" onclick={openSelectedFile}>{t("recovery.openPreset")}</button>
      </div>
      <p class="mod-muted">{t("recovery.fixPreset")}</p>
    {:else}
      <div class="retrieva-toolbar-actions">
        <button onclick={openSelectedFile}>{t("recovery.openFile")}</button>
        <button onclick={loadDraft}>{t("common.reload")}</button>
        <button onclick={() => repair(false)}>{t("recovery.generate")}</button>
        <button onclick={() => repair(true)}>{t("recovery.reissue")}</button>
      </div>
      <textarea class="retrieva-editor" value={draft} oninput={onDraftInput}></textarea>
      <div class="retrieva-toolbar-actions">
        <button onclick={sort}>{t("recovery.sort")}</button>
        <button onclick={validate}>{t("common.validate")}</button>
        <button class="mod-cta" onclick={save}>{t("recovery.save")}</button>
      </div>
      <p class="mod-muted">{t("recovery.help")}</p>
    {/if}
  {/if}
{/if}
