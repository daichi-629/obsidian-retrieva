# Retrieva User Guide

Retrieva is a spaced-repetition plugin for Obsidian that stores cards and review history in Markdown files inside your vault. It uses FSRS to calculate review intervals. No external database, account, or network connection is required.

## Requirements and installation

- Obsidian 1.13.0 or later
- Supports both desktop and mobile Obsidian

Once Retrieva is listed under Community plugins, open **Settings → Community plugins → Browse**, search for “Retrieva,” install it, and enable it.

For a manual installation, download `main.js`, `manifest.json`, and `styles.css` from the same GitHub Release and place them in:

```text
<Vault>/.obsidian/plugins/retrieva/
```

Reload Obsidian, then enable Retrieva under **Settings → Community plugins**.

## Create your first card

### 1. Write a source note

Write the question and answer in an ordinary note under headings or with block IDs. Source notes do not require Retrieva-specific syntax.

```markdown
# Question

What is spaced repetition?

# Answer

A learning method that schedules reviews near the time the material would otherwise be forgotten.
```

### 2. Create a card

Run **Retrieva: Create card** from the command palette and enter:

- **Front embed**: `![[Study note#Question]]`
- **Back embed**: `![[Study note#Answer]]`
- **Filename**: the name of the card file
- **Preset**: normally `default`

When you run the command from an active note, embeds pointing to `#Front` and `#Back` in that note are provided as initial values. Change them as needed.

Retrieva creates one Markdown file in the **Default cards folder** and opens it. It does not overwrite a file with the same name.

To learn the same material in both directions, use **Retrieva: Create front/back card pair**. Retrieva creates two files with the front and back reversed and assigns them to the same sibling group.

### 3. Add a deck tag

Every card created by Retrieva automatically receives the `retrieva-card` tag. To make the card available as a review scope, add any tags you want to its frontmatter.

```yaml
tags:
  - retrieva-card
  - biology
  - exam/biology
```

`retrieva-card` identifies the file as a card. Tags such as `biology` and `exam/biology` are used to select a deck. Cards can live in any vault directory; they are not limited to the default `Cards` directory.

## Review cards

### Choose a review scope

Select the brain icon in the ribbon or run **Retrieva: Open review scope picker** from the command palette.

“Tags used by Retrieva cards” shows the tags used by currently valid cards and their card counts. Select a tag and choose **Start**. You can also type a tag directly into the field.

Selecting a parent tag includes its nested tags. For example, selecting `exam` also includes cards tagged `exam/biology` or `exam/history`.

Counts are displayed as **cards ready now / total valid cards in the selected scope**. The total includes cards scheduled for the future, while suspended cards and siblings excluded for the day do not enter the review queue.

Enable “Save with a name” to open the same tag scope with one action next time. You can also edit or delete saved scopes in Retrieva settings.

### Answer a card

1. Read the front of the card.
2. Tap or select the card area to reveal the answer.
3. Choose a rating at the bottom of the view.

There are four ratings. Each button also shows the next due time that would result from choosing it.

| Rating | Guideline                                         |
| ------ | ------------------------------------------------- |
| Again  | You could not recall the answer                   |
| Hard   | You recalled it, but with considerable difficulty |
| Good   | You recalled it correctly                         |
| Easy   | You recalled it immediately and confidently       |

After you rate a card, Retrieva appends a review event to the card file and advances to the next card.

### Skip, suspend, and undo

- **Skip**: Temporarily removes the card from the rest of the current session. It does not write a history event. After you finish the other cards, choose whether to retry the skipped cards or finish for today.
- **Suspend**: Persistently removes the card from future review queues. Retrieva appends a suspend event to its history.
- **Undo last review**: Reverts the most recent rating in the current session. Undo is unavailable if the card file changed after the rating or the review has already been undone.

Use **Open card file** in the toolbar when you want to inspect or edit the card content. From **Suspended cards**, you can open a suspended card file or return the card to review.

## Card storage format

Each card is stored in one Markdown file. A fully managed Retrieva card has approximately this structure:

```markdown
---
retrieva-preset: default
tags:
  - retrieva-card
  - biology
---

![[Study note#Question]]

<!--RETRIEVA-ANSWER-->

![[Study note#Answer]]

<!--RETRIEVA-CARD {"v":1,"id":"..."}-->

<!--RETRIEVA-LOG
{"v":1,"eid":"...","type":"created","parent":null,"at":"...","zone":"...","state":{...}}
RETRIEVA-LOG-->
```

You may edit:

- deck tags in frontmatter;
- `retrieva-preset`;
- the front, before `RETRIEVA-ANSWER`; and
- the back, after `RETRIEVA-ANSWER` and before `RETRIEVA-CARD`.

Retrieva manages the following fields, so do not normally edit them:

- `retrieva-sibling-group`;
- the card ID in `RETRIEVA-CARD`; and
- the JSONL history inside `RETRIEVA-LOG`.

Each marker must occur exactly once in a card. Writing the same marker strings in card prose or code examples may cause Retrieva to identify the card as damaged.

### Create a card manually or with an LLM

You can create a card without the plugin modal by writing this minimal form:

```markdown
---
retrieva-preset: default
tags:
  - retrieva-card
  - topic/example
---

![[Source note#Question]]

<!--RETRIEVA-ANSWER-->

![[Source note#Answer]]
```

When Retrieva first indexes this file, it automatically generates a UUIDv7 card ID and a `created` event. Do not create IDs, logs, or sibling groups manually or with an LLM. Use the plugin’s **Create front/back card pair** command for a paired card.

## Presets

On first use, Retrieva automatically creates `Retrieva/Presets/default.md`. A preset is a Markdown file separate from the cards.

```markdown
---
retrieva-preset-definition: true
retrieva-preset-id: default
scheduler: fsrs
desired-retention: 0.9
maximum-interval-days: 36500
learning-steps:
  - 1m
  - 10m
relearning-steps:
  - 10m
exclude-new-siblings-today: true
exclude-review-siblings-today: true
---

# Default SRS preset
```

| Field                           | Meaning                                                      |
| ------------------------------- | ------------------------------------------------------------ |
| `retrieva-preset-id`            | A unique ID referenced by `retrieva-preset` on cards         |
| `scheduler`                     | Currently, only `fsrs` is supported                          |
| `desired-retention`             | Target retention between 0.7 and 0.99                        |
| `maximum-interval-days`         | Maximum review interval as a positive integer number of days |
| `learning-steps`                | Short-term steps for new learning, such as `1m` and `10m`    |
| `relearning-steps`              | Steps used to relearn forgotten material                     |
| `exclude-new-siblings-today`    | Do not show another new sibling on the same day              |
| `exclude-review-siblings-today` | Do not show another reviewed sibling on the same day         |

Preset IDs must be unique within the vault. Use **Preset files** in Retrieva settings to open recognized presets.

The sibling-exclusion toggles in Retrieva settings currently override the corresponding fields in every preset.

## Settings

Open **Settings → Retrieva** to change these options.

| Setting                       | Description                                                                                                                   |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Default cards folder          | Vault-relative path where Retrieva creation commands save new cards. It does not restrict where existing cards are recognized |
| Excluded directories          | Vault-relative directories that will not be indexed, one per line                                                             |
| Show ribbon icon              | Shows a shortcut that opens the review scope picker                                                                           |
| Exclude new siblings today    | After rating a new card, excludes other cards in the same sibling group for the day                                           |
| Exclude review siblings today | After rating a review card, excludes other cards in the same sibling group for the day                                        |
| Saved scopes                  | Adds, edits, or deletes named tag scopes                                                                                      |
| LLM project skill             | Installs the Retrieva format instructions for Codex and Claude Code in the vault                                              |

Retrieva does not detect, initialize, or repair cards, presets, or damaged marker candidates inside excluded directories. Excluding large archives, templates, or backup directories can prevent false positives and unnecessary reads. The index is rebuilt when the excluded-directories field loses focus.

## Command reference

| Command                                | Action                                                        |
| -------------------------------------- | ------------------------------------------------------------- |
| Open review scope picker               | Select a tag and start reviewing                              |
| Create card                            | Create one card from a front and back                         |
| Create front/back card pair            | Create two sibling cards in opposite directions               |
| Rebuild card index                     | Reload the applicable Markdown files in the vault             |
| Validate cards in vault                | Inspect cards and presets, then open the recovery view        |
| Reset active card                      | Append an event that returns the active card to the new state |
| Suspend or resume active card          | Toggle suspension for the active card                         |
| Open suspended cards                   | Show the suspended-card list                                  |
| Set up Codex and Claude project skills | Install or update the LLM skill files                         |

Commands that operate on the “active card” are available only when the active Markdown file is a valid Retrieva card. Resetting does not delete previous history; it appends a reset event.

## Validation and recovery

**Retrieva: Validate cards in vault** primarily detects:

- missing, duplicate, or incorrectly ordered required markers;
- invalid frontmatter or event JSON;
- duplicate card IDs or event IDs;
- a missing `created` event;
- disconnected event `parent` values or branched history;
- missing, invalid, or duplicate presets; and
- files with Retrieva markers but without the `retrieva-card` tag.

Depending on the problem, the recovery view lets you:

- generate a missing card ID and `created` event;
- reissue a duplicate card ID;
- sort events by time and regenerate their `parent` values; and
- validate and save JSONL history.

The history editor expects one JSON object per line. It cannot decide which event from an unwanted branch should be retained, so remove events only after deciding which history is correct. Back up or version-control your vault before repairing history.

If the markers themselves are damaged, first open the card file and repair them directly. For preset problems, fix the preset frontmatter and rebuild the card index.

## Codex and Claude Code integration

Use **LLM project skill → Install / update** in Retrieva settings, or run the corresponding command, to write these files into the vault:

```text
.agents/skills/retrieva/SKILL.md
.claude/skills/retrieva/SKILL.md
```

Retrieva leaves an existing file unchanged when its contents already match. If the contents differ, it displays a confirmation dialog before replacing the entire file.

The skill instructs an LLM to follow the vault’s existing rules and card locations, ask the user when the destination is unclear, preserve review history, and leave machine-managed IDs to Retrieva.

## Data, privacy, and performance

Cards can live in any directory. To support this, Retrieva enumerates and reads the vault’s Markdown files when you first open a Retrieva view or use a card-related command. It does not start indexing immediately when the plugin is enabled.

- Card indexing does not enumerate non-Markdown files.
- Files under configured excluded directories are not read.
- File changes are monitored and reflected in the index.
- Data stays in the current vault and Obsidian’s plugin settings.
- Retrieva makes no network requests and includes no telemetry, advertising, or external services.

If the initial view is slow in a large vault, add large directories that never contain cards to **Excluded directories**.

## Frequently asked questions

### Are cards recognized outside `Cards/`?

Yes. Cards can live anywhere in the vault. They need the `retrieva-card` tag, a valid `retrieva-preset`, and a valid card structure. Cards under excluded directories are not recognized.

### Can I move or rename a source note?

If Obsidian’s automatic link updating is enabled, embeds normally follow the move like other Obsidian links. After moving a note, open the card and confirm that the embeds still render correctly.

### Where should I edit a card’s question or answer?

When the card uses embeds, editing the source note is the safest approach. You may also edit the front or back in the card file, but do not change the machine-managed markers or log.

### Does skipping change the next due date?

No. Skip applies only to the current session. It writes no event and does not change the FSRS state.

### Is it normal for the log to grow when I repeatedly suspend and resume a card?

Yes. Each suspension and resumption appends one state-change event. This allows Retrieva to reconstruct both the current state and its change history from Markdown. Use Skip instead when you only want to postpone a card temporarily.

### Does deleting plugin settings also delete review history?

No. Review history remains in each card’s Markdown file. UI settings such as saved scopes and the default cards folder are lost.

### How is the display language selected?

Retrieva uses Japanese when Obsidian’s locale is Japanese and English otherwise. Missing translations fall back to English.

## Safe-use checklist

1. Keep knowledge in ordinary source notes and embed it into cards.
2. Add `retrieva-card` and a deck tag to each card.
3. Do not edit `RETRIEVA-CARD` or `RETRIEVA-LOG`.
4. Use Skip for temporary postponement and Suspend for long-term removal.
5. Back up the vault before repairing history manually.
