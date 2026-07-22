---
name: retrieva
description: Create and edit notes and spaced-repetition cards for the Retrieva Obsidian plugin. Use when working with Retrieva cards, source notes, presets, review logs, or the retrieva-card tag.
---

# Retrieva notes and cards

Retrieva is Markdown-native. Keep knowledge in ordinary source notes and create one separate Markdown file per card. A card normally embeds headings or block IDs from a source note instead of copying the knowledge.

## Source notes

Source notes require no Retrieva-specific syntax. Prefer stable headings or Obsidian block IDs that a card can embed:

```markdown
# Question

What is spaced repetition?

# Answer

A review method that schedules material near the time it would otherwise be forgotten.
```

Card references can be `![[Note#Question]]` and `![[Note#Answer]]`. For paragraph-sized content, add block IDs such as `^front` and `^back`, then use `![[Note#^front]]`.

## Card files

Place card files according to the vault's existing instructions and organization. Inspect project guidance and existing card locations; do not assume a fixed card directory. If the intended location cannot be determined, ask the user before creating a card. When an LLM creates a card, write only the user-owned frontmatter, front, answer marker, and back:

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

Retrieva detects this uninitialized card the first time it reads it and adds the UUIDv7 card ID and created event itself. Do not generate or write `RETRIEVA-CARD` or `RETRIEVA-LOG` metadata.

When creating a card:

1. Add `retrieva-card` to `tags`; additional topic tags are welcome.
2. Use an existing `retrieva-preset` ID. Use `default` unless the project indicates another preset.
3. Include exactly one `<!--RETRIEVA-ANSWER-->` marker.

For a forward/reverse pair, use Retrieva's **Create front/back card pair** command so Retrieva can assign the machine IDs and shared sibling group. Do not invent a `retrieva-sibling-group`; cards created directly without one remain independent cards.

## Editing safety

- Freely edit the source note. This is the preferred way to change card content.
- A card's content is everything between frontmatter and `<!--RETRIEVA-ANSWER-->` for the front, and between that marker and `<!--RETRIEVA-CARD ...-->` for the back.
- Never change an existing card ID unless explicitly repairing a duplicate.
- Never fabricate, reorder, reformat, or delete review events. Retrieva owns normal log writes. Preserve the entire `RETRIEVA-LOG` block byte-for-byte when editing embeds, tags, or prose.
- Do not put the answer/card/log marker strings in prose or code samples inside a card file; each marker must occur exactly once.
- One card belongs in one file. Do not place multiple card definitions in a Markdown file.

## Presets

Preset definitions normally live under `Retrieva/Presets`:

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

Preset IDs must be unique. The scheduler is `fsrs`; desired retention must be between 0.7 and 0.99; maximum interval must be a positive integer.

After creating or changing card files, ask the user to run **Retrieva: Rebuild card index** or **Retrieva: Validate cards in vault** in Obsidian.
