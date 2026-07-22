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

Create cards in the configured cards folder (the default is `Cards`). A valid card has exactly one answer marker, one card marker, and one log block:

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

<!--RETRIEVA-CARD {"v":1,"id":"UUIDV7_CARD_ID"}-->

<!--RETRIEVA-LOG
{"v":1,"eid":"UUIDV7_EVENT_ID","type":"created","parent":null,"at":"RFC3339_OFFSET_DATETIME","zone":"IANA_TIME_ZONE","state":{"v":1,"phase":"new","due":null,"interval":0,"stability":null,"difficulty":null,"reps":0,"lapses":0,"learningStep":0,"suspended":false}}
RETRIEVA-LOG-->
```

When creating a card manually:

1. Generate distinct UUIDv7 values for the card `id` and created event `eid`.
2. Use an RFC 3339 timestamp with an explicit UTC offset for `at`, and an IANA name such as `Asia/Tokyo` for `zone`.
3. Keep each JSONL event on one physical line.
4. Add `retrieva-card` to `tags`; additional topic tags are welcome.
5. Use an existing `retrieva-preset` ID. Use `default` unless the project indicates another preset.

For a forward/reverse pair, create two card files with swapped embeds, unique card/event IDs, and the same UUIDv7 sibling group in frontmatter:

```yaml
retrieva-preset: default
retrieva-sibling-group: UUIDV7_SHARED_GROUP_ID
tags:
  - retrieva-card
```

Do not infer sibling relationships from shared source notes. Only identical `retrieva-sibling-group` values make cards siblings.

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
