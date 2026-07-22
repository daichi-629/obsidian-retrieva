# Retrieva

Retrieva is a Markdown-native spaced-repetition plugin for Obsidian. Card content stays in source notes; one Markdown file per card stores embed directions, a stable card ID, and a linear JSONL review history. The in-memory index can always be rebuilt from the vault.

## Use

1. Run **Retrieva: Create card** or **Create front/back card pair** from the command palette.
2. Enter Obsidian embeds for the front and back, such as `![[Biology#Question]]`.
3. Run **Retrieva: Open review scope picker**, choose one tag, and start reviewing.
4. If a card is damaged after a merge or manual edit, run **Validate cards in vault** and repair its JSONL history in the recovery view.

Presets are ordinary Markdown files. On first load, Retrieva creates `Retrieva/Presets/default.md`. Edit that file to change FSRS retention, maximum interval, learning steps, relearning steps, or sibling exclusion.

## LLM skill

The bundled `retrieva` skill teaches Codex and Claude Code how to create source notes, cards, pairs, and presets without damaging review history. In Retrieva settings, press **Install / update** under **LLM project skills** to write it into both `.agents/skills/retrieva/SKILL.md` and `.claude/skills/retrieva/SKILL.md` in the current vault.

This repository is also a directly loadable Codex and Claude Code plugin. Claude Code users can add the private repository as a marketplace and install `retrieva`; Codex users can install the repository as a plugin.

## Data and privacy

Retrieva reads and writes only files in the current vault through the Obsidian Vault API. It makes no network requests, collects no telemetry, and stores no review state outside card Markdown. Plugin data contains only UI settings and saved tag shortcuts; deleting it does not delete card state.

## Development

```sh
npm install
npm run format:check
npm test
npm run build
```

The host-independent implementation is under `src/core`. Obsidian file and UI adapters live separately under `src/obsidian` and `src/ui`.

User-facing text is stored by locale under `src/i18n/locales`. English is the fallback when the current Obsidian language has no matching locale file.
