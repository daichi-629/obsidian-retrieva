# Retrieva

Retrieva is a Markdown-native spaced-repetition plugin for Obsidian. It schedules reviews with FSRS while keeping card content, identifiers, and review history in ordinary files inside your vault.

## Features

- Schedule new, learning, review, and relearning cards with FSRS.
- Keep the question and answer in source notes by embedding headings or block IDs.
- Rebuild all card state from Markdown without an external database.
- Select review decks by tag, with card counts and nested-tag support.
- Skip a card for the current session without changing its review history.
- Manage long-term suspended cards in a dedicated view.
- Create forward cards or linked front/back pairs from Obsidian commands.
- Exclude vault directories from indexing and damaged-card detection.
- Validate and repair malformed card metadata and linear JSONL review history.
- Install a project-level skill that teaches Codex and Claude Code the card format.
- Use the interface in English or Japanese.

Retrieva supports desktop and mobile Obsidian. It requires Obsidian 1.6.0 or later.

## Installation

### Community plugins

Once Retrieva is listed in the Obsidian Community directory:

1. Open **Settings → Community plugins**.
2. Select **Browse**, search for **Retrieva**, and install it.
3. Enable **Retrieva**.

### Manual installation

Download `main.js`, `manifest.json`, and `styles.css` from the matching GitHub release and place them in:

```text
<Vault>/.obsidian/plugins/retrieva/
```

Reload Obsidian and enable Retrieva under **Community plugins**.

## Quick start

1. Run **Retrieva: Create card** from the command palette.
2. Enter Obsidian embeds for the front and back, such as `![[Biology#Question]]` and `![[Biology#Answer]]`.
3. Choose an existing FSRS preset and create the card.
4. Run **Retrieva: Open review scope picker**.
5. Select a tag and start reviewing.

Use **Retrieva: Create front/back card pair** when both directions should be reviewed. Retrieva assigns the pair a shared sibling group so related cards can be kept out of the same review session.

## Card format

Each card is one Markdown file. User-owned content looks like this before Retrieva initializes it:

```markdown
---
retrieva-preset: default
tags:
  - retrieva-card
  - biology
---

![[Biology#Question]]

<!--RETRIEVA-ANSWER-->

![[Biology#Answer]]
```

When the plugin first indexes the card, it adds a UUIDv7 card ID and a `created` event. Later reviews append immutable JSONL events to the same file. Avoid manually changing `RETRIEVA-CARD` and `RETRIEVA-LOG` blocks; use the recovery view if machine metadata is damaged.

Cards may live anywhere in the vault. The `retrieva-card` tag and a valid `retrieva-preset` reference identify them.

## Review scopes

The scope picker shows tags used by valid Retrieva cards and the number of cards included by each tag. Selecting a parent tag also includes cards under nested tags. Frequently used scopes can be saved with a display name.

Queue counts show cards ready now and the total number of valid cards in the selected scope. Suspended and sibling-excluded cards remain outside the active queue.

**Skip** moves a card out of the current pass without writing an event. After the remaining cards are reviewed, choose whether to retry the skipped cards or finish for today. **Suspend** is persistent and writes a state event; use **Retrieva: Open suspended cards** to open or resume suspended cards.

## Presets

On first load, Retrieva creates `Retrieva/Presets/default.md`. Presets are Markdown files with frontmatter for:

- desired retention;
- maximum interval in days;
- learning and relearning steps;
- same-day exclusion of new or reviewed sibling cards.

Preset IDs must be unique. Cards that reference a missing or invalid preset appear in the recovery view.

## Settings

- **Default cards folder**: Where cards created by Retrieva commands are stored. This does not restrict cards created elsewhere.
- **Excluded directories**: Vault-relative directories to ignore, one per line. Cards, presets, and damaged marker-like text inside these directories are not indexed or modified.
- **Show ribbon icon**: Adds a shortcut for the review scope picker.
- **Exclude new/review siblings today**: Overrides the corresponding preset behavior.
- **Saved scopes**: Named tag shortcuts for review sessions.
- **LLM project skills**: Installs or updates the bundled Retrieva skill for Codex and Claude Code.

## Validation and recovery

Run **Retrieva: Validate cards in vault** to find malformed markers, invalid JSONL rows, duplicate IDs, missing presets, and branched review history. The recovery view can open the affected file, generate missing initialization metadata, reissue duplicate card IDs, or sort events and regenerate their parent chain.

Back up or version-control your vault before repairing manually edited review logs.

## Codex and Claude Code skill

In Retrieva settings, select **Install / update** under **LLM project skills**. The plugin writes the bundled skill to:

```text
.agents/skills/retrieva/SKILL.md
.claude/skills/retrieva/SKILL.md
```

If an existing file differs, Retrieva asks before replacing it. The skill instructs an agent to follow the vault's card-location conventions, ask when the destination is unclear, preserve review history, and let Retrieva generate machine IDs.

This repository also includes manifests for loading the same skill as a Codex or Claude Code plugin.

## Data and privacy

Retrieva:

- reads and writes Markdown files only inside the current vault;
- stores review state in card Markdown and UI settings through Obsidian's plugin data API;
- writes the two hidden project-skill paths above only after an explicit user action;
- makes no network requests;
- collects no analytics or telemetry;
- requires no account, payment, advertisement, or external service.

Deleting Retrieva's plugin settings does not delete card history because the history remains in Markdown.

## Development

```sh
npm install
npm run format:check
npm test
npm run build
```

The host-independent parser and scheduler integration live under `src/core`. Obsidian adapters and UI components live under `src/obsidian` and `src/ui`. User-facing strings are stored under `src/i18n/locales`, with English as the fallback locale.

Releases use semantic version tags without a `v` prefix and attach `main.js`, `manifest.json`, `styles.css`, and a convenience ZIP archive.

## License

[MIT](LICENSE)
