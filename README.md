# Retrieva

Retrieva is a Markdown-native spaced-repetition plugin for Obsidian. Card content stays in source notes; one Markdown file per card stores embed directions, a stable card ID, and a linear JSONL review history. The in-memory index can always be rebuilt from the vault.

## Use

1. Run **Retrieva: Create card** or **Create front/back card pair** from the command palette.
2. Enter Obsidian embeds for the front and back, such as `![[Biology#Question]]`.
3. Run **Retrieva: Open review scope picker**, choose one tag, and start reviewing.
4. If a card is damaged after a merge or manual edit, run **Validate cards in vault** and repair its JSONL history in the recovery view.

Presets are ordinary Markdown files. On first load, Retrieva creates `Retrieva/Presets/default.md`. Edit that file to change FSRS retention, maximum interval, learning steps, relearning steps, or sibling exclusion.

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
